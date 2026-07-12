# @rhombus-std/logging.core

**The logging contracts every sink, factory, and category logger in the stack agrees on.**

This package has no logging runtime of its own — no console output, no filtering
engine, no registration helper. It defines the shapes: `ILogger`, `ILoggerFactory`,
`ILoggerProvider`, `LogLevel`, and the value types a structured sink reads. Depend
on it when you're writing something that accepts or implements a logger — a
library, a provider, a test fake — without pulling in a concrete logging engine.

## Install

```sh
bun add @rhombus-std/logging.core
```

`@rhombus-std/di.core` is a dependency (used for the `ServiceManifest` type on
`ILoggingBuilder.services`) and `@rhombus-std/primitives` for the augmentation
registry — both are pulled in automatically, no separate install needed.

## Usage

The core primitive is `ILogger.log`: it takes a deferred `state` plus a
`formatter`, so a disabled logger never pays formatting cost. Writing directly
against it is verbose, so the package also ships convenience wrappers that build
the state/formatter for you:

```ts
import { type ILogger, logError,
  logInformation } from '@rhombus-std/logging.core';

function handleRequest(logger: ILogger, userId: string): void {
  logInformation(logger, 'Handling request for {UserId}', userId);
  try {
    // ...
  } catch (error) {
    logError(logger, error as Error, 'Request for {UserId} failed', userId);
  }
}
```

`logInformation`/`logError`/etc. accept an optional leading `Error` — pass one
when the message is reporting a failure. This package provides only the
contracts and these wrappers; a working `ILogger` implementation (console
output, filtering, etc.) comes from `@rhombus-std/logging` and its sinks.

## Key exports

| Export                                                                                                        | What it is                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ILogger`                                                                                                     | The core logging interface: `log`, `isEnabled`, `beginScope`. `ILogger<T>` is the same interface with a phantom category-type parameter.                                                                     |
| `ILoggerFactory`                                                                                              | Creates `ILogger` instances by category name and accepts `ILoggerProvider`s via `addProvider`.                                                                                                               |
| `ILoggerProvider`                                                                                             | One sink family (console, a custom backend, …); implement this to plug your own sink into a factory.                                                                                                         |
| `ILoggingBuilder`                                                                                             | The builder handed to logging configuration code — exposes the `ServiceManifest` (`services`) that registrations attach to.                                                                                  |
| `IExternalScopeProvider` / `ISupportExternalScope`                                                            | The ambient-scope enumeration contract a factory hands to providers that opt in.                                                                                                                             |
| `LogLevel`                                                                                                    | The severity enum — `Trace` through `Critical`, plus `None` to silence a category. Ordering is significant: comparisons assume ascending severity.                                                           |
| `EventId` / `EventIdLike`                                                                                     | Identifies a logging event by numeric `id` plus an optional `name`. `EventIdLike` is `EventId \| number` — most APIs accept a bare number.                                                                   |
| `LogEntry<TState>`                                                                                            | The single-object bundle of everything an `ILogger.log` call carries — useful when writing a provider that wants one value instead of five parameters.                                                       |
| `IBufferedLogger` / `BufferedLogRecord`                                                                       | Optional batch-delivery capability a provider implements beside `ILogger`, for receiving many already-captured records at once.                                                                              |
| `providerAlias` / `getProviderAlias` / `ProviderAliased`                                                      | A static marker a provider class declares (`static readonly [providerAlias] = 'Console'`) giving it a short filtering name; read back with `getProviderAlias`.                                               |
| `LoggerMessage`                                                                                               | `LoggerMessage.define(level, eventId, template)` / `.defineScope(template)` — cached, strongly-typed log delegates for hot paths, parsed once and invoked per message.                                       |
| `FormattedLogValues` / `formatMessage` / `formatLogValues`                                                    | The deferred message-template state (`{Hole}`-style substitution) passed as `state` to `ILogger.log`; a structured sink can enumerate its `[name, value]` pairs instead of just reading the rendered string. |
| `logTrace` / `logDebug` / `logInformation` / `logWarning` / `logError` / `logCritical` / `log` / `beginScope` | Standalone convenience wrappers over `ILogger.log` — each accepts an optional leading `Error` before the message.                                                                                            |
| `LoggerExtensions`                                                                                            | The same wrappers grouped as one object, importable as a set: `LoggerExtensions.logInformation(logger, …)`.                                                                                                  |
| `Logger<T>`                                                                                                   | A generic-category `ILogger<T>` that delegates to a factory-created inner logger, categorized from `T`'s dependency-injection token. Needs a real `ILoggerFactory` to construct.                             |

## How it fits

`@rhombus-std/logging.core` is the abstractions layer for the logging family. It
depends on [`@rhombus-std/di.core`](../di.core/README.md) (for `ServiceManifest`
on `ILoggingBuilder`) and [`@rhombus-std/primitives`](../primitives/README.md)
(for the shared augmentation registry the convenience wrappers register
against).

Everything downstream builds on it:

- [`@rhombus-std/logging`](../logging/README.md) — the runtime: `LoggerFactory`,
  composite `Logger`, `NullLogger`, filter options, external scopes, and the
  `addLogging` registration. Install this when you need a working logger, not
  just the contracts.
- [`@rhombus-std/logging.configuration`](../logging.configuration/README.md) —
  binds filter rules from configuration.
- [`@rhombus-std/logging.console`](../logging.console/README.md) and
  [`@rhombus-std/logging.browserconsole`](../logging.browserconsole/README.md) —
  concrete `ILoggerProvider` sinks.

A library that only needs to accept or emit through an `ILogger` — without
caring which sink is behind it — should depend on `logging.core` alone.

## Notes

- Importing `@rhombus-std/logging.core` registers the `logTrace`/`logDebug`/…
  wrappers as an augmentation set against the `ILogger` token, as a side
  effect. This lets a concrete logger class elsewhere in the stack gain them as
  methods; it has no effect on plain functional use of the standalone
  wrappers.
- `LoggerFactoryExtensions.createLogger(factory, MyService)` derives the
  category from a class's `name` — there is no compile-time-generated
  `createLogger<T>()` sugar in this package; call the explicit form.
- The convenience wrappers drop the event-id-carrying overloads present on
  some logging APIs elsewhere, since a bare number and a message string are
  ambiguous at the call site. Call `logger.log(level, EventId.from(n), …)`
  directly when you need an explicit event id alongside a wrapper-style call.
