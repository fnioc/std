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

Two symbol-keyed props on the request:

| key           | value                     | on the addon's provider | on an opened scope |
| ------------- | ------------------------- | ----------------------- | ------------------ |
| lifetime kind | `'singleton' \| 'scoped'` | `'singleton'`           | `'scoped'`         |
| scope id      | a unique `Symbol`         | absent                  | the scope's id     |

### Resolution behavior

| registration lifetime | entered via the `'singleton'` provider                          | entered via a scope                          |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| singleton             | singleton cache                                                 | singleton cache                              |
| scoped                | singleton cache (the validation layer turns this into an error) | that scope's cache                           |
| transient             | fresh instance; the `'singleton'` provider owns its disposal    | fresh instance; that scope owns its disposal |

- A transient is resolvable from any provider. A disposable transient resolved from the
  `'singleton'` provider is held until that provider disposes.
- A transient injected into a singleton lives as long as the singleton. That is not a validation
  error.

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

Proposed against the di API at `origin/feat-di-request-door` 234a383b and the behavior catalogue.
Every declaration marked new lands only on the owner's signoff; the signoff list is at the end.

### Placement

| declaration                                                                       | package | file                                | why there                                                                         |
| --------------------------------------------------------------------------------- | ------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| `ServiceLifetime`, `IServiceScope`, `IServiceScopeFactory`                        | di.core | one file each, named after the type | a library registering services or opening scopes references abstractions only     |
| `ObjectDisposedError`, `ScopeValidationError`                                     | di.core | `src/Errors.ts`                     | the error taxonomy lives there                                                    |
| `standardLifetime()`, `StandardLifetimeAddon`, the scope, the two request symbols | di      | `src/addons/standard-lifetime/`     | it constructs the concrete `ServiceProvider`, which only the engine package holds |
| `validateScopes()`                                                                | di      | `src/addons/standard-lifetime/`     | it reads the model's request symbols                                              |

`@rhombus-std/di` re-exports `standardLifetime` and `validateScopes` beside `validateBuildability`
and `validateUniversalAddresses`. `@rhombus-std/di.core` re-exports the three abstractions and the
two errors. The request symbols stay module-level within `di`, not on the barrel.

### Public declarations, all new

```ts
// di.core
/** The standard lifetime model's vocabulary: a clone of Microsoft.Extensions.DependencyInjection's ServiceLifetime. */
export type ServiceLifetime = 'singleton' | 'scoped' | 'transient';

/** One open scope: the provider that resolves inside it, and the disposal that ends it. */
export interface IServiceScope extends Disposable, AsyncDisposable {
  readonly serviceProvider: IServiceProvider;
}

/** Opens scopes. One instance per container, resolvable from every provider, always the same one. */
export interface IServiceScopeFactory {
  createScope(): IServiceScope;
}

/** A resolution or scope opening reached a provider whose container or scope is already disposed. */
export class ObjectDisposedError extends DiError {}

/** A scoped registration reached under the singleton scope: resolved from the container's own provider, or consumed by a singleton. */
export class ScopeValidationError extends DiError {
  readonly address: Type;
}

// di
/** The standard lifetime model as an addon. Disposing it disposes the container. */
export interface StandardLifetimeAddon extends Addon<ServiceLifetime>, Disposable, AsyncDisposable {}
export function standardLifetime(): StandardLifetimeAddon;

/** Optional layer refusing a scoped registration reached under the singleton scope. */
export function validateScopes(): Addon<ServiceLifetime>;
```

The vocabulary is strict: `undefined` is not in it, so every constructor and factory registration
names its lifetime, as every service descriptor in Microsoft.Extensions.DependencyInjection carries
one. A value registration carries none and behaves as a pre-built singleton instance does there:
handed back as it stands, never captured for disposal.

### Usage

```ts
const model = standardLifetime();
const provider = Builder
  .useAddon(model)
  .withServices(m => m.add(typefor<Foo>(), Foo, fooCtorType, 'scoped'))
  .build();

using scope = provider.resolve(typefor<IServiceScopeFactory>()).createScope();
const foo = scope.serviceProvider.resolve(typefor<Foo>());

await model[Symbol.asyncDispose]();
```

### The chain

The addon's one `Middleware` composes the two layers at build time, and hands the inner one to the
scope factory:

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

