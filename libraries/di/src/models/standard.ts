import { type IServiceProvider, type LifetimeModel, type LifetimePolicy, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { Scope } from './Scope.js';
import { resolvesFrom, ScopeProvider } from './ScopeProvider.js';

const MODEL_NAME = 'standard';

/** Lifetime options for the {@link standard} model. */
export type StandardLifetime = 'singleton' | 'scoped' | 'transient';

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
class StandardScope extends Scope {
  readonly #rootScope: StandardScope;

  constructor(enclosing?: StandardScope) {
    super();
    this.#rootScope = enclosing ? enclosing.#rootScope : this;
  }

  openChild(): StandardScope {
    return new StandardScope(this);
  }

  /** @throws {TypeError} when the registration named no lifetime. */
  override selectOwningScope(registration: Registration<unknown>): StandardScope | undefined {
    const lifetime = readLifetime(registration);
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

/** The lifetime `registration` named, absent when it named none this model reads. */
function readLifetime(registration: Registration<unknown> | undefined): StandardLifetime | undefined {
  if (registration === undefined || !('lifetime' in registration)) {
    return undefined;
  }
  const { lifetime } = registration;
  return lifetime === 'singleton' || lifetime === 'scoped' || lifetime === 'transient' ? lifetime : undefined;
}

/** Ranks {@link standard} lifetimes by keeper tier, for the validation addon. */
export const standardValidationPolicy: LifetimePolicy = {
  classify(registration) {
    const lifetime = readLifetime(registration);
    switch (lifetime) {
      case 'singleton': {
        return { tier: 0, label: 'singleton' };
      }
      case 'scoped': {
        return { tier: 1, label: 'scoped' };
      }
      case 'transient': {
        return 'unkept';
      }
      case undefined: {
        return undefined;
      }
      default: {
        return assertNever(lifetime);
      }
    }
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

    create() {
      const rootScope = new StandardScope();
      /** The provider the container is built with; nothing resolves before the build has attached. */
      let rootProvider!: ScopeProvider<StandardScope>;

      /** Opens scopes nested inside the one `container` resolves from. */
      function openFrom(container: IServiceProvider): StandardScopeFactory {
        // An ask that did not come through one of this model's providers carries no scope: nest under the root.
        const enclosingProvider = resolvesFrom(container, StandardScope) ? container : rootProvider;
        return {
          openScope: () => enclosingProvider.openScope(enclosingProvider.scope.openChild()),
        };
      }

      return {
        attach(inner) {
          rootProvider = new ScopeProvider(inner, rootScope);
          return rootProvider;
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
