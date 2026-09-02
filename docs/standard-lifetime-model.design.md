# The standard lifetime model — design

Status: specs ruled by the owner 2026-09-02. Architecture proposed below, awaiting signoff.

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

| key           | value                    | on the addon's provider | on an opened scope |
| ------------- | ------------------------ | ----------------------- | ------------------ |
| lifetime kind | `'singleton' \| 'scoped'` | `'singleton'`           | `'scoped'`         |
| scope id      | a unique `Symbol`        | absent                  | the scope's id     |

### Resolution behavior

| registration lifetime | entered via the `'singleton'` provider                              | entered via a scope                            |
| --------------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| singleton             | singleton cache                                                     | singleton cache                                |
| scoped                | singleton cache (the validation layer turns this into an error)     | that scope's cache                             |
| transient             | fresh instance; the `'singleton'` provider owns its disposal        | fresh instance; that scope owns its disposal   |

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

Behavior and disposal match the reference container, `ME.DependencyInjection`, exactly. Where this
document is silent, the reference decides.

## Architecture

Pending the API shapes the types plan against.
