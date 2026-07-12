# @rhombus-std/logging.console

**A console sink for `@rhombus-std/logging` — colored, structured, or systemd-friendly output, written off the hot path.**

Attach it to a logging builder and every logger created from that builder
starts printing to standard out (and, above a configurable severity, standard
error) through a background queue — no blocking writes on the thread that
logged the message.

## Install

```sh
bun add @rhombus-std/logging.console @rhombus-std/logging @rhombus-std/logging.core
```

Importing the package installs `addConsole` (and its formatter-specific
siblings) onto `ILoggingBuilder` via a side-effect import:

```ts
import '@rhombus-std/logging.console';
```

Keep that import even if your bundler tree-shakes aggressively — the package
declares `"sideEffects": true` for exactly this registration and must not be
dropped.

## Usage

```ts
import { LoggerFactory } from '@rhombus-std/logging';
import '@rhombus-std/logging.console';

const factory = new LoggerFactory((builder) => {
  builder.addConsole();
});

const logger = factory.createLogger('App');
logger.logInformation('Server listening on port {Port}', 8080);
```

`addConsole()` attaches one `ConsoleLoggerProvider` to the builder — calling
it more than once is safe and reuses the same provider — seeded with the
three built-in formatters (`simple`, `json`, `systemd`). Pick one of the
formatter-specific shortcuts instead when you know which output shape you
want:

```ts
builder.addSimpleConsole((options) => {
  options.singleLine = true;
});

builder.addJsonConsole((options) => {
  options.jsonWriterOptions = { indented: true };
});

builder.addSystemdConsole();
```

Each `add*` call is also available as a standalone function taking the
builder as its first argument — useful for a hand-written call site that
doesn't hold an object with the method merged on:

```ts
import { ConsoleLoggerExtensions } from '@rhombus-std/logging.console';

ConsoleLoggerExtensions.addConsole(builder);
```

The two forms lower to the same registration; the instance-method form is
just the merged-in convenience.

## Key exports

| Export                          | What it is                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ConsoleLoggerExtensions`       | The `addConsole` / `addSimpleConsole` / `addJsonConsole` / `addSystemdConsole` / `addConsoleFormatter` builder methods, as a standalone object and as the source of the `ILoggingBuilder` merge. |
| `ConsoleLoggerProvider`         | An `ILoggerProvider` that creates and owns `ConsoleLogger` instances, the formatter registry, and the background write queue. Constructible directly when you're not going through a builder.    |
| `ConsoleLogger`                 | The `ILogger` implementation that renders through a `ConsoleFormatter` and hands the result to the queue.                                                                                        |
| `ConsoleFormatter`              | The abstract base for a pluggable log-message formatter — implement `write()` to add your own output shape.                                                                                      |
| `ConsoleFormatterNames`         | The reserved names of the built-ins: `simple`, `json`, `systemd`.                                                                                                                                |
| `ConsoleLoggerOptions`          | Queue behavior (`maxQueueLength`, `queueFullMode`), the standard-error threshold (`logToStandardErrorThreshold`), and the active `formatterName`.                                                |
| `ConsoleFormatterOptions`       | Shared formatter options: `includeScopes`, `timestampFormat`, `useUtcTimestamp`. Base class for the two below.                                                                                   |
| `SimpleConsoleFormatterOptions` | Adds `colorBehavior` (see `LoggerColorBehavior`) and `singleLine` to the base formatter options.                                                                                                 |
| `JsonConsoleFormatterOptions`   | Adds `jsonWriterOptions` (`indented`, `indentCharacter`, `indentSize`) to the base formatter options.                                                                                            |
| `LoggerColorBehavior`           | `Default` / `Enabled` / `Disabled` — when the simple formatter emits ANSI color.                                                                                                                 |
| `ConsoleLoggerQueueFullMode`    | `Wait` (never drop a message) / `DropWrite` (drop new messages once the queue is full).                                                                                                          |
| `TextWriter`, `StringWriter`    | The minimal write-sink interface a `ConsoleFormatter` renders into, plus an in-memory implementation.                                                                                            |
| `LogEntry`                      | Re-exported from `@rhombus-std/logging.core` for convenience when implementing a custom formatter.                                                                                               |

## How it fits

`@rhombus-std/logging.console` is a sink: it builds on
[`@rhombus-std/logging`](../logging/README.md) for the `addProvider` method it
registers through, and on
[`@rhombus-std/logging.core`](../logging.core/README.md) for `ILoggingBuilder`
and the `ILogger` / `ILoggerProvider` / `LogEntry` contracts it implements
against. Install both alongside it.

It sits next to [`@rhombus-std/logging.browserconsole`](../logging.browserconsole/README.md)
(the equivalent sink for a browser page) — pick whichever matches your
runtime, or both if the same logging setup runs in more than one place.

## Notes

- `addConsole`'s optional `configure` callback runs immediately against the
  shared options object, not lazily — call it after `addConsole` (or through
  one of the formatter-specific shortcuts) rather than expecting deferred
  evaluation.
- Custom formatters passed to `addConsoleFormatter` before the first
  `addConsole`/`addSimpleConsole`/etc. call are seeded into the provider
  ahead of the built-ins; ones added afterward attach to the
  already-constructed provider. Either way, select them by name through
  `ConsoleLoggerOptions.formatterName`.
- `ConsoleLoggerOptions.disableColors`, `.format`, `.includeScopes`,
  `.timestampFormat`, and `.useUtcTimestamp` are deprecated — use
  `SimpleConsoleFormatterOptions.colorBehavior` and the formatter-level
  `ConsoleFormatterOptions` members instead.
