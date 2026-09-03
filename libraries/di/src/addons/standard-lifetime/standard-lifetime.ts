import { type Addon, type Behavior, ControlRequest, type ControlService, type GetService, type Hooks, type IServiceProvider, type IServiceScopeFactory, ObjectDisposedError, Registration, type Request,
  ServiceRequest, type StandardLifetime, UnsatisfiableError } from '@rhombus-std/di.core';
import { typefor } from '@rhombus-std/primitives.extras';
import { ServiceProvider } from '../../ServiceProvider.js';
import { capture, disposeScope, disposeScopeAsync, evict, lookup, store } from '../lifetime-scope.js';
import { newScope, type Scope } from './scope.js';
import { lifetimeKind, scopeId } from './symbols.js';

/**
 * The standard lifetime model as an addon — a clone of Microsoft.Extensions.DependencyInjection's
 * service lifetimes, caching and disposal, on this repository's own API.
 *
 * @remarks
 * Every constructed registration names `'singleton'`, `'scoped'` or `'transient'`. A singleton is
 * one instance per container, shared by every scope and disposed with the container. A scoped
 * registration is one instance per scope opened through {@link IServiceScopeFactory}, disposed with
 * that scope; reached through the container's own provider it is cached with the singletons, which
 * {@link validateScopes} turns into a refusal. A transient is fresh per ask and per injection site,
 * owned for disposal by the scope the ask ran under — a transient injected into a singleton lives as
 * long as the singleton. A value registration is handed back as it stands and never disposed.
 *
 * What a construction produced is what is cached, a promise included, so concurrent asynchronous
 * asks share one pending construction; a promise that rejects is forgotten, so the next ask tries
 * again, and its settled value is what disposal reaches. A construction that throws caches nothing.
 *
 * Disposing a scope's provider disposes what that scope owns, most recently constructed first, each
 * instance once; every error is collected — one rethrows as itself, several as one
 * `AggregateError` — and the scope refuses every later ask with {@link ObjectDisposedError}.
 * Disposing the container's provider does the same for the singletons and refuses every provider
 * from then on. The synchronous dispose counts an instance offering only `Symbol.asyncDispose` as
 * an error; the asynchronous dispose awaits each such instance and calls the rest synchronously.
 *
 * @example
 * ```ts
 * await using provider = Builder
 *   .useAddon(standardLifetime())
 *   .withServices(m => m.add(typefor<IRepo>(), SqlRepo, typefor(SqlRepo), 'scoped'))
 *   .build();
 *
 * using scope = provider.resolve(typefor<IServiceScopeFactory>()).openScope();
 * const repo = scope.resolve(typefor<IRepo>());
 * ```
 */
export function standardLifetime(): Addon<StandardLifetime> {
  const model = new Model();
  return {
    registrations: model.registrations,
    middleware: next => model.fold(next),
  };
}

/** The whole model behind one container: its scopes, its hooks, and the factory that opens scopes. */
class Model {
  /** The container's own scope: the singletons, and everything the container's provider owns. */
  readonly #root: Scope = newScope();
  /** One per `openScope()`, keyed by the id its provider's marker stamps; an ended scope leaves the map. */
  readonly #scopes = new Map<symbol, Scope>();
  #count = 0;
  /** The chain beneath the markers: every provider of this container runs through it. */
  #implementation: GetService | undefined;
  readonly #factory: IServiceScopeFactory = { openScope: () => this.#openScope() };
  /** Answers the provider of the scope the ask runs under — the container's own under a singleton's dependencies. */
  readonly #providerRegistration = Registration.factory<StandardLifetime>(typefor<IServiceProvider>(), unreachableProvider, typefor(unreachableProvider), 'transient');
  readonly registrations: ReadonlyArray<Registration<StandardLifetime>> = [
    Registration.value(typefor<IServiceScopeFactory>(), this.#factory),
    this.#providerRegistration,
  ];

  fold(next: GetService): GetService {
    const address = typefor<ControlService>();
    const control = next(new ControlRequest(address)) as ControlService;
    if (typeof control?.stageHooks !== 'function') {
      throw new UnsatisfiableError(address, 'a middleware answered the control ask with something other than the engine control');
    }
    const handle = control.stageHooks(this.#hooks);
    const implementation: GetService = request => next(request.activate(handle));
    this.#implementation = implementation;
    const marker = this.#marker('singleton', undefined, implementation);
    return request => {
      if (this.#root.provider === undefined && request instanceof ServiceRequest) {
        this.#adoptContainer(request.serviceProvider);
      }
      return marker(request);
    };
  }

  /**
   * The container's own provider, met on its first ask: what a singleton's dependencies resolve
   * `IServiceProvider` to, and whose disposal ends the container's scope. The provider `build()`
   * mints exists only after the chain folds, so the first ask through it is the earliest it can be
   * known.
   */
  #adoptContainer(provider: IServiceProvider): void {
    this.#root.provider = provider;
    if (provider instanceof ServiceProvider) {
      provider.whenDisposed(this.#release(this.#root));
    }
  }

  /** The one layer a provider adds over the shared implementation: which scope its asks run under. */
  #marker(kind: 'singleton' | 'scoped', id: symbol | undefined, implementation: GetService): GetService {
    return request => {
      if (this.#root.disposed || (id !== undefined && !this.#scopes.has(id))) {
        throw new ObjectDisposedError();
      }
      request[lifetimeKind] = kind;
      request[scopeId] = id;
      return implementation(request);
    };
  }

  /** What a provider's disposal runs for the scope it stands for, in the form the holder disposed through. */
  #release(scope: Scope): Disposable & AsyncDisposable {
    return {
      [Symbol.dispose]: () => disposeScope(scope),
      [Symbol.asyncDispose]: () => disposeScopeAsync(scope),
    };
  }

