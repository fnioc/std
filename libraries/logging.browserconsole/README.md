# @rhombus-std/logging.browserconsole

**A logging sink that writes through the browser's `console` global.**

For apps and libraries that run in a web page, this package gives you a
working logger backend with a single call — no formatter pipeline, no ANSI
color codes to strip, just plain text handed to `console.error` /
`console.warn` / `console.info` / `console.debug`, letting devtools do the
severity styling it already does natively.

## Install

```sh
bun add @rhombus-std/logging.browserconsole @rhombus-std/logging @rhombus-std/logging.core
```

Importing the package registers a builder method as a side effect:

```ts
import '@rhombus-std/logging.browserconsole';
```

That import unlocks `addBrowserConsole()` on `ILoggingBuilder` — the same
builder `addLogging` gives you from `@rhombus-std/logging`.

## Usage

```ts
import { LoggerFactory } from '@rhombus-std/logging';
import '@rhombus-std/logging.browserconsole';

const factory = LoggerFactory.create((builder) => {
  builder.addBrowserConsole();
});

const logger = factory.createLogger('App.Startup');
logger.logInformation('server ready on {Port}', 8080);
// → console.info: "App.Startup[0] server ready on 8080"
```

`addBrowserConsole()` adds one `BrowserConsoleLoggerProvider` to the builder's
manifest — calling it again on the same builder is a no-op, so you don't end
up with duplicate console output if it's called from more than one place.

## Key exports

| Export                           | What it is                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BrowserConsoleLoggerProvider`   | An `ILoggerProvider` that hands out `BrowserConsoleLogger` instances, one per category name, cached.                                                              |
| `BrowserConsoleLogger`           | An `ILogger` that formats `category[eventId] message` and writes it through a `ConsoleLike`.                                                                      |
| `BrowserConsoleLoggerExtensions` | The `addBrowserConsole(builder)` registration function — also reachable as the `builder.addBrowserConsole()` method once this package is imported.                |
| `ConsoleLike`                    | The four-method console surface (`error`/`warn`/`info`/`debug`) this package writes through — swap in a fake for tests.                                           |
| `consoleMethodFor(logLevel)`     | Maps a `LogLevel` onto the console method it writes through: `Trace`/`Debug` → `debug`, `Information` → `info`, `Warning` → `warn`, `Error`/`Critical` → `error`. |

### How a log line is written

Each `log` call resolves its level to a console method, renders
`category[eventId] message`, and — when an `Error` is attached — passes it as
a **separate** argument rather than folding it into the string, so devtools
renders its stack interactively instead of a flattened blob:

```ts
logger.logError(err, 'failed to load {Resource}', 'settings.json');
// → console.error("App.Startup[0] failed to load settings.json", err)
```

`LogLevel.None` is never written — `isEnabled` filters it out before
formatting runs.

## How it fits

`@rhombus-std/logging.browserconsole` is a sink: it implements
[`@rhombus-std/logging.core`](../logging.core/README.md)'s `ILogger`/
`ILoggerProvider` contracts and plugs into
[`@rhombus-std/logging`](../logging/README.md)'s `ILoggingBuilder` via
side-effect import, the same way
[`@rhombus-std/logging.console`](../logging.console/README.md) does for
non-browser environments. Install `@rhombus-std/logging` and
`@rhombus-std/logging.core` alongside it; add
[`@rhombus-std/logging.config`](../logging.config/README.md) if
you also want filter rules bound from configuration.

If you're assembling a full page-hosted application, this is the sink meant
for [`@rhombus-std/hosting.browser`](../hosting.browser/README.md).

## Notes

- **Browser-only.** This package targets the `console` global as found in a
  web page — it doesn't add ANSI formatting or a write queue the way the
  Node-oriented console sink does, because browser devtools already style
  each severity channel and writes there are synchronous.
- **Scopes are unsupported.** `beginScope` always returns `undefined` — the
  plain-text formatting here has nowhere to render scope state.
