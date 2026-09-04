import { type Addon, type AddonInstallation, type Behavior, ControlRequest, type ControlService, type GetService, type Hooks, type ITaggedServiceScopeFactory, ObjectDisposedError, Registration,
  type Request, ServiceRequest, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { type Generic, typefor } from '@rhombus-std/primitives.extras';
import { ServiceProvider } from '../../ServiceProvider.js';
import { capture, evict, lookup, store } from '../lifetime-scope.js';
import { chainOf, type Layer } from './layer.js';
import { TaggedServiceScopeFactory } from './TaggedServiceScopeFactory.js';

/**
 * The tagged lifetime model as an addon over the vocabulary of the caller's choosing: a scope per
 * tag, opened in any order and nested in any order, each caching the registrations of its own tag
 * alone.
 *
 * @remarks
 * The built provider caches nothing and captures nothing; it only hands out
 * {@link ITaggedServiceScopeFactory}, whose `openScope(tag)` answers a provider caching the
 * registrations tagged `tag`. A factory resolved from a scope opens scopes chained onto that
 * scope, so an ask entering a `'request'` scope opened inside a `'session'` scope is checked by
 * both: a hit anywhere on the chain, the innermost scope first, answers the cached instance, and a
 * miss constructs under the scope carrying the registration's tag. A registration whose tag no
 * scope on the chain carries, or whose lifetime is `undefined` or omitted, is constructed afresh on
 * every ask and is never captured for disposal. A value registration is handed back as it stands.
 *
 * What a construction produced is what is cached, a promise included, so concurrent asynchronous
 * asks share one pending construction; a promise that rejects is forgotten, and its settled value
 * is what disposal reaches. A construction that throws caches nothing.
 *
 * Disposing a scope's provider disposes what that scope owns, most recently constructed first, each
 * instance once; every error is collected — one rethrows as itself, several as one
 * `AggregateError` — and the scope, with every scope opened beneath it, refuses every later ask
 * with {@link ObjectDisposedError}. Disposing the built provider refuses every provider from then
 * on; what an open scope owns is disposed only with that scope. The synchronous dispose counts an
 * instance offering only `Symbol.asyncDispose` as an error; the asynchronous dispose awaits each
 * such instance and calls the rest synchronously.
 *
 * @typeParam Lifetime - the vocabulary exactly as the caller spells it, `undefined` included;
 * the model reads each registration's `lifetime` as one of its tags.
 *
 * @example
 * ```ts
 * type Lifetime = 'session' | 'request' | undefined;
 *
 * await using provider = Builder
 *   .useAddon(taggedLifetime<Lifetime>())
 *   .withServices(m => m.add(typefor<Session>(), Session, typefor(Session), 'session'))
 *   .build();
 *
 * using session = provider.resolve(typefor<ITaggedServiceScopeFactory<Lifetime>>()).openScope('session');
 * using request = session.resolve(typefor<ITaggedServiceScopeFactory<Lifetime>>()).openScope('request');
 * const current = request.resolve(typefor<Session>()); // constructed once per session scope
 * ```
 */
export function taggedLifetime<Lifetime>(): Addon<Lifetime> {
  return {
    create(): AddonInstallation<Lifetime> {
      const model = new Model();
      return {
        registrations: model.registrations as Iterable<Registration<Lifetime>>,
        middleware: next => model.fold(next),
      };
    },
  };
}

/** The scopes the current constructions run under: the ask's chain, innermost first. */
interface State {
  readonly chain: readonly Layer[];
}

/** The whole model behind one build: the head every scope chains down to, and the one staged set of hooks. */
class Model {
  /** The chain beneath the provider `build()` returns: what a factory resolved there binds to. */
  #head: GetService | undefined;
  /** Whether the built provider has been disposed, learnt through its dispose seam on its first ask. */
  #disposed = false;
  #adopted = false;
  /** Constructed per resolution and bound by `afterConstruct`; open over the vocabulary, so it answers the address any spelling of it derives. */
  readonly #factoryRegistration = Registration.ctor(
    typefor<ITaggedServiceScopeFactory<Generic<'Lifetime'>>>(),
    TaggedServiceScopeFactory,
    Type.ctor(typefor<ITaggedServiceScopeFactory<Generic<'Lifetime'>>>(), [[]]),
  );
  readonly registrations: ReadonlyArray<Registration<undefined>> = [this.#factoryRegistration];

  fold(next: GetService): GetService {
    const control = next(new ControlRequest(typefor<ControlService>())) as ControlService;
    if (typeof control?.stageHooks !== 'function') {
      throw new UnsatisfiableError(typefor<ControlService>(), 'a middleware answered the control ask with something other than the engine control');
    }
    const handle = control.stageHooks(this.#hooks);
    const head: GetService = request => {
      if (this.#disposed) {
        throw new ObjectDisposedError();
      }
      if (!this.#adopted && request instanceof ServiceRequest) {
        this.#adopt(request.serviceProvider);
      }
      return next(request.activate(handle));
    };
    this.#head = head;
    return head;
  }

  /**
   * The built provider, met on its first ask: the provider `build()` mints exists only after the
   * chain folds, so the first ask through it is the earliest its disposal can be subscribed to.
   *
   * @remarks
   * A provider built by hand around this installation's middleware, outside `build()`, is not
   * wired here; it caches and captures nothing of its own, and every scope opened through it
   * answers until that scope is disposed.
   */
  #adopt(provider: unknown): void {
    this.#adopted = true;
    if (provider instanceof ServiceProvider) {
      provider.whenDisposed({
        [Symbol.dispose]: () => {
          this.#disposed = true;
        },
        [Symbol.asyncDispose]: async () => {
          this.#disposed = true;
        },
      });
    }
  }

  readonly #hooks: Behavior<State> = {
    // A latebound closure re-enters under the request it was minted under without crossing the
    // layers again, so the refusal an ended scope owes every ask through it is repeated here.
    beginResolve: (request: Request): State => {
      const chain = chainOf(request);
      if (this.#disposed || chain.some(layer => layer.disposed)) {
        throw new ObjectDisposedError();
      }
      return { chain };
    },

    beforeConstruct: (construction: Hooks.Construction<State>): Hooks.Interception<State> => {
      const { registration, populatedAddress, state } = construction;
      const layer = layerFor(state.chain, registration);
      if (layer === undefined) {
        return { state };
      }
      const cached = lookup(layer, registration, populatedAddress);
      return cached.hit ? { result: cached.value } : { state };
    },

    afterConstruct: (construction: Hooks.Construction<State>, instance: unknown): void => {
      const { registration, populatedAddress, state } = construction;
      if (registration === this.#factoryRegistration) {
        (instance as TaggedServiceScopeFactory<unknown>).source = state.chain[0]?.source ?? this.#head!;
        return;
      }
      const layer = layerFor(state.chain, registration);
      if (layer === undefined) {
        return;
      }
      store(layer, registration, populatedAddress, instance);
      if (!isThenable(instance)) {
        capture(layer, instance);
        return;
      }
      instance.then(
        settled => {
          try {
            capture(layer, settled);
          } catch {
            // The scope ended while the construction was pending: the settled value is disposed
            // and the caller, who already holds the promise, is not told twice.
          }
        },
        () => evict(layer, registration, populatedAddress, instance),
      );
    },
  };
}

/**
 * The innermost scope on `chain` carrying `registration`'s tag, or `undefined` for every node the
 * model leaves to the engine: a value, a registration naming no lifetime, or a tag no open scope
 * on the chain carries.
 */
function layerFor(chain: readonly Layer[], registration: Registration<unknown>): Layer | undefined {
  if (Registration.isValueRegistration(registration)) {
    return undefined;
  }
  const tag = registration.lifetime;
  if (tag === undefined) {
    return undefined;
  }
  return chain.find(layer => layer.tag === tag);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as PromiseLike<unknown>).then === 'function';
}
