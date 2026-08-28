import { type IServiceProvider, type LifetimeModel, Registration, ScopeTagUnmatchedError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { anchorRoot } from './root-anchor.js';
import { Scope } from './Scope.js';

const MODEL_NAME = 'tagged';

/** Lifetime options for the {@link tagged} model. */
export type TaggedLifetime<Tags extends string = string> = Tags | undefined;

/** Opens scopes on the {@link tagged} model; the tag the opened scope carries is the one its address named. */
export interface TaggedScopeFactory {
  /** Opens a scope nested inside the one this factory was resolved from. */
  openScope(): IServiceProvider;
}

export namespace TaggedScopeFactory {
  /** The address opening a scope carrying the tag `tag` spells as a string literal. */
  export function addressOf(tag: Type): Type {
    return Type.imported('TaggedScopeFactory', '@rhombus-std/di', [tag]);
  }

  /**
   * The one address the model registers, its tag left open: the model enumerates no tags, so a
   * scope named by a tag nothing was registered under still opens.
   */
  export const template: Type = addressOf(Type.generic('Tag'));
}

/** One open scope: the tag it answers to and the scopes enclosing it. */
class TaggedScope extends Scope {
  readonly #tag: string | undefined;
  readonly #enclosing: TaggedScope | undefined;

  constructor(tag?: string, enclosing?: TaggedScope) {
    super();
    this.#tag = tag;
    this.#enclosing = enclosing;
  }

  openChild(tag: string | undefined): TaggedScope {
    return new TaggedScope(tag, this);
  }

  /**
   * The nearest scope carrying the tag `registration` named, or `undefined` — for a registration
   * naming no tag — to construct afresh every ask.
   *
   * @throws {ScopeTagUnmatchedError} when no scope open here carries the tag the registration named.
   */
  override selectOwningScope(registration: Registration<unknown>, populatedAddress: Type): TaggedScope | undefined {
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
 * The model whose scopes are named: a registration's datum is the tag of the scope keeping it,
 * and the address opening a scope names the tag that scope will carry.
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

      /**
       * Opens scopes carrying the tag `tag` names, nested inside the one `container` resolves from.
       *
       * @throws {TypeError} when `tag` is anything but a string literal.
       */
      function openFrom(container: IServiceProvider, tag: Type): TaggedScopeFactory {
        if (tag.kind !== 'literal' || typeof tag.value !== 'string') {
          throw new TypeError(`the ${MODEL_NAME} lifetime model names a scope with a string literal, and ${Type.stringify(tag)} is not one`);
        }
        const name = tag.value;
        return {
          openScope: () => openChild(enclosingScope(container).openChild(name)),
        };
      }

      return {
        middleware,
        registrations: [
          Registration.factory<TaggedLifetime<Tags>>(
            TaggedScopeFactory.template,
            openFrom,
            Type.func(TaggedScopeFactory.template, [[typefor<IServiceProvider>(), Type.generic('Tag')]]),
            undefined,
          ),
        ],
      };
    },
  };
}
