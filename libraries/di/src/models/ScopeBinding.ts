import { type Behavior, Control, type Hooks, type IEngineHooks, type IServiceProvider, LifetimeModelError } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { AbstractCtor, Func } from '@rhombus-toolkit/func';
import { askForControl, isControlAsk } from '../internal/control-recognition.js';
import { ServiceProvider } from '../ServiceProvider.js';
import { classifyingHooks } from './classifying-hooks.js';
import { evictOnReject } from './evict-on-reject.js';
import type { Scope } from './Scope.js';

/**
 * Where each construction's instance is kept, which scope its dependencies resolve under, and the
 * provider an `IServiceProvider` slot beneath it names.
 *
 * @remarks
 * The opening seed answers `scope` only when the resolution arrived carrying no state of its own,
 * so a re-entering call keeps the position it was minted at.
 */
function keeping(scope: Scope): Behavior<Scope> {
  const hooks = classifyingHooks<Scope>({
    beforeConstruct({ populatedAddress, registration, state }) {
      // Without a registration the engine, not the manifest, is answering: nothing here is kept by a scope.
      if (registration === undefined) {
        if (populatedAddress === typefor<IServiceProvider>() && state.provider) {
          return { result: state.provider };
        }
        return { state: state };
      }
      const owner = state.selectOwningScope(registration, populatedAddress);
      if (owner === undefined) {
        return { state: state };
      }
      return owner.findOwnedInstance(registration, populatedAddress) ?? { state: owner };
    },

    afterConstruct({ populatedAddress, registration, state }, instance) {
      if (registration === undefined) {
        return;
      }
      state.selectOwningScope(registration, populatedAddress)?.claimInstance(registration, populatedAddress, instance);
    },
  });

  return {
    beginResolve: (_request: Type, injected: Scope) => injected ?? scope,
    beforeConstruct: hooks.beforeConstruct,
    afterConstruct: hooks.afterConstruct,
  };
}

/**
 * Watches what `scope` itself turns out to keep — a hit in its own cache, or a construction it
 * claimed — telling `learn` the address and the instance settled on.
 *
 * @remarks
 * Only what this very scope keeps is learned: a transient settles on no scope, an instance a hook
 * supplied in place of one was kept by nobody, and a construction another scope owns is that scope's
 * to answer for. That last is what keeps a resolution opened inside a nested scope from teaching
 * anything to the scope enclosing it.
 */
function probing(scope: Scope, learn: Func<[Type, unknown], void>): Behavior<Scope> {
  /**
   * The scope keeping this construction, absent where nothing keeps it.
   *
   * @throws {LifetimeModelError} when the model refuses the registration's lifetime.
   */
  function selectKeeper({ populatedAddress, registration, state }: Hooks.Construction<Scope>): Scope | undefined {
    if (registration === undefined) {
      return undefined;
    }
    try {
      return state.selectOwningScope(registration, populatedAddress);
    } catch (error) {
      throw new LifetimeModelError(populatedAddress, error);
    }
  }

  return {
    // The probe threads by the keeper's own rule so that it stands at the same position in the
    // scope chain: what it reads of a construction is what the keeper read of it.
    beginResolve: (_request: Type, injected: Scope) => injected ?? scope,

    beforeConstruct(construction, next) {
      const answer = next(construction);
      if ('result' in answer) {
        if (selectKeeper(construction) === scope) {
          learn(construction.populatedAddress, answer.result);
        }
        return answer;
      }
      return { state: selectKeeper(construction) ?? construction.state };
    },

    afterConstruct(construction, instance, next) {
      next(construction, instance);
      if (selectKeeper(construction) === scope) {
        learn(construction.populatedAddress, instance);
      }
    },
  };
}

/** Every public face this module has minted, and the binding behind it. */
const bindings = new WeakMap<IServiceProvider, ScopeBinding<any>>();

/**
 * One scope's own resolution machinery: its bracket, its memo, and the public face wrapping it.
 *
 * @remarks
 * Everything asked through {@link face} carries this scope's keeping beneath whatever else reaches
 * it, and what the scope turns out to keep is answered straight from here on every later ask.
 *
 * @typeParam S - the scope this binding resolves from.
 */
