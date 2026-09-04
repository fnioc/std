# The standard lifetime model — design

Status: specs ruled by the owner 2026-09-02. Architecture pending the API surface push named below.
Implementation follows as a cloud run briefed from this document, greenlit by the owner 2026-09-02
on the condition that the architecture is complete first.

## Specs

### The addon

- The standard lifetime model is an addon. The engine knows nothing of lifetimes.
- The addon installs two middlewares on the provider it builds, outermost first:
  1. **The marker middleware.** Stamps every request with the lifetime kind of the provider it
     entered through. On the addon's own provider the kind is `'singleton'`.
  2. **The implementation middleware.** The whole lifetime model, implemented with hooks only. It
     holds every cache: the singleton cache, and one cache plus one disposable set per open scope,
     keyed by scope id.
- The addon registers a scope factory as a single instance. The factory holds a reference to the
  implementation middleware, not to any provider.

### Opening a scope

- `openScope()` takes no argument. Each call mints a fresh scope id (a `Symbol`), builds a marker
  middleware stamping kind `'scoped'` and that id, and returns a new `ServiceProvider` whose
  pipeline is that marker over the same implementation middleware.
- Markers never stack: exactly one per provider. The operation is identical whether the factory was
  resolved from the `'singleton'` provider or from a scope.
- Every open scope is independent: its own cache, its own disposables. Only singletons are shared,
  because every provider passes through the one implementation middleware.
- Disposing the provider returned by `openScope()` disposes that scope's disposables and drops its
  cache. Other scopes and the singletons are untouched.

### The marker contract

One symbol-keyed prop on the request: the id of the scope the ask entered through. Every scope has
an id, the singleton scope included, so one marker middleware serves every provider and the reader
does one table lookup.

| key      | value             | on the addon's provider  | on an opened scope |
| -------- | ----------------- | ------------------------ | ------------------ |
| scope id | a unique `Symbol` | the singleton scope's id | the scope's id     |

The shape (owner-approved 2026-09-04): an `Addon` is stateless and reusable; its `create()` runs
once per installation and returns an `AddonInstallation`, the `{ registrations, middleware }` pair.
Inside `create()`: the lifetime middleware is built once, when the installation's middleware
receives the engine's `getService`, into a slot the scope factory already holds; the scope factory
is a class registered as a value; each provider is that one function wrapped in a marker carrying
its scope's id.

```ts
export function standardLifetime(): Addon<StandardLifetime> {
  return {
    create(): AddonInstallation<StandardLifetime> {
      const state = { lifetime: undefined as GetService | undefined, scopes: new ScopeTable() };
      const singletons = state.scopes.open();
      return {
        registrations: [Registration.value(typefor<IServiceScopeFactory>(), new ScopeFactory(state))],
        middleware: getService => {
          state.lifetime = lifetimeMiddleware(getService, state.scopes, singletons); // the one write
          return createMarkerMiddleware(singletons.id)(state.lifetime);
        },
      };
    },
  };
}

class ScopeFactory implements IServiceScopeFactory {
  constructor(readonly #state: { lifetime: GetService | undefined; scopes: ScopeTable }) {}
  openScope(): IServiceProvider {
    const scope = this.#state.scopes.open();
    return new ServiceProvider(createMarkerMiddleware(scope.id)(this.#state.lifetime!));
  }
}
```

The slot is never read empty: the factory is reachable only through a built provider, and the
middleware call that fills the slot runs before any provider exists. The lifetime rules and
`validateScopes` find the singleton scope through the addon's own reference to it, never through a
stamp on the request.

### Resolution behavior

| registration lifetime | entered via the addon's provider                                | entered via a scope                          |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| singleton             | singleton cache                                                 | singleton cache                              |
| scoped                | singleton cache (the validation layer turns this into an error) | that scope's cache                           |
| transient             | fresh instance; the singleton scope owns its disposal           | fresh instance; that scope owns its disposal |

- A transient is resolvable from any provider. A disposable transient resolved from the
  `'singleton'` provider is held until that provider disposes.
- A transient injected into a singleton lives as long as the singleton. That is not a validation
  error.

A collection ask — the engine's synthesised collection over every registration of one address — is
fresh per ask: the collection itself is never cached, and each element is answered by its own
registration under that registration's lifetime, so a singleton element is the container-wide
instance while a scoped element is that scope's. A registration whose product is an array is not
that: it is one service like any other, with one lifetime over the whole array, cached and disposed
as a unit, its elements never reached individually.

### Validation

Optional, each an additional middleware layer, off unless added:

- scoped resolved from the `'singleton'` provider;
- captive dependency (scoped injected into a singleton);
- validate on build.

### Everything else

Runtime behavior matches Microsoft.Extensions.DependencyInjection exactly: lifetime, caching,
disposal, and the conditions validation rejects. The API surface is this repository's own. Where
this document is silent on behavior, Microsoft.Extensions.DependencyInjection decides. Its observable behavior is catalogued in
`standard-lifetime-model.reference-behavior.md`, extracted from its source, which is not reachable
from the cloud. Error types and messages are not cloned verbatim; the conditions that raise them
are.

