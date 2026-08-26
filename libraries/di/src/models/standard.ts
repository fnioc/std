import { type IServiceProvider, type LifetimeModel, type Realizer, Registration, ScopeFactory, type StandardLifetime } from '@rhombus-std/di.core';
import { augment, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';

const MODEL_NAME = 'standard';

/** What the engine hands a realizer for one construction. */
type Construction = Parameters<Realizer<StandardLifetime>['realize']>[0];

/**
 * One open scope: the instances it keeps, and the root it defers singletons to.
 *
 * @remarks
 * Handing a scope to `make` is what puts a construction's dependencies under it, so the scope
 * keeping an instance is also the one its dependencies resolve from — a singleton's dependencies
 * come from the root, and nothing long-lived can capture a shorter-lived instance.
 */
class StandardScope implements Realizer<StandardLifetime> {
  readonly #rootScope: StandardScope;
  /**
   * What each registration has already produced here, one entry per address it answered: two
   * registrations of one type stay apart, an open registration keeps one instance per closing,
   * and asking for a service alone or through a collection reaches the same entry.
   */
  readonly #instances = new Map<Registration<StandardLifetime>, Map<Type, unknown>>();

  constructor(enclosing?: StandardScope) {
    this.#rootScope = enclosing ? enclosing.#rootScope : this;
  }

  realize({ populatedAddress, registration, make }: Construction): unknown {
    const holder = this.#findHolder('lifetime' in registration ? registration.lifetime : undefined);
    if (holder === undefined) {
      return make(this);
    }
    let byRequest = holder.#instances.get(registration);
    if (!byRequest) {
      byRequest = new Map();
      holder.#instances.set(registration, byRequest);
    }
    if (byRequest.has(populatedAddress)) {
      return byRequest.get(populatedAddress);
    }
    const instance = make(holder);
    byRequest.set(populatedAddress, instance);
    return instance;
  }

  openChild(): StandardScope {
    return new StandardScope(this);
  }

  /**
   * The scope keeping an instance registered under `lifetime`, or `undefined` to construct afresh
   * every ask.
   *
   * @throws {TypeError} when the registration named no lifetime — this model reads three, and
   * silence is not one of them.
   */
  #findHolder(lifetime: StandardLifetime | undefined): StandardScope | undefined {
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

/**
 * One container's machinery: it points each walk at the scope whose provider opened it, so one
 * realizer serves every scope.
 */
class StandardRouter implements Realizer<StandardLifetime> {
  #activeScope = new StandardScope();

  realize(construction: Construction): unknown {
    return this.#activeScope.realize(construction);
  }

  /** `container` is the provider a {@link StandardScopeProvider} defers to for anything the scope itself doesn't keep. */
  openScopesFrom(container: IServiceProvider): ScopeFactory {
    // Read while the asking walk is still running, so the scope open right now is the one a
    // child is parented to.
    const parent = this.#activeScope;
    return () => new StandardScopeProvider(this, parent.openChild(), container);
  }

  /** Runs `resolution` with `scope` answering for every site it realizes. */
  enterScope<Result>(scope: StandardScope, resolution: Func<[], Result>): Result {
    const previous = this.#activeScope;
    this.#activeScope = scope;
    try {
      return resolution();
    } finally {
      this.#activeScope = previous;
    }
  }
}

interface StandardScopeProvider extends IServiceProvider {}

/** A provider bound to one open scope: every resolution asked of it realizes under that scope. */
@augment(typefor<IServiceProvider>())
class StandardScopeProvider implements IServiceProvider {
  readonly #router: StandardRouter;
  readonly #scope: StandardScope;
  readonly #container: IServiceProvider;

  constructor(router: StandardRouter, scope: StandardScope, container: IServiceProvider) {
    this.#router = router;
    this.#scope = scope;
    this.#container = container;
  }

  getService(...request: any[]): any {
    return this.#router.enterScope(this.#scope, () => (this.#container.resolve as Func)(...request));
  }
}

/**
 * The conventional model: `'singleton'` keeps one instance for the container, `'scoped'` one per
 * open scope, and `'transient'` none. The root is a scope like any other, so a `'scoped'`
 * registration resolved outside every `ScopeFactory` call is kept for the container's lifetime.
 *
 * @remarks
 * Every registration names one of the three: this model has no reading for silence, so a
 * registration that says nothing is refused rather than defaulted.
 */
export function standard(): LifetimeModel<StandardLifetime> {
  return {
    name: MODEL_NAME,
    transient: 'transient',

    createRealizer() {
      const router = new StandardRouter();
      return {
        realizer: router,
        // 'transient': openScopesFrom reads the router's active scope at CALL time, so a cached
        // instance would freeze every child to whichever scope first resolved this factory.
        scopeFactory: Registration.factory<StandardLifetime>(
          ScopeFactory.address,
          (container: IServiceProvider) => router.openScopesFrom(container),
          Type.func(ScopeFactory.address, [[typefor<IServiceProvider>()]]),
          'transient',
        ),
      };
    },
  };
}