function createScope(): IServiceScope {
  const id = Symbol(`scope-${++count}`);
  scopes.set(id, newScope());
  const serviceProvider = new ServiceProvider(marker('scoped', id, implementation));
  return { serviceProvider, [Symbol.dispose]: () => disposeScope(id),
    [Symbol.asyncDispose]: () => disposeScopeAsync(id) };
}
```

The scope factory is filed through `Addon.registrations` as a value registration, so it is the one
instance everywhere and is never captured for disposal.

### State inside the implementation

```ts
interface Scope {
  readonly cache: Map<Registration<unknown>, Map<Type, unknown>>; // by registration identity, then by populated address
  readonly disposables: unknown[]; // capture order
  disposed: boolean;
}
const root: Scope; // the container's own: singletons, and everything owned by the 'singleton' provider
const scopes: Map<symbol, Scope>; // one per createScope(), keyed by the id the marker stamps
```

Keying by registration identity and then by populated address gives an open-generic registration
one entry per closing, and gives several registrations of one address one entry each, which is what
keeps `resolveMany` elements distinct and the newest one identical to the single resolution.

### The hooks

The behavior threads one state: the `Scope` the current constructions run under.

| hook              | does                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginResolve`    | answers the `Scope` for `request[scopeId]`, `root` when the key is absent                                                                                                                                                                                                                                                          |
| `beforeConstruct` | `singleton`: hit in `root.cache` answers `{ result }`, miss answers `{ state: root }` so the dependencies resolve under the container. `scoped`: same against `state.cache`, which is `root.cache` when the state is `root`. `transient`, a value, an engine row: `{ state }`.                                                     |
| `afterConstruct`  | stores under the same rule (`transient` stores nothing), then captures the instance in the owning scope's list when it has `Symbol.dispose` or `Symbol.asyncDispose`: `singleton` in `root`, `scoped` and `transient` in `state`. An owning scope already disposed disposes the instance at once and throws `ObjectDisposedError`. |
| `canonicalize`    | not used                                                                                                                                                                                                                                                                                                                           |

What the construction produced is what is cached, a promise included, so concurrent asynchronous
resolutions share one pending construction. A promise that rejects evicts its entry, so the next ask
retries; a promise's settled value is what is captured for disposal, on settlement.

`IServiceProvider` resolved under a singleton's dependencies must be the container's own provider,
not the provider the ask entered through. The engine's `IServiceProvider` row answers the request's
provider; the model overrides it under a `root` state from `beforeConstruct`, if that row is a
construction the hook sees. The implementer confirms that against the engine.

### Disposal

- Disposing a scope: idempotent; marks it disposed; deduplicates its list by reference; walks it in
  reverse; collects every error rather than stopping; one error rethrows as itself, more than one
  throw an `AggregateError`. The synchronous form records an error for an instance that has only
  `Symbol.asyncDispose`; the asynchronous form awaits each and calls a synchronous-only instance
  synchronously. The cache is kept; resolution through the scope's provider refuses first.
- Disposing the container, through the addon: the same walk over `root`. Afterwards every
  provider, the container's and every scope's, throws `ObjectDisposedError` on resolution, and
  `createScope` throws. An open scope's own list is disposed only when that scope is disposed.

### `validateScopes()`

A separate addon staging its own hooks, threading its own state, the kind its constructions run
under: `beginResolve` reads `request[lifetimeKind]`; `beforeConstruct` answers `{ state: 'singleton' }`
for a singleton registration, throws `ScopeValidationError` for a scoped registration under a
`'singleton'` state, and passes the state through otherwise. The scope factory is a value, never
constructed, so a singleton holding it never trips the check. The check runs on every resolution,
as the root-provider check does in Microsoft.Extensions.DependencyInjection; the captive check
fires at the first construction under the singleton rather than at plan time.

### Behavior map

| catalogue                                          | mechanism                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| §1 caches, last wins, per-element lifetimes        | engine's registry order plus the two-level cache key                                         |
| §1 once-only creation, failure never cached        | the cached promise for asynchronous builds; `afterConstruct` never runs for a throwing build |
| §2 flat scopes, one factory, `IServiceProvider`    | `createScope` over the shared implementation; the value-registered factory; the row override |
| §2 unvalidated scoped from root promoted           | `state.cache` is `root.cache` under `root`                                                   |
| §3 capture rules, ownership, order, dedupe, errors | `afterConstruct` capture; the disposal walk                                                  |
| §4 validation                                      | `validateScopes()`; build-time validation stays `validateBuildability()`                     |
| §5 built-ins                                       | engine rows plus the value-registered scope factory                                          |
| §6 keyed services                                  | out of scope                                                                                 |

### Signoff

1. Names follow Microsoft.Extensions.DependencyInjection: `createScope`, `IServiceScope`,
   `IServiceScopeFactory`, `ServiceLifetime`. The scope factory answers an `IServiceScope` carrying
   the provider, not a bare provider, because a scope has to be disposable.
2. The container disposes through the addon object, since `Builder.build()` answers a plain
   `IServiceProvider` and the model cannot put disposal on every provider.
3. Two new errors in di.core: `ObjectDisposedError`, `ScopeValidationError`.
4. Abstractions in di.core, model and validation in di, under `src/addons/standard-lifetime/`.
5. The cache's inner key is the populated address: an interned `Type` keys a `Map` by identity;
   anything else needs a structural key. The implementer confirms which the engine provides.
6. Parity gap: `validateBuildability()` plans without constructing, so nothing catches a captive
   dependency at build time the way `ValidateOnBuild` with `ValidateScopes` does.
