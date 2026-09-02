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

Pending. The types plan against the di API surface on `origin/feat-di-request-door` once the request
door's current state is pushed there (asked of the run 2026-09-02, commit subject to contain "api
surface"): middleware and request, hooks, addon shape, `ServiceProvider` construction, scope
abstractions in di.core, registration lifetime, dispose protocol. The hooks surface to plan against
is the one carrying `Request.activate(hooks_handle)`; a surface without it is the earlier shape.

The implementation must verify every behavior it matches against the reference source itself,
not against this document's summary of it.