export class ScopeBinding<S extends Scope = Scope> {
  readonly #scope: S;
  readonly #hooks: IEngineHooks;
  readonly #keeping: Behavior<Scope>;
  readonly #probing: Behavior<Scope>;
  /**
   * What each address this scope turned out to keep settled on, so asking for it again opens
   * nothing.
   *
   * @remarks
   * Only committed once the proposed pair matches what the dispatch itself actually returns — a
   * construction reached along the way at the same address (a lazily-drained collection element,
   * realized inside a later dispatch of that same address through hooks a held `Iterable` captured
   * earlier) proposes an instance nobody asked for, and is refused. Two consequences follow: a
   * `use()` middleware that decorates its own address is never fast-pathed here — the raw instance
   * probing sees never equals what the middleware hands back — so it keeps running on every ask
   * (correctness holds regardless, since this memo bypasses everything for what it does learn); and
   * a union-addressed ask never memoizes at all, since `populatedAddress` is the resolved member,
   * never the union asked for — perf-only, the scope's own instance map still answers it correctly.
   */
  readonly #learnedAnswers = new Map<Type, unknown>();
  /**
   * The address the innermost {@link dispatch} call still on the stack was asked for — a nested
   * dispatch through this same binding shadows it for its own duration, restored once that nested
   * call returns.
   */
  #dispatchedAddress: Type | undefined;
  /**
   * The `[address, instance]` pair {@link probing} proposes for the innermost {@link dispatch} call
   * still on the stack, committed to {@link #learnedAnswers} only once that dispatch's own return
   * value matches — shadowed and restored the same way as {@link #dispatchedAddress}.
   */
  #pending: readonly [Type, unknown] | undefined;
  /** What every ask through {@link face} runs, brackets included. */
  readonly dispatch: Func<[Type], unknown>;
  /** The augmented, user-facing provider resolving from this scope. */
  readonly face: ServiceProvider;

  /** Binds `scope` over `next`, the shared chain every scope of this model wraps. */
  constructor(next: Func<[Type], unknown>, scope: S) {
    this.#scope = scope;
    this.#hooks = askForControl<IEngineHooks>({ getService: next }, typefor<Control<IEngineHooks>>());
    this.#keeping = keeping(scope);
    // Only a construction answering the address this dispatch was itself asked for is even
    // proposed — never a dependency reached along the way, whose own address is someone else's to
    // answer for (a collection member sharing the element address, a middleware's own top-level
    // address). The proposal is provisional: dispatch commits it only if it matches what that
    // dispatch itself returns.
    this.#probing = probing(scope, (address, instance) => {
      if (address === this.#dispatchedAddress) {
        this.#pending = [address, instance];
      }
    });

    this.dispatch = address => {
      if (!address) {
        throw new TypeError('a scope dispatch received no address — the caller resolved without a service type');
      }
      if (isControlAsk(address)) {
        return next(address);
      }
      // Ahead of the memo, so what this scope learned to answer straight away is refused too: after
      // teardown nothing resolves from here, however short the path to the answer would have been.
      if (this.#scope.disposed) {
        throw new LifetimeModelError(address, this.#scope.mintDisposedError(address));
      }
      if (this.#learnedAnswers.has(address)) {
        return this.#learnedAnswers.get(address);
      }
      const enclosingAddress = this.#dispatchedAddress;
      const enclosingPending = this.#pending;
      this.#dispatchedAddress = address;
      this.#pending = undefined;
      try {
        using _probing = this.#hooks.useHooks(this.#probing);
        using _keeping = this.#hooks.useHooks(this.#keeping);
        const answer = next(address);
        if (this.#pending && this.#pending[0] === address && this.#pending[1] === answer) {
          this.#learnedAnswers.set(address, answer);
          evictOnReject(answer, () => {
            if (this.#learnedAnswers.get(address) === answer) {
              this.#learnedAnswers.delete(address);
            }
          });
        }
        return answer;
      } finally {
        this.#dispatchedAddress = enclosingAddress;
        this.#pending = enclosingPending;
      }
    };

    this.face = new ServiceProvider(this.dispatch);
    // Minted onto this one face rather than declared on `ServiceProvider`: teardown belongs to the
    // model, and the provider contract carries no disposal member of its own.
    Object.defineProperty(this.face, Symbol.dispose, { value: () => scope.dispose() });
    Object.defineProperty(this.face, Symbol.asyncDispose, { value: () => scope.disposeAsync() });
    scope.provider = this.face;
    bindings.set(this.face, this);
  }

  /** The scope this binding resolves from. */
  get scope(): S {
    return this.#scope;
  }
}

/**
 * The scope `container` resolves from, when it is one of `kind` — `undefined` when `container` is
 * not a face this module minted, or resolves from a different kind of scope.
 */
export function resolvesFrom<S extends Scope>(container: IServiceProvider, kind: AbstractCtor<any[], S>): S | undefined {
  const scope = bindings.get(container)?.scope;
  return scope instanceof kind ? scope : undefined;
}
