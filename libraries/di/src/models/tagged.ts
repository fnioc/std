import { type IServiceProvider, type LifetimeArgument, type LifetimeModel, type Realizer, Registration, ScopeFactory, ScopeTagUnmatchedError, type TaggedLifetime } from '@rhombus-std/di.core';
import { augment, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

const MODEL_NAME = 'tagged';

/** What the engine hands a realizer for one construction. */
type Construction<Tags extends string> = Parameters<Realizer<TaggedLifetime<Tags>>['realize']>[0];

/**
 * One open scope: the tag it answers to, the scopes enclosing it, and the instances it keeps.
 *
 * @remarks
 * Handing a scope to `make` is what puts a construction's dependencies under it, so the scope
 * keeping an instance is also the one its dependencies resolve from — a tagged instance reaching
 * for something kept by a scope nested inside its own fails loudly rather than capturing it.
 */
class TaggedScope<Tags extends string> implements Realizer<TaggedLifetime<Tags>> {
  readonly name = MODEL_NAME;
  readonly #tag: Tags | undefined;
  readonly #enclosing: TaggedScope<Tags> | undefined;
  /**
   * What each registration has already produced here, one entry per address it answered: two
   * registrations of one type stay apart, an open registration keeps one instance per closing,
   * and asking for a service alone or through a collection reaches the same entry.
   */
  readonly #instances = new Map<Registration<TaggedLifetime<Tags>>, Map<Type, unknown>>();

  constructor(tag?: Tags, enclosing?: TaggedScope<Tags>) {
    this.#tag = tag;
    this.#enclosing = enclosing;
  }

  /** @throws {ScopeTagUnmatchedError} when no scope open here carries the tag the registration named. */
  realize({ populatedAddress, registration, make }: Construction<Tags>): unknown {
    const holder = this.#findHolder('lifetime' in registration ? registration.lifetime : undefined, populatedAddress);
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

  openChild(tag: Tags | undefined): TaggedScope<Tags> {
    return new TaggedScope(tag, this);
  }

  /** The nearest scope carrying `lifetime`, or `undefined` — for a registration naming no tag — to construct afresh every ask. */
  #findHolder(lifetime: TaggedLifetime<Tags>, address: Type): TaggedScope<Tags> | undefined {
    if (lifetime === undefined) {
      return undefined;
    }
    const holder = Iterator.from(this.#walkOutwards()).find(scope => scope.#tag === lifetime);
    if (!holder) {
      throw new ScopeTagUnmatchedError(this.name, lifetime, address);
    }
    return holder;
  }

  /** This scope first, then each scope enclosing it. */
  *#walkOutwards(): Generator<TaggedScope<Tags>> {
    for (let scope: TaggedScope<Tags> | undefined = this; scope; scope = scope.#enclosing) {
      yield scope;
    }
  }
}

/**
 * One container's machinery: it points each walk at the scope whose provider opened it, so one
 * realizer serves every scope.
 */
class TaggedRouter<Tags extends string> implements Realizer<TaggedLifetime<Tags>> {
  #activeScope = new TaggedScope<Tags>();

  realize(construction: Construction<Tags>): unknown {
    return this.#activeScope.realize(construction);
  }

  /** `container` is the provider a {@link TaggedScopeProvider} defers to for anything the scope itself doesn't keep. */
  openScopesFrom(container: IServiceProvider): ScopeFactory<LifetimeArgument<TaggedLifetime<Tags>>> {
    // Read while the asking walk is still running, so the scope open right now is the one a
    // child is parented to.
    const parent = this.#activeScope;
    return (...lifetime: LifetimeArgument<TaggedLifetime<Tags>>) => new TaggedScopeProvider(this, parent.openChild(lifetime[0]), container);
  }

  /** Runs `resolution` with `scope` answering for every site it realizes. */
  enterScope<Result>(scope: TaggedScope<Tags>, resolution: Func<[], Result>): Result {
    const previous = this.#activeScope;
    this.#activeScope = scope;
    try {
      return resolution();
    } finally {
      this.#activeScope = previous;
    }
  }
}

interface TaggedScopeProvider<Tags extends string> extends IServiceProvider {}

/** A provider bound to one open scope: every resolution asked of it realizes under that scope. */
@augment(typefor<IServiceProvider>())
class TaggedScopeProvider<Tags extends string> implements IServiceProvider {
  readonly #router: TaggedRouter<Tags>;
  readonly #scope: TaggedScope<Tags>;
  readonly #container: IServiceProvider;

  constructor(router: TaggedRouter<Tags>, scope: TaggedScope<Tags>, container: IServiceProvider) {
    this.#router = router;
    this.#scope = scope;
    this.#container = container;
  }

  getService(...request: any[]): any {
    return this.#router.enterScope(this.#scope, () => (this.#container.resolve as Func)(...request));
  }
}

/**
 * The model whose scopes are named: a registration's datum is the tag of the scope keeping it,
 * and opening a scope takes the tag that scope will carry.
 *
 * @remarks
 * An instance is kept by the nearest enclosing scope wearing its tag, so nesting one tag inside
 * itself is legal and the innermost wins. Naming no tag is a reading this model owns rather than
 * a gap in it: it is transient, constructed afresh for every ask, and a scope opened without a
 * tag carries none for anything to match. The container's own root carries no tag either, which
 * is what makes a tagged registration resolved outside every matching scope a loud
 * {@link ScopeTagUnmatchedError} rather than a silent container-lifetime instance.
 *
 * @typeParam Tags - the tags a scope may carry, defaulting to any string. The vocabulary a
 * registration draws on is those plus `undefined`, the transient reading.
 */
export function tagged<Tags extends string = string>(): LifetimeModel<TaggedLifetime<Tags>> {
  return {
    name: MODEL_NAME,
    transient: undefined,

    createRealizer() {
      const router = new TaggedRouter<Tags>();
      return {
        realizer: router,
        scopeFactory: Registration.factory<TaggedLifetime<Tags>>(
          ScopeFactory.address,
          (container: IServiceProvider) => router.openScopesFrom(container),
          Type.func(ScopeFactory.address, [[typefor<IServiceProvider>()]]),
          undefined,
        ),
      };
    },
  };
}
