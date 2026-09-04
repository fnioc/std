import { type Addon, type Behavior, ControlRequest, type ControlService, type GetService, type Hooks, type IServiceProvider, type IServiceScopeFactory, ObjectDisposedError, Registration, type Request,
  ServiceRequest, type StandardLifetime, UnsatisfiableError } from '@rhombus-std/di.core';
import { typefor } from '@rhombus-std/primitives.extras';
import { ServiceProvider } from '../../ServiceProvider.js';
import { capture, disposeScope, disposeScopeAsync, evict, lookup, store } from '../lifetime-scope.js';
import { createMarkerMiddleware } from './marker.js';
import { type ModelState, ScopeFactory } from './ScopeFactory.js';
import { type Scope, ScopeTable } from './ScopeTable.js';
import { scopeId } from './symbols.js';

/**
 * The standard lifetime model as an addon: singleton, scoped and transient, a clone of
 * Microsoft.Extensions.DependencyInjection's lifetimes on this repository's own API.
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
  const scopes = new ScopeTable();
  const singletons = scopes.open();
  const state: ModelState = { lifetime: undefined, scopes, singletons };
  return {
    registrations: [Registration.value(typefor<IServiceScopeFactory>(), new ScopeFactory(state)), providerRegistration],
    middleware: next => {
      state.lifetime = lifetimeMiddleware(next, scopes, singletons);
      const marked = createMarkerMiddleware(singletons.id)(state.lifetime);
      return request => {
        if (singletons.provider === undefined && request instanceof ServiceRequest) {
          adoptContainer(singletons, request.serviceProvider);
        }
        return marked(request);
      };
    },
  };
}

/** Answers the provider of the scope the ask runs under — the container's own under a singleton's dependencies. */
const providerRegistration = Registration.factory<StandardLifetime>(typefor<IServiceProvider>(), unreachableProvider, typefor(unreachableProvider), 'transient');

/**
 * The model itself, built once from the engine's `getService`: every provider of this container
 * runs its asks through this one function, so they share the singletons and differ only in the
 * scope id their marker stamps.
 *
 * @remarks
 * A singleton is one instance per container, disposed with it. A scoped registration is one
 * instance per scope opened through {@link IServiceScopeFactory}, disposed with that scope; reached
 * through the container's own provider it is cached with the singletons, which {@link
 * validateScopes} turns into a refusal. A transient is fresh per ask and per injection site, owned
 * for disposal by the scope the ask ran under — a transient injected into a singleton lives as long
 * as the singleton. A value registration is handed back as it stands and never disposed.
 *
 * What a construction produced is what is cached, a promise included, so concurrent asynchronous
 * asks share one pending construction; a promise that rejects is forgotten, so the next ask tries
 * again. A construction that throws caches nothing.
 */
function lifetimeMiddleware(next: GetService, scopes: ScopeTable, singletons: Scope): GetService {
  const address = typefor<ControlService>();
  const control = next(new ControlRequest(address)) as ControlService;
  if (typeof control?.stageHooks !== 'function') {
    throw new UnsatisfiableError(address, 'a middleware answered the control ask with something other than the engine control');
  }

  /**
   * @throws {ObjectDisposedError} once that scope, or the container itself, has ended.
   */
  function scopeOf(request: Request): Scope {
    const scope = scopes.get(request[scopeId] as symbol);
    if (singletons.disposed || scope === undefined || scope.disposed) {
      throw new ObjectDisposedError();
    }
    return scope;
  }

  /**
   * The provider asks under `scope` answer for `IServiceProvider`.
   *
   * @remarks
   * Every opened scope is given its provider as it opens, and the container's own is known from its
   * first ask, so the view minted here — the same asks, entered the same way — stands in only for a
   * construction the container's own provider has somehow not yet preceded.
   */
  function providerOf(scope: Scope): IServiceProvider {
    scope.provider ??= new ServiceProvider(createMarkerMiddleware(scope.id)(implementation));
    return scope.provider;
  }

  /**
   * The scope that disposes what a construction produced: the singleton scope beneath a singleton,
   * the scope the ask ran under beneath a scoped or transient registration, and none for a value,
   * which is handed back as it stands.
   */
  function ownerOf({ registration, state }: Hooks.Construction<Scope>): Scope | undefined {
    const lifetime = lifetimeOf(registration);
    if (lifetime === 'singleton') {
      return singletons;
    }
    return lifetime === undefined ? undefined : state;
  }

  const hooks: Behavior<Scope> = {
    beginResolve: (request: Request): Scope => scopeOf(request),

    beforeConstruct: (construction: Hooks.Construction<Scope>): Hooks.Interception<Scope> => {
      const { registration, populatedAddress, state } = construction;
      if (registration === providerRegistration) {
        return { result: providerOf(state) };
      }
      switch (lifetimeOf(registration)) {
        case 'singleton': {
          const cached = lookup(singletons, registration, populatedAddress);
          return cached.hit ? { result: cached.value } : { state: singletons };
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

    canonicalize: (construction: Hooks.Construction<Scope>, instance: unknown): unknown => {
      const owner = ownerOf(construction);
      return owner !== undefined && isThenable(instance) ? settleUnder(owner, instance) : instance;
    },

    afterConstruct: (construction: Hooks.Construction<Scope>, instance: unknown): void => {
      const { registration, populatedAddress, state } = construction;
      const lifetime = lifetimeOf(registration);
      const keeper = lifetime === 'singleton' ? singletons : lifetime === 'scoped' ? state : undefined;
      if (keeper !== undefined) {
        store(keeper, registration, populatedAddress, instance);
      }
      const owner = ownerOf(construction);
      if (owner === undefined) {
        return;
      }
      if (!isThenable(instance)) {
        capture(owner, instance);
        return;
      }
      // The promise the caller holds files the settled value itself. What is left here is the
      // failure: a construction that rejected, or an owner that ended before it settled, is
      // forgotten, so the next ask constructs again.
      instance.then(undefined, () => {
        if (keeper !== undefined) {
          evict(keeper, registration, populatedAddress, instance);
        }
      });
    },
  };

  const handle = control.stageHooks(hooks);

  function implementation(request: Request): unknown {
    return next(request.activate(handle));
  }
  return implementation;
}

/**
 * Takes the container's own provider, met on its first ask: what a singleton's dependencies resolve
 * `IServiceProvider` to, and whose disposal ends the singleton scope.
 *
 * @remarks
 * The provider `build()` mints exists only once the chain has folded, so the first ask through it
 * is the earliest it can be known.
 */
function adoptContainer(singletons: Scope, provider: IServiceProvider): void {
  singletons.provider = provider;
  if (provider instanceof ServiceProvider) {
    provider.whenDisposed({
      [Symbol.dispose]: () => disposeScope(singletons),
      [Symbol.asyncDispose]: () => disposeScopeAsync(singletons),
    });
  }
}

/**
 * The promise a caller is handed for a construction that produced one: it settles to the same
 * value, filed for disposal with `owner` — or, where `owner` ended while the construction was
 * pending, it disposes that value and rejects, so no ask is answered with an instance its scope
 * has already let go.
 */
function settleUnder(owner: Scope, product: PromiseLike<unknown>): Promise<unknown> {
  return Promise.resolve(product).then(settled => {
    // capture disposes a settled value its scope can no longer own and refuses the ask; a value
    // with nothing to dispose is refused here just the same.
    capture(owner, settled);
    if (owner.disposed) {
      throw new ObjectDisposedError();
    }
    return settled;
  });
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