  #openScope(): IServiceProvider {
    const implementation = this.#implementation;
    if (this.#root.disposed || implementation === undefined) {
      throw new ObjectDisposedError();
    }
    const id = Symbol(`scope-${++this.#count}`);
    const scope = newScope();
    this.#scopes.set(id, scope);
    const provider = new ServiceProvider(this.#marker('scoped', id, implementation));
    scope.provider = provider;
    provider.whenDisposed({
      [Symbol.dispose]: () => this.#endScope(id, scope, disposeScope),
      [Symbol.asyncDispose]: () => this.#endScope(id, scope, disposeScopeAsync),
    });
    return provider;
  }

  /** Ends an opened scope: it leaves the map first, so its provider refuses even while its instances are still disposing. */
  #endScope<R>(id: symbol, scope: Scope, dispose: (scope: Scope) => R): R {
    this.#scopes.delete(id);
    return dispose(scope);
  }

  /**
   * The provider asks under `scope` answer for `IServiceProvider`: the scope's own, or the
   * container's. The container's is known from its first ask, and every scope is opened through a
   * factory resolved from it, so the view minted here — the same asks, entered the same way — stands
   * in only for a construction the container's own provider has somehow not yet preceded.
   */
  #providerOf(scope: Scope): IServiceProvider {
    if (scope.provider === undefined) {
      scope.provider = new ServiceProvider(this.#marker('singleton', undefined, this.#implementation!));
    }
    return scope.provider;
  }

  /** The scope an ask entered through, by the id its marker stamped. */
  #scopeOf(request: Request): Scope {
    const id = request[scopeId];
    const scope = id === undefined ? this.#root : this.#scopes.get(id as symbol);
    if (this.#root.disposed || scope === undefined || scope.disposed) {
      throw new ObjectDisposedError();
    }
    return scope;
  }

  readonly #hooks: Behavior<Scope> = {
    beginResolve: (request: Request): Scope => this.#scopeOf(request),

    beforeConstruct: (construction: Hooks.Construction<Scope>): Hooks.Interception<Scope> => {
      const { registration, populatedAddress, state } = construction;
      if (registration === this.#providerRegistration) {
        return { result: this.#providerOf(state) };
      }
      switch (lifetimeOf(registration)) {
        case 'singleton': {
          const cached = lookup(this.#root, registration, populatedAddress);
          return cached.hit ? { result: cached.value } : { state: this.#root };
        }
        case 'scoped': {
          const cached = lookup(state, registration, populatedAddress);
          return cached.hit ? { result: cached.value } : { state };
        }
        case 'transient':
        case undefined:
          return { state };
      }
    },

    afterConstruct: (construction: Hooks.Construction<Scope>, instance: unknown): void => {
      const { registration, populatedAddress, state } = construction;
      const lifetime = lifetimeOf(registration);
      const keeper = lifetime === 'singleton' ? this.#root : lifetime === 'scoped' ? state : undefined;
      const owner = lifetime === 'singleton' ? this.#root : lifetime === undefined ? undefined : state;
      if (keeper !== undefined) {
        store(keeper, registration, populatedAddress, instance);
      }
      if (owner === undefined) {
        return;
      }
      if (!isThenable(instance)) {
        capture(owner, instance);
        return;
      }
      instance.then(
        settled => {
          try {
            capture(owner, settled);
          } catch {
            // The owner ended while the construction was pending: the settled value is disposed
            // and the caller, who already holds the promise, is not told twice.
          }
        },
        () => {
          if (keeper !== undefined) {
            evict(keeper, registration, populatedAddress, instance);
          }
        },
      );
    },
  };
}

/** The factory behind the model's `IServiceProvider` registration — never called, since the model answers that construction itself. */
function unreachableProvider(): IServiceProvider {
  throw new Error('the standard lifetime model answers IServiceProvider before construction');
}

function lifetimeOf(registration: Registration<unknown>): StandardLifetime | undefined {
  if (Registration.isValueRegistration(registration)) {
    return undefined;
  }
  const lifetime = registration.lifetime;
  return lifetime === 'singleton' || lifetime === 'scoped' || lifetime === 'transient' ? lifetime : undefined;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as PromiseLike<unknown>).then === 'function';
}
