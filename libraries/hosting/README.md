# @rhombus-std/hosting

**The runtime that assembles dependency injection, configuration, and logging into one application host.**

Instead of wiring a container, a config tree, and a logger by hand in every process, you build a `Host`: register your services and background workers on it, call `build()`, then run it. The host starts every hosted service in order, keeps the process alive until something asks it to stop, and stops those services in reverse order — with a timeout, and without leaving half-started work behind.

## Install

```sh
bun add @rhombus-std/hosting
```

`@rhombus-std/hosting` brings in the concrete `di`, `config`, and `logging` packages, plus `options`, itself — there's nothing else to install for the quick start below. Add a config source package (`@rhombus-std/config.json`, `.env`, `.commandline`) if you want file/env/CLI-driven configuration.

## Usage

The modern, property-based builder is the easiest way in:

```ts
import { Host, HOST_APPLICATION_LIFETIME_TOKEN } from '@rhombus-std/hosting';
import type { IHostApplicationLifetime,
  IHostedService } from '@rhombus-std/hosting';

class Worker implements IHostedService {
  public constructor(private readonly lifetime: IHostApplicationLifetime) {}

  public async start(): Promise<void> {
    console.log('worker running');
    this.lifetime.stopApplication();
  }
}

const builder = Host.createApplicationBuilder();
builder.services.addHostedService(Worker, [[HOST_APPLICATION_LIFETIME_TOKEN]]);

const host = builder.build();
await host.runAsync();
```

`Host.createApplicationBuilder()` returns a `HostApplicationBuilder` with sensible defaults already applied (environment variables read, `appsettings.json` loaded if present, a console logger wired in). `addHostedService` registers `Worker` as a singleton the host will start and stop alongside its own lifetime; the second argument gives its constructor's dependency slots for the transformer-free path. `runAsync()` starts the host, waits until something requests shutdown (here, `stopApplication()`), then disposes it.

## Key exports

| Export                                                                                                                                                | What it is                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Host`                                                                                                                                                | Static factory: `createDefaultBuilder()` (classic builder + defaults), `createApplicationBuilder()` (modern builder + defaults), `createEmptyApplicationBuilder()` (modern builder, no defaults).                                 |
| `HostBuilder`                                                                                                                                         | The classic, delegate-accumulating builder — `configureHostConfig`, `configureAppConfig`, `configureServices`, `configureContainer`, `build()`.                                                                                   |
| `HostApplicationBuilder`                                                                                                                              | The modern, property-based builder — `configuration`, `environment`, `logging`, `metrics`, `services` as live properties; `build()`; `asHostBuilder()` for tooling that expects the classic shape.                                |
| `HostApplicationBuilderSettings`                                                                                                                      | Options passed to `HostApplicationBuilder`'s constructor: `args`, `applicationName`, `environmentName`, `contentRootPath`, `disableDefaults`, an existing `configuration`.                                                        |
| `HostOptions`                                                                                                                                         | Per-host tuning: `shutdownTimeout`/`startupTimeout` (milliseconds), `servicesStartConcurrently`/`servicesStopConcurrently`, `backgroundServiceErrorBehavior`.                                                                     |
| `HostingHostBuilderAugmentations`                                                                                                                     | The `IHostBuilder` fluent methods: `configureDefaults`, `useEnvironment`, `useContentRoot`, `configureHostOptions`, `configureLogging`, `configureMetrics`, `useDefaultServiceProvider`, `useConsoleLifetime`, `runConsoleAsync`. |
| `ConsoleLifetime`, `ConsoleLifetimeOptions`                                                                                                           | The lifetime that listens for Ctrl+C / SIGTERM / SIGQUIT and requests a graceful shutdown; `suppressStatusMessages` turns off its startup banner.                                                                                 |
| `NullLifetime`                                                                                                                                        | The default lifetime when nothing else is configured — never triggers shutdown on its own.                                                                                                                                        |
| `BackgroundServiceErrorBehavior`                                                                                                                      | What an unhandled error from a `BackgroundService` does to the host: `StopHost` (stop the host) or `Ignore` (log it and keep going).                                                                                              |
| `HOST_ENVIRONMENT_VARIABLE_PREFIX`                                                                                                                    | The environment-variable prefix (`"RHOMBUS_"`) the default host configuration reads.                                                                                                                                              |
| `CONFIG_TOKEN`, `HOST_ENVIRONMENT_TOKEN`, `HOST_LIFETIME_TOKEN`, `HOST_OPTIONS_TOKEN`, `HOST_BUILDER_CONTEXT_TOKEN`, `CONSOLE_LIFETIME_OPTIONS_TOKEN` | Dependency-injection tokens for resolving the corresponding framework service off `host.services`.                                                                                                                                |

`@rhombus-std/hosting` also re-exports the full [`hosting.core`](../hosting.core/README.md) surface — `IHost`, `IHostBuilder`, `IHostApplicationBuilder`, `IHostedService`, `IHostedLifecycleService`, `IHostApplicationLifetime`, `IHostEnvironment`, `BackgroundService`, `Environments`, `HostDefaults`, and `HOST_APPLICATION_LIFETIME_TOKEN` — so most consumers only need this one import. Importing either package also installs `addHostedService` as a fluent method on the DI registration builder (`services.addHostedService(...)`, as used above).

## How it fits

`@rhombus-std/hosting` builds on [`hosting.core`](../hosting.core/README.md) for the host contracts, and composes the concrete [`di`](../di/README.md), [`config`](../config/README.md), and [`logging`](../logging/README.md) packages (plus [`options`](../options/README.md) and [`options.augmentations`](../options.augmentations/README.md)) into one runnable host. Importing it installs the `IHost`/`IHostBuilder`/`IHostEnvironment` fluent method forms onto the concrete builder and host classes, alongside `addHostedService` on the DI registration builder — the same side effect `hosting.core` sets up for its own abstractions.

For running the same host model inside a web page instead of a process, see [`hosting.browser`](../hosting.browser/README.md).

## Notes

- The bundled logging sink is console-only for now; other sinks aren't wired into `configureDefaults` yet.
- `useServiceProviderFactory` is accepted for call-site compatibility but is a no-op — there's a single container implementation, so there's no alternate factory to swap in. `configureContainer` does run its delegates (against the same `ServiceManifest` the container builds from), for the same reason.
- Around `start`/`stop`, the host also runs `IHostedLifecycleService`'s `starting`/`started` (before/after `start`) and `stopping`/`stopped` (before/after `stop`) hooks, and fires the `IHostApplicationLifetime` signals `applicationStarted`, `applicationStopping`, and `applicationStopped` at the corresponding points. Implement the plain `IHostedService`'s bare `start`/`stop` if you don't need the finer-grained hooks.