### Documentation

Against the repository's usual rule, every doc and doc-comment of the standard lifetime model says
explicitly that it is a clone of Microsoft.Extensions.DependencyInjection, with that name spelled
out in full, never abbreviated.

## Architecture

Ruled by the owner 2026-09-02 against the di API at `origin/feat-di-request-door` 234a383b and the
behavior catalogue. Two engine seams it depends on are in flight on that branch: a plan-time hook,
and disposal on the provider with a subscription seam.

### Placement

| declaration                                                    | package | file                                | why there                                                                         |
| -------------------------------------------------------------- | ------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| `StandardLifetime`, `IServiceScopeFactory`                     | di.core | one file each, named after the type | a library registering services or opening scopes references abstractions only     |
| `ObjectDisposedError`                                          | di.core | `src/Errors.ts`                     | the error taxonomy lives there                                                    |
| `standardLifetime()`, the scope state, the two request symbols | di      | `src/addons/standard-lifetime/`     | it constructs the concrete `ServiceProvider`, which only the engine package holds |
| `validateScopes()`, `ScopeValidationError`                     | di      | `src/addons/standard-lifetime/`     | it reads the model's request symbols; "scope" in di.core would leak vocabulary    |

`@rhombus-std/di` re-exports `standardLifetime`, `validateScopes` and `ScopeValidationError` beside
`validateBuildability` and `validateUniversalAddresses`. `@rhombus-std/di.core` re-exports the two
abstractions and the error. The request symbols stay module-level within `di`, not on the barrel.

### Public declarations, all new

Names follow this repository's conventions, not the clone's.

```ts
// di.core
/** The standard lifetime model's vocabulary: a clone of Microsoft.Extensions.DependencyInjection's service lifetimes. */
export type StandardLifetime = 'singleton' | 'scoped' | 'transient';

/** Opens scopes. One instance per container, resolvable from every provider, always the same one. */
export interface IServiceScopeFactory {
  /** A new scope's provider, independent of every other scope; disposing it ends the scope. */
  openScope(): IServiceProvider;
}

/** A resolution or scope opening reached a provider whose container or scope is already disposed. */
export class ObjectDisposedError extends DiError {}

// di
/** The standard lifetime model as an addon. */
export function standardLifetime(): Addon<StandardLifetime>;

/** Optional layer refusing a scoped registration reached under the singleton scope. */
export function validateScopes(): Addon<StandardLifetime>;

/** A scoped registration reached under the singleton scope: resolved from the container's own provider, or consumed by a singleton. */
export class ScopeValidationError extends DiError {
  readonly address: Type;
}
```

A scope is its provider: `IServiceProvider` is disposable, so `openScope()` answers the scope's
provider and disposing it ends the scope. No scope type exists beyond that.

Opening a scope goes through the factory alone: no augmentation puts `openScope` on `IServiceProvider`,
so the core interface's shape carries no scope vocabulary. That can follow the day a concrete consumer
asks for it.

The vocabulary is strict: `undefined` is not in it, so every constructor and factory registration
names its lifetime, as every service descriptor in Microsoft.Extensions.DependencyInjection carries
one. A value registration carries none and behaves as a pre-built singleton instance does there:
handed back as it stands, never captured for disposal.

### Usage

```ts
await using provider = Builder
  .useAddon(standardLifetime())
  .withServices(m => m.add(typefor<Foo>(), Foo, fooCtorType, 'scoped'))
  .build();

using scope = provider.resolve(typefor<IServiceScopeFactory>()).openScope();
const foo = scope.resolve(typefor<Foo>());
```

### The chain

The addon's one `Middleware` composes the two layers at build time and hands the inner one to the
scope factory. A scope's marker is nothing but the `source` its provider is minted over; the
container's marker is the outer half of the addon's own middleware, since `build()` mints that
provider:

```ts
function middleware(next: GetService): GetService {
  const control = next(new ControlRequest(typefor<ControlService>())) as ControlService;
  const handle = control.stageHooks(hooks);
  function implementation(request: Request) {
    return next(request.activate(handle));
  }
  scopeFactory.attach(implementation);
  return marker('singleton', undefined, implementation);
}

function marker(kind: 'singleton' | 'scoped', id: symbol | undefined, implementation: GetService): GetService {
  return function mark(request) {
    if (disposed(id)) {
      throw new ObjectDisposedError();
    }
    request[lifetimeKind] = kind;
    request[scopeId] = id;
    return implementation(request);
  };
}

function openScope(): IServiceProvider {
  const id = Symbol(`scope-${++count}`);
  scopes.set(id, newScope());
  const provider = new ServiceProvider(marker('scoped', id, implementation));
  subscribe(provider, () => release(id)); // the engine's dispose seam, name per the engine
  return provider;
}
```

