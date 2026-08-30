import { type IServiceProvider, type LifetimeModel, type LifetimePolicy, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { assertNever, hasMember, isFunction } from '@rhombus-toolkit/type-guards';
import { anchorRoot } from '../root-anchor.js';
import { type Claim, Scope } from '../Scope.js';

const MODEL_NAME = 'standard';

/** Lifetime options for the {@link standard} model. */
export type StandardLifetime = 'singleton' | 'scoped' | 'transient' | StandardLifetime.WithRelease;

export namespace StandardLifetime {
  /** A keeping lifetime that names how its instance is released, in place of the ordinary disposal protocols. */
  export interface WithRelease {
    /** Which scope keeps the instance, exactly as the bare lifetime of the same name would. */
    readonly keep: 'singleton' | 'scoped';
    /** `'external'` leaves teardown to whoever owns the instance; a function releases it instead. */
    readonly release: 'external' | Func<[instance: unknown], void | Promise<void>>;
  }
}

/** Opens scopes on the {@link standard} model, where a scope has no name of its own. */
export interface StandardScopeFactory {
  /** Opens a scope nested inside the one this factory was resolved from. */
  openScope(): IServiceProvider;
}

export namespace StandardScopeFactory {
  /** The address the {@link standard} model publishes its opener under. */
  export const address = typefor<StandardScopeFactory>();
}

/** Tears down the scope it was resolved from, releasing every instance that scope keeps. */
export interface StandardScopeTeardown extends Disposable, AsyncDisposable {}

export namespace StandardScopeTeardown {
  /** The address the {@link standard} model publishes its teardown under. */
  export const address: Type = Type.imported('StandardScopeTeardown', '@rhombus-std/di');
}

/** An ask reached a scope this model had already torn down. */
class DisposedScopeError extends Error {
  constructor(address: Type) {
    super(`the ${MODEL_NAME} lifetime model cannot keep ${Type.stringify(address)} — its scope has been disposed`);
    this.name = 'DisposedScopeError';
  }
}

/** One open scope: its place in the chain and the root it defers singletons to. */
class StandardScope extends Scope {
  readonly #rootScope: StandardScope;

  constructor(enclosing?: StandardScope) {
    super();
    this.#rootScope = enclosing ? enclosing.#rootScope : this;
  }

  openChild(): StandardScope {
    const child = new StandardScope(this);
    this.trackChild(child);
    return child;
  }

  /**
   * @throws {TypeError} when the registration named no lifetime.
   * @throws {DisposedScopeError} when this scope has already been torn down.
   */
  override selectOwningScope(registration: Registration<unknown>, populatedAddress: Type): StandardScope | undefined {
    if (this.disposed) {
      throw new DisposedScopeError(populatedAddress);
    }
    const lifetime = readLifetime(registration);
    if (lifetime === undefined) {
      throw new TypeError(`the ${MODEL_NAME} lifetime model reads 'singleton', 'scoped' and 'transient', and this registration named none of them`);
    }
    const keeping = readKeeping(lifetime);
    switch (keeping) {
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
        return assertNever(keeping);
      }
    }
  }

  override mintDisposedError(address: Type): Error {
    return new DisposedScopeError(address);
  }

  protected override async releaseInstanceAsync(claim: Claim): Promise<void> {
    const release = readRelease(claim.registration);
    if (release === undefined) {
      return super.releaseInstanceAsync(claim);
    }
    if (release !== 'external') {
      await release(claim.instance);
    }
  }

  /** @throws {TypeError} when the registration's own release could only finish asynchronously. */
  protected override releaseInstance(claim: Claim): void {
    const release = readRelease(claim.registration);
    if (release === undefined) {
      super.releaseInstance(claim);
      return;
    }
    if (release === 'external') {
      return;
    }
    if (release(claim.instance) !== undefined) {
      throw new TypeError(`a synchronous dispose cannot release ${Type.stringify(claim.populatedAddress)} — its own release answered with a promise`);
    }
  }
}

/** The lifetime `registration` named, absent when it named none this model reads. */
function readLifetime(registration: Registration<unknown> | undefined): StandardLifetime | undefined {
  if (registration === undefined || !('lifetime' in registration)) {
    return undefined;
  }
  const { lifetime } = registration;
  if (lifetime === 'singleton' || lifetime === 'scoped' || lifetime === 'transient') {
    return lifetime;
  }
  return namesRelease(lifetime) ? lifetime : undefined;
}

/** Whether `lifetime` is the object form, naming a keeper and the release to give what it keeps. */
function namesRelease(lifetime: unknown): lifetime is StandardLifetime.WithRelease {
  return hasMember(lifetime, 'keep')
    && (lifetime.keep === 'singleton' || lifetime.keep === 'scoped')
    && hasMember(lifetime, 'release')
    && (lifetime.release === 'external' || isFunction(lifetime.release));
}

/** Which scope `lifetime` keeps its instance in. */
function readKeeping(lifetime: StandardLifetime): 'singleton' | 'scoped' | 'transient' {
  return typeof lifetime === 'string' ? lifetime : lifetime.keep;
}

/** The release `registration` named for what it produces, absent where it named none. */
function readRelease(registration: Registration<unknown>): StandardLifetime.WithRelease['release'] | undefined {
  const lifetime = readLifetime(registration);
  return lifetime !== undefined && typeof lifetime !== 'string' ? lifetime.release : undefined;
}

/** Ranks {@link standard} lifetimes by keeper tier, for the validation addon. */
export const standardValidationPolicy: LifetimePolicy = {
  classify(registration) {
    const lifetime = readLifetime(registration);
    if (lifetime === undefined) {
      return undefined;
    }
    const keeping = readKeeping(lifetime);
    switch (keeping) {
      case 'singleton': {
        return { tier: 0, label: 'singleton' };
      }
      case 'scoped': {
        return { tier: 1, label: 'scoped' };
      }
      case 'transient': {
        return 'unkept';
      }
      default: {
        return assertNever(keeping);
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
      const { middleware, enclosingScope, openChild } = anchorRoot(StandardScope, rootScope);

      /** Opens scopes nested inside the one `container` resolves from. */
      function openFrom(container: IServiceProvider): StandardScopeFactory {
        return {
          openScope: () => openChild(enclosingScope(container).openChild()),
        };
      }

      /** Tears down the scope `container` resolves from. */
      function teardownFrom(container: IServiceProvider): StandardScopeTeardown {
        const scope = enclosingScope(container);
        return {
          [Symbol.dispose]: () => scope.dispose(),
          [Symbol.asyncDispose]: () => scope.disposeAsync(),
        };
      }

      return {
        middleware,
        // 'transient' throughout: both read the scope the ask came from, so a kept instance would
        // freeze every later ask to whichever scope first resolved it.
        registrations: [
          Registration.factory<StandardLifetime>(
            StandardScopeFactory.address,
            openFrom,
            Type.func(StandardScopeFactory.address, [[typefor<IServiceProvider>()]]),
            'transient',
          ),
          Registration.factory<StandardLifetime>(
            StandardScopeTeardown.address,
            teardownFrom,
            Type.func(StandardScopeTeardown.address, [[typefor<IServiceProvider>()]]),
            'transient',
          ),
        ],
      };
    },
  };
}
