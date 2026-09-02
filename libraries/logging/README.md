# @rhombus-std/logging

**A category-based logging runtime for dependency-injected apps.**

`@rhombus-std/logging` wires up `ILoggerFactory`/`ILogger` for real: a factory
that fans a log call out across every registered provider, a filter pipeline
that decides which sinks are enabled per category, and `getLoggingManifest` —
a function that assembles the whole thing into a manifest you merge into your
own. It builds on the logging contracts and convenience wrappers in
[`@rhombus-std/logging.core`](../logging.core/README.md) — this package is
where those contracts actually run.

## Install

```sh
bun add @rhombus-std/logging @rhombus-std/di.core @rhombus-std/di
```

`@rhombus-std/di.core` is a peer dependency — bring your own version of the
container abstractions this package registers against. `@rhombus-std/di` is
what turns a manifest into a resolvable container.

Importing the package installs the `ILoggingBuilder` augmentations
(`addProvider`/`setMinimumLevel`/`addFilter`/`clearProviders`) as a side
effect — keep the import even if you never reference a named export:

```ts
import '@rhombus-std/logging';
```

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

`LoggerFactory.create` builds the logging manifest, resolves a factory from
it, and hands that back — its `[Symbol.dispose]()` tears down whatever it
built. `createLogger(category)` returns an `ILogger` scoped to that category
name; `logInformation`/`logWarning`/`logError`/… come from
`@rhombus-std/logging.core`'s convenience wrappers, as either a method on the
logger or a standalone function taking the logger as its first argument.

Wired into a container you're building yourself, `getLoggingManifest` is
something you merge in rather than a method you call on your own manifest:

```ts
import { Builder } from '@rhombus-std/di';
import { Manifest } from '@rhombus-std/di.core';
import { getLoggingManifest, LOGGER_FACTORY_TYPE } from '@rhombus-std/logging';
import type { ILogger, ILoggerFactory } from '@rhombus-std/logging.core';
import { LogLevel } from '@rhombus-std/logging.core';

let services: Manifest<'singleton'> = Manifest.empty<'singleton'>();
services = services.add(getLoggingManifest((builder) => {
  builder.setMinimumLevel(LogLevel.Warning);
}));

const provider = Builder.withServices(() => services).build();
const factory: ILoggerFactory = provider.resolve(LOGGER_FACTORY_TYPE);
const logger: ILogger = factory.createLogger('App');
```

`getLoggingManifest` builds on the narrowest lifetime vocabulary its own
registrations need (`'singleton'`) — merging it in is what checks your own
manifest's vocabulary covers that. `configure`, when given, runs over a
concrete `ILoggingBuilder` before the manifest comes back, so anything it
registers is part of the merge too.

Every constructor that declares an `ILogger<T>` dependency also resolves —
`getLoggingManifest` registers an open `ILogger<$1> -> Logger<$1>` binding, so
a class asking for `ILogger<UserService>` gets a logger already categorized
under that type's name, with no extra registration per class.

## Filtering

`LoggerFilterOptions` decides, per (provider, category), what the effective
minimum level is. `getLoggingManifest` registers a default of `Information`;
raise or lower it, or add category-specific rules, from the builder:

```ts
getLoggingManifest((builder) => {
  builder.setMinimumLevel(LogLevel.Information);
  builder.addFilter('App.Database', LogLevel.Debug);
  builder.addFilter((providerName, category, level) => level >= LogLevel.Warning);
});
```

`addFilter` takes either a `(category, level)` pair or a raw
`(providerName, categoryName, level) => boolean` predicate. Rules are
most-specific-category-wins; a change to the filter options — if the
underlying source is reactive — re-filters every already-created logger.

`clearProviders()` removes every registered `ILoggerProvider` from the
builder.

## Key exports

| Export                                                                                                             | What it is                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getLoggingManifest`                                                                                               | Builds the logging registrations on `Manifest<'singleton'>` and, if given a configure delegate, runs it over a concrete `ILoggingBuilder`. Merge the result into your own manifest.                                                                 |
| `LoggerFactory`                                                                                                    | The concrete `ILoggerFactory` — fans `createLogger`/`addProvider` out across registered providers, applies filter rules, and exposes the static `LoggerFactory.create(configure)` shortcut.                                                         |
| `LoggingBuilder`                                                                                                   | The concrete `ILoggingBuilder` handed to a `getLoggingManifest` configure delegate — `.services` is the underlying manifest, and its static `run(manifest, configure)` is what `getLoggingManifest` uses to thread a caller's own manifest through. |
| `Logger`                                                                                                           | The composite `ILogger` a category resolves to; fans writes across every enabled provider sink and aggregates sink errors into one thrown `AggregateError`.                                                                                         |
| `LoggerFilterOptions`, `LoggerFilterRule`                                                                          | The filter configuration: a minimum level, a `captureScopes` flag, and the rule list `addFilter` appends to.                                                                                                                                        |
| `LoggerExternalScopeProvider`                                                                                      | The default `IExternalScopeProvider` — threads `beginScope` state through concurrent async work via ambient storage.                                                                                                                                |
| `NullLogger`, `NullLoggerFactory`, `NullLoggerProvider`                                                            | No-op implementations — useful as a default when logging is optional or not yet configured.                                                                                                                                                         |
| `LOGGER_FACTORY_TYPE`, `LOGGER_FILTER_OPTIONS_TYPE`, `LOGGER_FILTER_OPTIONS_ACCESSOR_TYPE`, `LOGGER_PROVIDER_TYPE` | The container addresses `getLoggingManifest` registers under, for anyone composing registrations by hand.                                                                                                                                           |
| `LoggingBuilderProviderAugmentations`, `FilterLoggingBuilderExtensions`, `LoggerFilterOptionsExtensions`           | Standalone forms of `addProvider`/`setMinimumLevel`/`clearProviders`/`addFilter`, for calling them without the method-form sugar.                                                                                                                   |

Every method above is also reachable directly on the object it's attached
to (`builder.setMinimumLevel(...)`, `options.addFilter(...)`) once
`@rhombus-std/logging` has been imported anywhere in the program — the
standalone exports and the methods are the same underlying function, so
neither form requires a compile-time transformer.

## How it fits

`@rhombus-std/logging` depends on
[`@rhombus-std/logging.core`](../logging.core/README.md) for the `ILogger`/
`ILoggerFactory`/`ILoggerProvider` contracts and the `log*` convenience
wrappers, on its `@rhombus-std/di.core` peer for the `Manifest` a caller
merges `getLoggingManifest`'s result into (and on `@rhombus-std/di` to turn
that manifest into a resolvable container), and on
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

- Merging `getLoggingManifest` in more than once registers duplicate
  bindings, and the last one wins — harmless, but redundant.