The container's own provider is subscribed the same way, at fold time, to release `root`. The scope
factory is filed through `Addon.registrations` as a value registration, so it is the one instance
everywhere and is never captured for disposal.

### State inside the implementation

```ts
interface Scope {
  readonly cache: Map<Registration<unknown>, Map<Type, unknown>>; // by registration identity, then by populated address
  readonly disposables: unknown[]; // capture order
  disposed: boolean;
}
const root: Scope; // the container's own: singletons, and everything owned by the 'singleton' provider
const scopes: Map<symbol, Scope>; // one per openScope(), keyed by the id the marker stamps
```

Keying by registration identity and then by populated address gives an open-generic registration
one entry per closing, and gives several registrations of one address one entry each, which is what
keeps `resolveMany` elements distinct and the newest one identical to the single resolution. An
interned `Type` keys the inner map by identity; otherwise a structural key does, which the
implementer confirms against the engine.

### The hooks

The behavior threads one state: the `Scope` the current constructions run under.

| hook               | does                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginResolve`     | answers the `Scope` for `request[scopeId]`, `root` when the key is absent                                                                                                                                                                                                                                                                                                                                                  |
| `beforeConstruct`  | `singleton`: hit in `root.cache` answers `{ result }`, miss answers `{ state: root }` so the dependencies resolve under the container. `scoped`: same against `state.cache`, which is `root.cache` when the state is `root`. `transient`, a value, an engine row: `{ state }`.                                                                                                                                             |
| `afterConstruct`   | stores under the same rule (`transient` stores nothing), then captures the instance in the owning scope's list when it has `Symbol.dispose` or `Symbol.asyncDispose`: `singleton` in `root`, `scoped` and `transient` in `state`. An owning scope already disposed disposes the instance at once and throws `ObjectDisposedError`. A promise is captured by the derived promise instead, and a rejection evicts the entry. |
| `canonicalize`     | a construction that produced a promise is swapped for one derived from it: on settlement the value is captured in the owning scope, and an owning scope that ended meanwhile has the value disposed and the derived promise rejects with `ObjectDisposedError`                                                                                                                                                             |
| the plan-time hook | not used by the model                                                                                                                                                                                                                                                                                                                                                                                                      |

What the construction produced is what is cached — for a promise, the derived promise the caller is
handed — so concurrent asynchronous resolutions share one pending construction. A promise that
rejects evicts its entry, so the next ask retries; a promise's settled value is what is captured for
disposal, on settlement.

`IServiceProvider` resolved under a singleton's dependencies must be the container's own provider,
not the provider the ask entered through. The engine's `IServiceProvider` row answers the request's
provider; the model overrides it under a `root` state from `beforeConstruct`, if that row is a
construction the hook sees. The implementer confirms that against the engine.

### Disposal

- Disposing a scope's provider: the engine's seam tells the model, which marks the scope disposed,
  deduplicates its list by reference, walks it in reverse, and collects every error rather than
  stopping; one error rethrows as itself, more than one throw an `AggregateError`. The synchronous
  form records an error for an instance that has only `Symbol.asyncDispose`; the asynchronous form
  awaits each and calls a synchronous-only instance synchronously. A second dispose is a no-op. The
  cache is kept; resolution through that provider refuses first with `ObjectDisposedError`.
- Disposing the container's provider: the same walk over `root`. Afterwards every provider, the
  container's and every scope's, throws `ObjectDisposedError` on resolution, and `openScope` throws.
  An open scope's own list is disposed only when that scope's provider is disposed.

### `validateScopes()`

A separate addon staging its own hooks and threading its own state, the kind its constructions run
under. The plan-time hook carries the captive check: it answers `'singleton'` under a singleton
registration and throws `ScopeValidationError` for a scoped registration under that state, once per
plan, which is at build under `validateBuildability()` and otherwise at first resolution.
`beginResolve` reads `request[lifetimeKind]` and `beforeConstruct` throws for a scoped registration
under a `'singleton'` state, which is the per-resolution check for a scoped service reached through
the container's own provider. The scope factory is a value, never constructed, so a singleton
holding it never trips either check.

### Behavior map

| catalogue                                          | mechanism                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| §1 caches, last wins, per-element lifetimes        | engine's registry order plus the two-level cache key                                         |
| §1 once-only creation, failure never cached        | the cached promise for asynchronous builds; `afterConstruct` never runs for a throwing build |
| §2 flat scopes, one factory, `IServiceProvider`    | `openScope` over the shared implementation; the value-registered factory; the row override   |
| §2 unvalidated scoped from root promoted           | `state.cache` is `root.cache` under `root`                                                   |
| §3 capture rules, ownership, order, dedupe, errors | `afterConstruct` capture; the disposal walk behind the provider's dispose seam               |
| §4 validation, both checks at their own moments    | `validateScopes()` on the plan-time hook and on `beforeConstruct`                            |
| §5 built-ins                                       | engine rows plus the value-registered scope factory                                          |
| §6 keyed services                                  | out of scope                                                                                 |
