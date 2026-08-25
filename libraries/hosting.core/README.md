# @rhombus-std/hosting.core

**The contracts a long-running application host is built from.**

This package defines what a "host" is: the object that owns your service
container, starts and stops your background work, and tracks the
application's lifetime — plus the smaller pieces (a hosted service, an
environment, a builder) a host is assembled out of. It ships no running
implementation; it's the shared vocabulary a host runtime and its consumers
agree on.

## Install

```sh
bun add @rhombus-std/hosting.core @rhombus-std/di.core @rhombus-std/di @rhombus-std/primitives
```

`@rhombus-std/hosting.core` depends on `@rhombus-std/di.core`,
`@rhombus-std/config.core`, `@rhombus-std/logging.core`,
`@rhombus-std/diagnostics.core`, `@rhombus-std/fileproviders.core`, and
`@rhombus-std/primitives` — bun installs those automatically as regular
dependencies. `@rhombus-std/di` is what turns a manifest into a resolvable
container; this package doesn't depend on it itself, since
`getHostedServiceManifest` only ever hands you a manifest to merge.

Importing this package installs the `IHost` / `IHostBuilder` /
`IHostEnvironment` helper methods described below as a side effect — keep the
import even if you never reference a named export:

```ts
import '@rhombus-std/hosting.core';
```

If you also install `@rhombus-std/hosting` (the runtime), it re-exports this
package, so a single import from there covers both.

## Usage

The most common thing you'll reach for directly from this package is
`getHostedServiceManifest`, for registering long-running work:

```ts
import { di } from '@rhombus-std/di';
import { LifetimeModel, Manifest } from '@rhombus-std/di.core';
import { BackgroundService, getHostedServiceManifest, hostedServiceCollectionType } from '@rhombus-std/hosting.core';
import type { AbortSignal } from '@rhombus-std/primitives';

class Worker extends BackgroundService {
  protected async execute(stoppingSignal: AbortSignal): Promise<void> {
    while (!stoppingSignal.aborted) {
      // do periodic work here
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

let services: Manifest<'singleton'> = Manifest.empty<'singleton'>();
services = services.addMany(getHostedServiceManifest(Worker));

const provider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build();
const workers = provider.resolve(hostedServiceCollectionType()); // [Worker instance]
```

`BackgroundService` is a base class for a service whose real work is a single
long-running loop: implement `execute`, and a running host starts it without
blocking startup, then awaits it (with a grace period) on shutdown.
`getHostedServiceManifest` builds its registration on the narrowest lifetime
vocabulary it needs (`'singleton'`) and hands back a manifest — merging it
into your own, as above, is what checks your manifest's vocabulary covers it.
It accepts a class (with its constructor dependencies) or a factory function;
either way, every hosted service registered this way shares one address, so
`hostedServiceCollectionType()` resolves the whole group together, in
registration order.

## Key exports

| Export                                      | What it is                                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `IHost`                                     | The running application: `services` (a resolver), `start()`, `stop()`.                                                             |
| `IHostedService`                            | A unit of work the host starts and stops: `start(abortSignal)`, `stop(abortSignal)`.                                               |
| `IHostedLifecycleService`                   | Extends `IHostedService` with `starting`/`started`/`stopping`/`stopped` hooks that run around it.                                  |
| `BackgroundService`                         | Base class for a hosted service that's really one long-running loop — implement `execute`.                                         |
| `IHostApplicationLifetime`                  | Lifetime signals (`applicationStarted`/`applicationStopping`/`applicationStopped`) plus `stopApplication()` to request a shutdown. |
| `IHostLifetime`                             | Hook a host calls into around `start`/`stop` — for example, to wait on an external signal before starting.                         |
| `IHostBuilder`                              | Assembles a host: `configureHostConfig`, `configureAppConfig`, `configureServices`, `build()`.                                     |
| `IHostApplicationBuilder`                   | The newer builder shape: exposes `configuration`, `environment`, `logging`, `metrics`, and `services` directly as properties.      |
| `IHostEnvironment`                          | Where the app is running: `environmentName`, `applicationName`, `contentRootPath`, `contentRootFileProvider`.                      |
| `HostBuilderContext`                        | Carries `hostingEnvironment`, `configuration`, and `properties` through the build process.                                         |
| `Environments`                              | Common environment name constants (`Development`, `Staging`, `Production`).                                                        |
| `HostDefaults`                              | The configuration key names a host reads to set `applicationName`, `environment`, and `contentRoot`.                               |
| `HostAbortedError`                          | Thrown to signal a host is stopping gracefully — not meant to be handled by application code.                                      |
| `HostLifecycleAugmentations`                | Helpers over `IHost`: `run`/`runAsync` (start, wait for shutdown, dispose), `waitForShutdownAsync`, `stopWithTimeout`.             |
| `HostBuilderStartAugmentations`             | `startHost` — builds an `IHostBuilder` and starts it in one call.                                                                  |
| `HostEnvironmentEnvAugmentations`           | Environment predicates: `isEnvironment`, `isDevelopment`, `isStaging`, `isProduction`.                                             |
| `getHostedServiceManifest`                  | Builds a hosted-service registration on `Manifest<'singleton'>` and hands it back — merge the result into your own manifest.       |
| `hostedServiceCollectionType`               | The address that resolves every `getHostedServiceManifest` registration together, in registration order.                          |

The `*Extensions` object literals double as fluent methods once a concrete
host implementation installs them — call `host.waitForShutdownAsync()`
directly on an `IHost`, or call
`HostLifecycleAugmentations.waitForShutdownAsync(host)` against the
plain interface. Both forms do exactly the same thing.

## How it fits

`@rhombus-std/hosting.core` is the abstractions layer for hosting: it depends
on [`@rhombus-std/di.core`](../di.core/README.md) for the service container
interfaces it threads through builders and services,
[`@rhombus-std/config.core`](../config.core/README.md) for the configuration
shape a `HostBuilderContext` carries, [`@rhombus-std/logging.core`](../logging.core/README.md)
and [`@rhombus-std/diagnostics.core`](../diagnostics.core/README.md) for the
builders `IHostApplicationBuilder` exposes, and
[`@rhombus-std/fileproviders.core`](../fileproviders.core/README.md) for
`IHostEnvironment.contentRootFileProvider`.

[`@rhombus-std/hosting`](../hosting/README.md) is the runtime built on top of
these contracts — the actual `HostBuilder`, `HostApplicationBuilder`, and
`Host` classes that implement them, composed with the concrete `di`, `config`,
`logging`, and `diagnostics` packages. Install `@rhombus-std/hosting.core` on
its own only if you're authoring against the abstractions directly — for
example, a library that accepts an `IHost` or registers an `IHostedService`
without depending on the runtime. Most applications should install
`@rhombus-std/hosting` instead, which re-exports everything here.
[`@rhombus-std/hosting.browser`](../hosting.browser/README.md) hosts the same
abstractions in a web page.

## Notes

- This package has no running host — `IHostBuilder.build()` and every
  lifetime method here are contracts other packages implement. If you want a
  working application host, install `@rhombus-std/hosting`.
- The `IHost`/`IHostBuilder`/`IHostEnvironment` helper methods only exist
  once this package (or something that imports it, like
  `@rhombus-std/hosting`) has actually been imported somewhere in your
  program — it's a side effect of the import, not something that happens
  automatically from installing the package. `getHostedServiceManifest`
  needs no such import: it's an ordinary function call.
