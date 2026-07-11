# @rhombus-std/hosting.core

The abstraction contracts for the Generic Host — the reference `Hosting.Abstractions` analog.
Ships the host/hosted-service/lifetime/environment/builder interfaces, the concrete values the
reference co-locates in its abstractions package, the shared DI-slot tokens, and the reference
extension methods as named functions or a side-effect augmentation.

`@rhombus-std/hosting` is the runtime built on top of this — see its
[README](../hosting/README.md) for the composed `HostBuilder`/`HostApplicationBuilder` and the
static `Host` factory.

## What it ships

- **Contracts.** `IHost`, `IHostedService`, `IHostedLifecycleService`,
  `IHostApplicationLifetime`, `IHostLifetime`, `IHostEnvironment`, `HostBuilderContext`,
  `IHostBuilder`, `IHostApplicationBuilder`.
- **Concrete values.** `BackgroundService` (the abstract long-running-service base),
  `HostAbortedError`, `Environments`, `HostDefaults` — the reference ships these directly
  in its abstractions package, not as pure types, and so does this one.
- **DI-slot tokens.** `HOST_APPLICATION_LIFETIME_TOKEN`, `HOSTED_SERVICE_TOKEN`,
  `hostedServiceCollectionToken()` — the shared token ABI a host and its consumers both need.
- **Host-lifetime helpers.** `run`/`runAsync`/`stopWithTimeout`/`waitForShutdownAsync`,
  `startHost` — plain functions over `IHost`/`IHostBuilder` (these interfaces are owned by this
  family, so no augmentation is needed).
- **Environment predicates.** `isDevelopment`/`isEnvironment`/`isProduction`/`isStaging`.
- **`addHostedService`.** A side-effect augmentation onto `@rhombus-std/di.core`'s
  `ServiceManifestClass` — registers a hosted service under the shared collection token as a
  singleton. Importing this package installs it.

## Dependencies

Mirrors the reference `Hosting.Abstractions → {Configuration,DependencyInjection,Diagnostics,
FileProviders,Logging}.Abstractions` edge exactly: `@rhombus-std/config.core`,
`@rhombus-std/di.core`, `@rhombus-std/diagnostics.core`, `@rhombus-std/fileproviders.core`,
`@rhombus-std/logging.core`.

## Not a types-only package

Unlike `config.core`, this package emits real runtime — `BackgroundService`, the
`Environments`/`HostDefaults` const objects, and the `addHostedService` prototype patch — so it
is **dist-referenced**, not src-referenced, and keeps every `@rhombus-std/*` dependency external
in its build. See `docs/decisions.md` §9 and §21 for why: inlining would fork
`di.core`'s `ServiceManifestClass` identity and the augmentation above would patch a private
copy no consumer's container resolves against.
