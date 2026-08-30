import { DiError, type IServiceProvider, type LifetimeModel, type Middleware, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { anchorRoot } from '../root-anchor.js';
import { type Claim, Scope } from '../Scope.js';
import { validateStandardCaptivity } from './standard.captivity-validation.js';
import { readKeeping, readLifetime } from './standard.lifetime.js';

export { readKeeping, readLifetime } from './standard.lifetime.js';

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

/** An ask reached a scope this model had already torn down. */
class DisposedScopeError extends DiError {
  constructor(address: Type) {
    super(`the ${MODEL_NAME} lifetime model cannot keep ${Type.stringify(address)} — its scope has been disposed`);
    this.name = 'DisposedScopeError';
  }
}

/** A `'scoped'` ask arrived at the root scope, which has no nested scope to keep it. */
class ScopedAtRootError extends DiError {
  constructor(address: Type) {
    super(`the ${MODEL_NAME} lifetime model cannot resolve the scoped service ${Type.stringify(address)} from the root provider`);
    this.name = 'ScopedAtRootError';
  }
}

/** One open scope: its place in the chain and the root it defers singletons to. */
class StandardScope extends Scope {
  readonly #rootScope: StandardScope;
  readonly #validateScopes: boolean;

  constructor(parent?: StandardScope, validateScopes = true) {
    super(parent);
    this.#rootScope = parent ? parent.#rootScope : this;
    this.#validateScopes = parent ? parent.#validateScopes : validateScopes;
  }

  openChild(): StandardScope {
    return new StandardScope(this);
  }

  /**
   * @throws {ScopedAtRootError} when a 'scoped' registration is asked for under root state and scope validation is on.
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
        if (this === this.#rootScope && this.#validateScopes) {
          throw new ScopedAtRootError(populatedAddress);
        }
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

/** The release `registration` named for what it produces, absent where it named none. */
function readRelease(registration: Registration<unknown>): StandardLifetime.WithRelease['release'] | undefined {
  const lifetime = readLifetime(registration);
  return lifetime !== undefined && typeof lifetime !== 'string' ? lifetime.release : undefined;
}

/**
 * The conventional model: `'singleton'`, `'scoped'`, `'transient'`. Two independent checks, both
 * on by default: `validateOnBuild` composes the build-time captivity sweep, and `validateScopes`
 * refuses a `'scoped'` ask at the root scope — with it off, the root keeps the instance.
 */
export function standard(options?: { validateScopes?: boolean; validateOnBuild?: boolean; }): LifetimeModel<StandardLifetime> {
  const validateScopes = options?.validateScopes ?? true;
  const captivityValidator = (options?.validateOnBuild ?? true) ? validateStandardCaptivity() : undefined;
  return {
    name: MODEL_NAME,
    transient: 'transient',

    create() {
      const rootScope = new StandardScope(undefined, validateScopes);
      const { middleware: scopeMiddleware, enclosingScope, openChild } = anchorRoot(StandardScope, rootScope);

      /** Opens scopes nested inside the one `container` resolves from. */
      function openFrom(container: IServiceProvider): StandardScopeFactory {
        return {
          openScope: () => {
            const scope = enclosingScope(container);
            if (scope.disposed) {
              throw new DisposedScopeError(StandardScopeFactory.address);
            }
            return openChild(scope.openChild());
          },
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

      let middleware: Middleware = scopeMiddleware;
      if (captivityValidator) {
        middleware = next => scopeMiddleware(captivityValidator(next));
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
            typefor<StandardScopeTeardown>(),
            teardownFrom,
            Type.func(typefor<StandardScopeTeardown>(), [[typefor<IServiceProvider>()]]),
            'transient',
          ),
        ],
      };
    },
  };
}
