import { type IServiceProvider, type LifetimeModel, Registration, ScopeTagUnmatchedError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { type Generic, typefor } from '@rhombus-std/primitives.extras';
import { anchorRoot } from '../root-anchor.js';
import { Scope } from '../Scope.js';

const MODEL_NAME = 'tagged';

/** Lifetime options for the {@link tagged} model. */
export type TaggedLifetime<Tags extends string = string> = Tags | undefined;

/**
 * Opens scopes on the {@link tagged} model, each carrying the tag the call names.
 *
 * @typeParam Tags - the tags this asker opens scopes under, so a call naming one outside the set
 * it declared is a compile error.
 */
export interface TaggedScopeFactory<Tags extends string = string> {
  /** Opens a scope carrying `tag`, nested inside the one this factory was resolved from. */
  openScope(tag: Tags): IServiceProvider;
}

export namespace TaggedScopeFactory {
  /**
   * The one address the model registers, its tag set left open: the model enumerates no tags, so
   * every asker reaches this one registration through whichever set it names.
   */
  export const address: Type = typefor<TaggedScopeFactory<Generic<'Tags', string>>>();
}

/** Tears down the scope it was resolved from, releasing every instance that scope keeps. */
export interface TaggedScopeTeardown extends Disposable, AsyncDisposable {}

export namespace TaggedScopeTeardown {
  /** The address the {@link tagged} model publishes its teardown under. */
  export const address: Type = typefor<TaggedScopeTeardown>();
}

/** An ask reached a scope this model had already torn down. */
class DisposedScopeError extends Error {
  constructor(address: Type) {
    super(`the ${MODEL_NAME} lifetime model cannot keep ${Type.stringify(address)} — its scope has been disposed`);
    this.name = 'DisposedScopeError';
  }
}

/** One open scope: the tag it answers to and the scopes enclosing it. */
class TaggedScope extends Scope {
  readonly #tag: string | undefined;
  /** The scope enclosing this one, narrowed to this model so its own tag is reachable. */
  readonly #enclosing: TaggedScope | undefined;

  constructor(tag?: string, parent?: TaggedScope) {
    super(parent);
    this.#tag = tag;
    this.#enclosing = parent;
  }

  openChild(tag: string | undefined): TaggedScope {
    return new TaggedScope(tag, this);
  }

  /**
   * The nearest scope carrying the tag `registration` named, or `undefined` — for a registration
   * naming no tag — to construct afresh every ask.
   *
   * @throws {ScopeTagUnmatchedError} when no scope open here carries the tag the registration named.
   * @throws {DisposedScopeError} when this scope has already been torn down.
   */
  override selectOwningScope(registration: Registration<unknown>, populatedAddress: Type): TaggedScope | undefined {
    if (this.disposed) {
      throw new DisposedScopeError(populatedAddress);
    }
    const lifetime = readLifetime(registration);
    if (lifetime === undefined) {
      return undefined;
    }
    const owner = Iterator.from(this.#ancestry()).find(scope => scope.#tag === lifetime);
    if (!owner) {
      throw new ScopeTagUnmatchedError(MODEL_NAME, lifetime, populatedAddress);
    }
    return owner;
  }

  override mintDisposedError(address: Type): Error {
    return new DisposedScopeError(address);
  }

  /** This scope first, then each scope enclosing it. */
  *#ancestry(): Generator<TaggedScope> {
    for (let scope: TaggedScope | undefined = this; scope; scope = scope.#enclosing) {
      yield scope;
    }
  }
}

/** The tag `registration` named, absent when it named none this model reads. */
function readLifetime(registration: Registration<unknown>): TaggedLifetime {
  if (!('lifetime' in registration)) {
    return undefined;
  }
  const { lifetime } = registration;
  return typeof lifetime === 'string' ? lifetime : undefined;
}

/**
 * The model whose scopes are named: a registration's datum is the tag of the scope keeping it, and
 * opening a scope names the tag that scope will carry.
 *
 * @typeParam Tags - the tags a scope may carry, defaulting to any string.
 */
export function tagged<Tags extends string = string>(): LifetimeModel<TaggedLifetime<Tags>> {
  return {
    name: MODEL_NAME,
    transient: undefined,

    create() {
      const rootScope = new TaggedScope();
      const { middleware, enclosingScope, openChild } = anchorRoot(TaggedScope, rootScope);

      /** Opens scopes nested inside the one `container` resolves from, each carrying the tag its call names. */
      function openFrom(container: IServiceProvider): TaggedScopeFactory {
        return {
          openScope: tag => openChild(enclosingScope(container).openChild(tag)),
        };
      }

      /** Tears down the scope `container` resolves from, whatever tag that scope carries. */
      function teardownFrom(container: IServiceProvider): TaggedScopeTeardown {
        const scope = enclosingScope(container);
        return {
          [Symbol.dispose]: () => scope.dispose(),
          [Symbol.asyncDispose]: () => scope.disposeAsync(),
        };
      }

      return {
        middleware,
        registrations: [
          Registration.factory<TaggedLifetime<Tags>>(
            TaggedScopeFactory.address,
            openFrom,
            Type.func(TaggedScopeFactory.address, [[typefor<IServiceProvider>()]]),
            undefined,
          ),
          Registration.factory<TaggedLifetime<Tags>>(
            TaggedScopeTeardown.address,
            teardownFrom,
            Type.func(TaggedScopeTeardown.address, [[typefor<IServiceProvider>()]]),
            undefined,
          ),
        ],
      };
    },
  };
}
