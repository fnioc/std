import { type IServiceProvider, type LifetimeModel, Registration, ScopeTagUnmatchedError, Starfish, type TaggedLifetime } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { ServiceProvider } from '../ServiceProvider.js';
import { classifyingHooks } from './classifying-hooks.js';

const MODEL_NAME = 'tagged';

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
class TaggedScope {
  readonly #tag: string | undefined;
  readonly #enclosing: TaggedScope | undefined;

  constructor(tag?: string, enclosing?: TaggedScope) {
    this.#tag = tag;
    this.#enclosing = enclosing;
  }

  openChild(tag: string | undefined): TaggedScope {
    return new TaggedScope(tag, this);
  }

  /**
   * The nearest scope carrying `lifetime`, or `undefined` — for a registration naming no tag — to
   * construct afresh every ask.
   *
   * @throws {ScopeTagUnmatchedError} when no scope open here carries the tag the registration named.
   */
  selectOwningScope(lifetime: TaggedLifetime, address: Type): TaggedScope | undefined {
    if (lifetime === undefined) {
      return undefined;
    }
    const owner = Iterator.from(this.#ancestry()).find(scope => scope.#tag === lifetime);
    if (!owner) {
      throw new ScopeTagUnmatchedError(MODEL_NAME, lifetime, address);
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

/** The tag a registration named, absent when it named none. */
function readLifetime(registration: Registration<TaggedLifetime>): TaggedLifetime {
  return 'lifetime' in registration ? registration.lifetime : undefined;
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

    install() {
      const rootScope = new TaggedScope();
      /** The scope each provider this container opened resolves from; a provider absent here is the container's own root. */
      const scopeByProvider = new WeakMap<IServiceProvider, TaggedScope>();
      /** The provider bound to each scope, for the `IServiceProvider` slot to answer structurally. */
      const providerByScope = new WeakMap<TaggedScope, IServiceProvider>();
      /** What each registration has already produced in each scope, one entry per address it answered. */
      const owned = new WeakMap<TaggedScope, Map<Registration<TaggedLifetime>, Map<Type, unknown>>>();

      /** The value `registration` already produced in `scope` for `populatedAddress`, absent when it has produced none. */
      function findOwnedInstance(scope: TaggedScope, registration: Registration<TaggedLifetime>, populatedAddress: Type): { instance: unknown; } | undefined {
        const byRequest = owned.get(scope)?.get(registration);
        if (!byRequest?.has(populatedAddress)) {
          return undefined;
        }
        return { instance: byRequest.get(populatedAddress) };
      }

      /** Holds `instance` as what `registration` answers in `scope` for `populatedAddress` from here on. */
      function claimInstance(scope: TaggedScope, registration: Registration<TaggedLifetime>, populatedAddress: Type, instance: unknown): void {
        owned.getOrInsertComputed(scope, () => new Map()).getOrInsertComputed(registration, () => new Map()).set(populatedAddress, instance);
      }

      /** Where each construction's instance is kept, and which scope its dependencies resolve under. */
      const hooks = classifyingHooks<TaggedLifetime, TaggedScope>({
        beforeConstruct({ populatedAddress, registration, context }) {
          // Without a registration the engine, not the manifest, is answering: nothing here is kept by a scope.
          if (registration === undefined) {
            if (populatedAddress === typefor<IServiceProvider>()) {
              const provider = providerByScope.get(context);
              return provider ? { instance: provider } : { within: context };
            }
            return { within: context };
          }
          const scope = context.selectOwningScope(readLifetime(registration), populatedAddress);
          if (scope === undefined) {
            return { within: context };
          }
          return findOwnedInstance(scope, registration, populatedAddress) ?? { within: scope };
        },

        afterConstruct({ populatedAddress, registration, context }, instance) {
          if (registration === undefined) {
            return;
          }
          const scope = context.selectOwningScope(readLifetime(registration), populatedAddress);
          if (scope === undefined) {
            return;
          }
          claimInstance(scope, registration, populatedAddress, instance);
        },
      });

      /** A provider resolving from `scope`, running its resolutions through the door `resolve` reaches. */
      function providerFor(resolve: Func<[Type], unknown>, scope: TaggedScope): IServiceProvider {
        const provider = new ServiceProvider(self => Starfish.bind(resolve, { context: scope, provider: self }));
        scopeByProvider.set(provider, scope);
        providerByScope.set(scope, provider);
        return provider;
      }

      /**
       * Opens scopes carrying the tag `tag` names, nested inside the one `container` resolves from.
       *
       * @throws {TypeError} when `tag` is anything but a string literal.
       */
      function openFrom(container: IServiceProvider, tag: Type): TaggedScopeFactory {
        if (tag.kind !== 'literal' || typeof tag.value !== 'string') {
          throw new TypeError(`the ${MODEL_NAME} lifetime model names a scope with a string literal, and ${Type.stringify(tag)} is not one`);
        }
        const parent = scopeByProvider.get(container) ?? rootScope;
        const name = tag.value;
        return {
          openScope: () => providerFor(address => container.getService(address), parent.openChild(name)),
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
        scopeFactory: Registration.factory<TaggedLifetime<Tags>>(
          TaggedScopeFactory.template,
          openFrom,
          Type.func(TaggedScopeFactory.template, [[typefor<IServiceProvider>(), Type.generic('Tag')]]),
          undefined,
        ),
      };
    },
  };
}
