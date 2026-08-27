import { type IServiceProvider, type LifetimeModel, type LifetimePolicy, Registration, type StandardLifetime, Starfish } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { ServiceProvider } from '../ServiceProvider.js';
import { classifyingHooks } from './classifying-hooks.js';

const MODEL_NAME = 'standard';

/** Opens scopes on the {@link standard} model, where a scope has no name of its own. */
export interface StandardScopeFactory {
  /** Opens a scope nested inside the one this factory was resolved from. */
  openScope(): IServiceProvider;
}

export namespace StandardScopeFactory {
  /** The address the {@link standard} model publishes its opener under. */
  export const address: Type = Type.imported('StandardScopeFactory', '@rhombus-std/di');
}

/** One open scope: its place in the chain and the root it defers singletons to. */
class StandardScope {
  readonly #rootScope: StandardScope;

  constructor(enclosing?: StandardScope) {
    this.#rootScope = enclosing ? enclosing.#rootScope : this;
  }

  openChild(): StandardScope {
    return new StandardScope(this);
  }

  /**
   * The scope keeping an instance registered under `lifetime`, or `undefined` to construct afresh
   * every ask.
   *
   * @throws {TypeError} when the registration named no lifetime.
   */
  selectOwningScope(lifetime: StandardLifetime | undefined): StandardScope | undefined {
    if (lifetime === undefined) {
      throw new TypeError(`the ${MODEL_NAME} lifetime model reads 'singleton', 'scoped' and 'transient', and this registration named none of them`);
    }
    switch (lifetime) {
      case 'singleton': {
        return this.#rootScope;
      }
      case 'scoped': {
        return this;
      }
      case 'transient': {
        return undefined;
      }
      default: {
        return assertNever(lifetime);
      }
    }
  }
}

/** The lifetime a registration named, absent when it named none. */
function readLifetime(registration: Registration<StandardLifetime>): StandardLifetime | undefined {
  return 'lifetime' in registration ? registration.lifetime : undefined;
}

/** Reads the lifetimes {@link standard} registrations carry, for the validation addon. */
export const standardValidationPolicy: LifetimePolicy = {
  classify(registration) {
    if (registration === undefined || !('lifetime' in registration)) {
      return undefined;
    }
    const { lifetime } = registration;
    return lifetime === 'singleton' || lifetime === 'scoped' || lifetime === 'transient' ? lifetime : undefined;
  },
};

/**
 * The conventional model: `'singleton'`, `'scoped'`, `'transient'`. The root is a scope like any
 * other, so a `'scoped'` registration resolved outside every opened scope is kept for the
 * container's lifetime.
 */
export function standard(): LifetimeModel<StandardLifetime> {
  return {
    name: MODEL_NAME,
    transient: 'transient',

    install() {
      const rootScope = new StandardScope();
      /** The scope each provider this container opened resolves from; a provider absent here is the container's own root. */
      const scopeByProvider = new WeakMap<IServiceProvider, StandardScope>();
      /** The provider bound to each scope, for the `IServiceProvider` slot to answer structurally. */
      const providerByScope = new WeakMap<StandardScope, IServiceProvider>();
      /**
       * What each registration has already produced in each scope, one entry per address it
       * answered: two registrations of one type stay apart, an open registration keeps one
       * instance per closing, and asking for a service alone or through a collection reaches the
       * same entry.
       */
      const owned = new WeakMap<StandardScope, Map<Registration<StandardLifetime>, Map<Type, unknown>>>();

      /** The value `registration` already produced in `scope` for `populatedAddress`, absent when it has produced none. */
      function findOwnedInstance(scope: StandardScope, registration: Registration<StandardLifetime>, populatedAddress: Type): { instance: unknown; } | undefined {
        const byRequest = owned.get(scope)?.get(registration);
        if (!byRequest?.has(populatedAddress)) {
          return undefined;
        }
        return { instance: byRequest.get(populatedAddress) };
      }

      /** Holds `instance` as what `registration` answers in `scope` for `populatedAddress` from here on. */
      function claimInstance(scope: StandardScope, registration: Registration<StandardLifetime>, populatedAddress: Type, instance: unknown): void {
        owned.getOrInsertComputed(scope, () => new Map()).getOrInsertComputed(registration, () => new Map()).set(populatedAddress, instance);
      }

      /** Where each construction's instance is kept, and which scope its dependencies resolve under. */
      const hooks = classifyingHooks<StandardLifetime, StandardScope>({
        beforeConstruct({ populatedAddress, registration, context }) {
          // Without a registration the engine, not the manifest, is answering: nothing here is kept by a scope.
          if (registration === undefined) {
            if (populatedAddress === typefor<IServiceProvider>()) {
              const provider = providerByScope.get(context);
              return provider ? { instance: provider } : { within: context };
            }
            return { within: context };
          }
          const scope = context.selectOwningScope(readLifetime(registration));
          if (scope === undefined) {
            return { within: context };
          }
          return findOwnedInstance(scope, registration, populatedAddress) ?? { within: scope };
        },

        afterConstruct({ populatedAddress, registration, context }, instance) {
          if (registration === undefined) {
            return;
          }
          const scope = context.selectOwningScope(readLifetime(registration));
          if (scope === undefined) {
            return;
          }
          claimInstance(scope, registration, populatedAddress, instance);
        },
      });

      /** A provider resolving from `scope`, running its resolutions through the door `resolve` reaches. */
      function providerFor(resolve: Func<[Type], unknown>, scope: StandardScope): IServiceProvider {
        const provider = new ServiceProvider(self => Starfish.bind(resolve, { context: scope, provider: self }));
        scopeByProvider.set(provider, scope);
        providerByScope.set(scope, provider);
        return provider;
      }

      /** Opens scopes nested inside the one `container` resolves from. */
      function openFrom(container: IServiceProvider): StandardScopeFactory {
        const parent = scopeByProvider.get(container) ?? rootScope;
        return {
          openScope: () => providerFor(address => container.getService(address), parent.openChild()),
        };
      }

      return {
        wrapResolve(next, container) {
          const door = next(typefor<Starfish>()) as Starfish;
          door.onBeforeConstruct(hooks.beforeConstruct);
          door.onAfterConstruct(hooks.afterConstruct);
          providerByScope.set(rootScope, container);
          return door.bind({ context: rootScope, provider: container });
        },
        // 'transient': the opener reads the scope the ask came from, so a kept instance would
        // freeze every child to whichever scope first resolved it.
        scopeFactory: Registration.factory<StandardLifetime>(
          StandardScopeFactory.address,
          openFrom,
          Type.func(StandardScopeFactory.address, [[typefor<IServiceProvider>()]]),
          'transient',
        ),
      };
    },
  };
}
