import { type Behavior, Control, type IEngineHooks, type IServiceProvider, LifetimeModelError } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { AbstractCtor, Func } from '@rhombus-toolkit/func';
import { askForControl, isControlAsk } from '../internal/control-recognition.js';
import { ServiceProvider } from '../ServiceProvider.js';
import { attributingHooks } from './attributing-hooks.js';
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
  const hooks = attributingHooks<Scope>({
    beforeConstruct({ populatedAddress, registration, state }) {
      if (state === undefined) {
        return { state };
      }
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
      if (state === undefined || registration === undefined) {
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
  /** What every ask through {@link face} runs, brackets included. */
  readonly dispatch: Func<[Type], unknown>;
  /** The augmented, user-facing provider resolving from this scope. */
  readonly face: ServiceProvider;

  /** Binds `scope` over `next`, the shared chain every scope of this model wraps. */
  constructor(next: Func<[Type], unknown>, scope: S) {
    this.#scope = scope;
    this.#hooks = askForControl<IEngineHooks>({ getService: next }, typefor<Control<IEngineHooks>>());
    this.#keeping = keeping(scope);

    this.dispatch = address => {
      if (!address) {
        throw new TypeError('a scope dispatch received no address — the caller resolved without a service type');
      }
      if (isControlAsk(address)) {
        return next(address);
      }
      // After teardown nothing resolves from here.
      if (this.#scope.disposed) {
        throw new LifetimeModelError(address, this.#scope.mintDisposedError(address));
      }
      using _keeping = this.#hooks.useHooks(this.#keeping);
      return next(address);
    };

    this.face = new ServiceProvider(this.dispatch);
    // Minted onto this one face rather than declared on `ServiceProvider`: teardown belongs to the
    // model, and the provider contract carries no disposal member of its own.
    Object.defineProperty(this.face, Symbol.dispose, {
      value: () => {
        try {
          scope.dispose();
        } finally {
        }
      },
    });
    Object.defineProperty(this.face, Symbol.asyncDispose, {
      value: () => scope.disposeAsync(),
    });
    scope.bindProvider(this.face);
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
