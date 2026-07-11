# @rhombus-std/hosting

The Generic Host runtime — ported from the reference `Hosting` package. Wires
`@rhombus-std/di`'s container, `@rhombus-std/config`'s configuration, and `@rhombus-std/logging`'s
logging together behind one host lifecycle: build once, start the registered hosted services,
run until shutdown is requested, stop them in reverse order.

Re-exports the full `@rhombus-std/hosting.core` surface — contracts, tokens, and the
`addHostedService` augmentation — so `@rhombus-std/hosting` is the only import a consumer
usually needs. See [`hosting.core`'s README](../hosting.core/README.md) for the abstraction
layer this builds on.

## What it ships

- **Builders.** The classic `HostBuilder` (`configureHostConfiguration` /
  `configureAppConfiguration` / `configureServices` / `configureContainer` / `build()`) and the
  modern `HostApplicationBuilder` (`Host.createApplicationBuilder()`), plus the static `Host`
  factory facade.
- **Host runtime objects.** `HostOptions`, `ConsoleLifetime` (+ its options), `NullLifetime`,
  `ApplicationLifetime`, `HostingEnvironment`, `BackgroundServiceErrorBehavior`.
- **`HostingHostBuilderExtensions`.** `configureDefaults`, `useEnvironment`, `useContentRoot`,
  `useConsoleLifetime`, `useDefaultServiceProvider`, `configureLogging`, `configureMetrics`,
  `configureHostOptions`, `runConsoleAsync`.

## Quick start

```ts
import { Host, HOST_APPLICATION_LIFETIME_TOKEN,
  runAsync } from '@rhombus-std/hosting';
import type { IHostApplicationLifetime,
  IHostedLifecycleService } from '@rhombus-std/hosting';

class Worker implements IHostedLifecycleService {
  public constructor(private readonly lifetime: IHostApplicationLifetime) {}

  public async start(): Promise<void> {
    // ... do the work ...
    this.lifetime.stopApplication();
  }
}

const builder = Host.createApplicationBuilder();
builder.services.addHostedService(Worker, [[HOST_APPLICATION_LIFETIME_TOKEN]]);

const host = builder.build();
await runAsync(host);
```

`IHostedLifecycleService` gets nine ordered callbacks (`starting` → `start` → `started` →
`applicationStarted` → `stopping` → `applicationStopping` → `stop` → `stopped` →
`applicationStopped`); implement `IHostedService`'s bare `start`/`stop` if you don't need the
finer-grained hooks. See `examples/examples.app.with-transformer` and
`examples/examples.app.without-transformer` for the full interop-matrix scenario, and
`tests/hosting.test` for the canonical lifecycle-ordering sample.

## Dependencies

`@rhombus-std/hosting.core` plus the concrete `config`/`di`/`diagnostics`/`logging` packages,
`options`, `options.augmentations`, and `@rhombus-std/logging.console` (the console sink
`configureDefaults` registers). Mirrors the reference `Hosting` package's dependency set —
see `docs/decisions.md` §21.

## Known deviations from the reference

- `contentRootFileProvider` is a `NullFileProvider` — the physical, disk-backed provider isn't
  ported yet (`docs/decisions.md` §20).
- `configureDefaults` registers only the console logging provider — Debug/EventSource/EventLog
  sinks aren't ported yet (`docs/decisions.md` §18).
- `useServiceProviderFactory` and `configureContainer` are a no-op single-container shape (one
  container type, `ServiceManifest`, so there's no pluggable-builder analog to swap in).
- `useDefaultServiceProvider`'s `ServiceProviderOptions` (`validateScopes`/`validateOnBuild`) is
  accepted for call-site compatibility and no-ops — no scope-validation surface exists yet.
