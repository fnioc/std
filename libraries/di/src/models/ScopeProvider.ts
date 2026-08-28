import { type Behavior, type Construction, Control, type IEngineHooks, type IServiceProvider, LifetimeModelError } from '@rhombus-std/di.core';
import { assertTruthy, type Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { AbstractCtor, Func } from '@rhombus-toolkit/func';
import { askForControl, isControlAsk } from '../internal/control-recognition.js';
import { classifyingHooks } from './classifying-hooks.js';
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
    beginResolve: (_request, injected) => injected ?? scope,
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
   * Whether `scope` itself is what keeps this construction.
   *
   * @throws {LifetimeModelError} when the model refuses the registration's lifetime.
   */
  function ownScopeKeeps({ populatedAddress, registration, state }: Construction<Scope>): boolean {
    if (registration === undefined) {
      return false;
    }
    try {
      return state.selectOwningScope(registration, populatedAddress) === scope;
    } catch (error) {
      throw new LifetimeModelError(populatedAddress, error);
    }
  }

  return {
    beforeConstruct(construction, next) {
      const answer = next(construction);
      if ('result' in answer && ownScopeKeeps(construction)) {
        learn(construction.populatedAddress, answer.result);
      }
      return answer;
    },

    afterConstruct(construction, instance, next) {
      next(construction, instance);
      if (ownScopeKeeps(construction)) {
        learn(construction.populatedAddress, instance);
      }
    },
  };
}

export interface ScopeProvider<S extends Scope = Scope> extends IServiceProvider {}

/**
 * A provider resolving from one scope: every resolution asked of it carries that scope's keeping
 * beneath whatever else reaches it, and what the scope turns out to keep is answered straight from
 * here on every later ask.
 */
export class ScopeProvider<S extends Scope = Scope> implements IServiceProvider {
  readonly #inner: IServiceProvider;
  readonly #scope: S;
  readonly #hooks: IEngineHooks;
  /** This scope's own keeping, minted once and installed fresh around every ask. */
  readonly #keeping: Behavior<Scope>;
  /** This scope's own watch, minted once and installed fresh around every ask. */
  readonly #probing: Behavior<Scope>;
  /** What each address this scope turned out to keep settled on, so asking for it again opens nothing. */
  readonly #learnedAnswers = new Map<Type, unknown>();

  constructor(inner: IServiceProvider, scope: S) {
    this.#inner = inner;
    this.#scope = scope;
    this.#hooks = askForControl<IEngineHooks>(inner, typefor<Control<IEngineHooks>>());
    this.#keeping = keeping(scope);
    this.#probing = probing(scope, (address, instance) => this.#learnedAnswers.set(address, instance));
    scope.provider = this;
  }

  /** The scope this provider resolves from. */
  get scope(): S {
    return this.#scope;
  }

  /** A provider resolving from `scope`, through whatever this one resolves through. */
  openScope<Nested extends Scope>(scope: Nested): ScopeProvider<Nested> {
    return new ScopeProvider(this.#inner, scope);
  }

  /**
   * @remarks
   * A control ask passes straight through, unchanged: this provider joins nothing over it.
   *
   * A learned answer is served straight from here, unconditionally, and opens no resolution.
   * Every other ask installs this scope's probing and keeping fresh, keeping innermost, and
   * forwards: everything the ask reaches keeps here — a middleware asking again among it — and an
   * ask made from inside installs its own over the top for as long as it runs.
   */
  getService(address: Type): any {
    assertTruthy(address, 'the service type handed to ScopeProvider.getService');
    if (isControlAsk(address)) {
      return this.#inner.getService(address);
    }
    if (this.#learnedAnswers.has(address)) {
      return this.#learnedAnswers.get(address);
    }
    using _probing = this.#hooks.useHooks(this.#probing);
    using _keeping = this.#hooks.useHooks(this.#keeping);
    return this.#inner.getService(address);
  }
}

/** Whether `container` is a provider of this package's own, resolving from a scope of `kind`. */
export function resolvesFrom<S extends Scope>(container: IServiceProvider, kind: AbstractCtor<any[], S>): container is ScopeProvider<S> {
  return container instanceof ScopeProvider && container.scope instanceof kind;
}
