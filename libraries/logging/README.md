# @rhombus-std/logging

**A category-based logging runtime for dependency-injected apps.**

`@rhombus-std/logging` wires up `ILoggerFactory`/`ILogger` for real: a factory
that fans a log call out across every registered provider, a filter pipeline
that decides which sinks are enabled per category, and an `addLogging`
registration method that drops the whole thing into a service container in
one call. It builds on the logging contracts and convenience wrappers in
[`@rhombus-std/logging.core`](../logging.core/README.md) — this package is
where those contracts actually run.

## Install

```sh
bun add @rhombus-std/logging @rhombus-std/di.core
```

`@rhombus-std/di.core` is a peer dependency — bring your own version of the
container abstractions this package registers against.

Just importing the package registers the `addLogging` method:

```ts
import '@rhombus-std/logging';
```

That side-effect import is enough to unlock `manifest.addLogging(...)` on a
`ServiceManifest` from [`@rhombus-std/di`](../di/README.md) — no explicit call
needed beyond the import.

## Usage

The smallest path — no container, just a factory:

```ts
import { LoggerFactory } from '@rhombus-std/logging';
import { LogLevel } from '@rhombus-std/logging.core';

const factory = LoggerFactory.create((builder) => {
  builder.setMinimumLevel(LogLevel.Debug);
});

const logger = factory.createLogger('App.Startup');
logger.logInformation('Server listening on {Port}', 8080);
```

`LoggerFactory.create` spins up a small container, runs `addLogging` against
it, and hands back a factory whose `[Symbol.dispose]()` tears the container
down with it. `createLogger(category)` returns an `ILogger` scoped to that
category name; `logInformation`/`logWarning`/`logError`/… come from
`@rhombus-std/logging.core`'s convenience wrappers.

Wired into a container directly, it looks the same as any other registration:

```ts
import { ServiceManifest } from '@rhombus-std/di';
import type { ILogger } from '@rhombus-std/logging.core';
import '@rhombus-std/logging';

const manifest = new ServiceManifest();
manifest.addLogging((builder) => {
  builder.setMinimumLevel(LogLevel.Warning);
});

const provider = manifest.build();
const logger = provider.resolve<ILogger>('@rhombus-std/logging.core:ILogger');
```

Every constructor that declares an `ILogger<T>` dependency also resolves —
`addLogging` registers an open `ILogger<$1> -> Logger<$1>` binding, so a class
asking for `ILogger<UserService>` gets a logger already categorized under
that type's name, with no extra registration per class.

## Filtering

`LoggerFilterOptions` decides, per (provider, category), what the effective
minimum level is. `addLogging` registers a default of `Information`; raise or
lower it, or add category-specific rules, from the builder:

```ts
manifest.addLogging((builder) => {
  builder.setMinimumLevel(LogLevel.Information);
  builder.addFilter('App.Database', LogLevel.Debug);
  builder.addFilter((providerName, category, level) =>
    level >= LogLevel.Warning
  );
});
```

`addFilter` takes either a `(category, level)` pair or a raw
`(providerName, categoryName, level) => boolean` predicate. Rules are
most-specific-category-wins; a change to the filter options — if the
underlying source is reactive — re-filters every already-created logger.

`clearProviders()` removes every registered `ILoggerProvider` from the
builder.

## Key exports

| Export                                                                                        | What it is                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoggerFactory`                                                                               | The concrete `ILoggerFactory` — fans `createLogger`/`addProvider` out across registered providers, applies filter rules, and exposes the static `LoggerFactory.create(configure)` shortcut. |
| `LoggingBuilder`                                                                              | The concrete `ILoggingBuilder` handed to an `addLogging` configure delegate — `.services` is the underlying `ServiceManifest`.                                                              |
| `Logger`                                                                                      | The composite `ILogger` a category resolves to; fans writes across every enabled provider sink and aggregates sink errors into one thrown `AggregateError`.                                 |
| `LoggerFilterOptions`, `LoggerFilterRule`                                                     | The filter configuration: a minimum level, a `captureScopes` flag, and the rule list `addFilter` appends to.                                                                                |
| `LoggerExternalScopeProvider`                                                                 | The default `IExternalScopeProvider` — threads `beginScope` state through concurrent async work via ambient storage.                                                                        |
| `NullLogger`, `NullLoggerFactory`, `NullLoggerProvider`                                       | No-op implementations — useful as a default when logging is optional or not yet configured.                                                                                                 |
| `LOGGER_FACTORY_TOKEN`, `LOGGER_FILTER_OPTIONS_TOKEN`, `LOGGER_PROVIDER_TOKEN`                | The container tokens `addLogging` registers under, for anyone composing registrations manually.                                                                                             |
| `LoggingServiceCollectionExtensions`                                                          | The standalone form of `addLogging`, for calling it without the method-form sugar.                                                                                                          |
| `LoggingBuilderExtensions`, `FilterLoggingBuilderExtensions`, `LoggerFilterOptionsExtensions` | Standalone forms of `addProvider`/`setMinimumLevel`/`clearProviders`/`addFilter`, for calling them without the method-form sugar.                                                           |

Every method above is also reachable directly on the object it's attached
to (`builder.setMinimumLevel(...)`, `options.addFilter(...)`) once
`@rhombus-std/logging` has been imported anywhere in the program — the
standalone exports and the methods are the same underlying function, so
neither form requires a compile-time transformer.

## How it fits

`@rhombus-std/logging` depends on
[`@rhombus-std/logging.core`](../logging.core/README.md) for the `ILogger`/
`ILoggerFactory`/`ILoggerProvider` contracts and the `log*` convenience
wrappers, on [`@rhombus-std/di`](../di/README.md)'s peer
`@rhombus-std/di.core` to register against a `ServiceManifest`, and on
[`@rhombus-std/options`](../options/README.md) /
[`@rhombus-std/options.augmentations`](../options.augmentations/README.md) to
run `LoggerFilterOptions` through the configure/reload pipeline.

Providers are separate packages you install alongside it depending on where
the app runs:
[`@rhombus-std/logging.console`](../logging.console/README.md) writes to a
terminal, and
[`@rhombus-std/logging.browserconsole`](../logging.browserconsole/README.md)
writes to a browser's console. Binding filter rules from configuration is
[`@rhombus-std/logging.config`](../logging.config/README.md).

## Notes

- `addLogging` appends rather than replaces: calling it more than once against
  the same manifest registers duplicate bindings, and the last one wins —
  harmless, but redundant.
