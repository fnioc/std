# @rhombus-std/hosting.browser

**Runs the Generic Host inside a web page.**

If you like the host-builder shape — a builder that composes configuration,
logging, and dependency injection, then produces a single app object with
`start`/`stop` — but your app runs in a browser tab instead of a server
process, this package gives you that shape with browser-appropriate defaults:
a lifetime driven by the Page Lifecycle API instead of OS signals, a
console-log sink that writes through the browser console, and an environment
that has no filesystem to reason about.

## Install

```sh
bun add @rhombus-std/hosting.browser @rhombus-std/hosting @rhombus-std/hosting.core @rhombus-std/di.core
```

## Usage

```ts
import { BrowserHost } from '@rhombus-std/hosting.browser';

// Builds the browser-composed host, starts it, waits for shutdown (a terminal
// pagehide), then stops and disposes — all in one call.
await BrowserHost.run(
  {
    environmentName: 'Production',
    applicationName: 'my-app',
  },
  (builder) => {
    // Register your services on the ordinary builder surface here.
    builder.services.addHostedService(MyWorker, [[]]);
  },
);
```

> **Best-effort only:** on a real page close this async stop may be cut off
> before it finishes. Anything that MUST survive a close goes in
> `PageLifecycleEvents.onFlush` (synchronous), not a hosted service's `stop()`.

`BrowserHost.run` drives the full pipeline (start → wait-for-shutdown → stop) via
hosting's `runAsync`, so there's no stop wiring to write by hand. If you need the
builder or the built host yourself, `BrowserHost.createApplicationBuilder(settings)`
returns an ordinary `HostApplicationBuilder` from `@rhombus-std/hosting` with the
browser pieces already wired in: an in-memory configuration source (if you pass
`initialData`), a browser-shaped environment, a browser console logger, and a
page-lifecycle-driven lifetime. Everything it configures is the normal builder
surface, so you can still register your own services, add more configuration
sources, or override any of the defaults on the returned builder.

## Key exports

| Export                                                                       | What it is                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BrowserHost.run(settings?, configureApp?)`                                  | Builds the browser-composed host, registers your services via `configureApp`, then runs the full start → wait-for-shutdown → stop pipeline; the promise settles once the host has stopped.                                   |
| `BrowserHost.createApplicationBuilder(settings?)`                            | The one-call facade: builds a `HostApplicationBuilder` with browser configuration, environment, logging, and lifetime pre-applied.                                                                                           |
| `BrowserLifetime`                                                            | The `IHostLifetime` driven by the Page Lifecycle API — requests a shutdown on a terminal `pagehide`, never on one that's entering the back/forward cache.                                                                    |
| `BrowserLifetimeOptions`                                                     | Options for `BrowserLifetime` — currently just `stopOnPagehide` (default `true`).                                                                                                                                            |
| `registerBrowserLifetime(services, options, context?)`                       | Registers the lifetime, its options, and the lifecycle bridge directly on a `ServiceManifest`, for compositions that don't go through the facade or the builder augmentation.                                                |
| `BrowserLifetimeHostBuilderExtensions.useBrowserLifetime(configureOptions?)` | The classic-builder form — available as `hostBuilder.useBrowserLifetime(...)` once this package is imported (see below).                                                                                                     |
| `PageLifecycleEvents`                                                        | The injectable page-lifecycle bridge: a `phase`/`subscribe` pair shaped for `useSyncExternalStore`, a recurring `onFlush` signal, and an `onRestore` event fired each time the page is restored from the back/forward cache. |
| `PageLifecyclePhase`                                                         | The bridge's phase values: `'visible' \| 'hidden' \| 'frozen' \| 'terminated'`.                                                                                                                                              |
| `createBrowserEnvironment(settings?)`                                        | Builds a standalone browser `IHostEnvironment` — content root `"/"`, a no-op `NullFileProvider` — for classic-builder compositions or tests.                                                                                 |
| `BrowserEnvironmentSettings`                                                 | Settings for `createBrowserEnvironment`: `environmentName`, `applicationName`.                                                                                                                                               |
| `PageContext`, `DocumentLike`, `WindowLike`, `defaultPageContext()`          | The structural `document`/`window` typings this package touches, and a factory for the real platform pair — inject your own `PageContext` in tests.                                                                          |
| `BROWSER_LIFETIME_OPTIONS_TOKEN`, `PAGE_LIFECYCLE_EVENTS_TOKEN`              | The DI tokens the two registrations above land under.                                                                                                                                                                        |

## How it fits

`@rhombus-std/hosting.browser` builds on
[`@rhombus-std/hosting`](../hosting/README.md) (the host builder and runtime
it composes) and
[`@rhombus-std/hosting.core`](../hosting.core/README.md) (the
`IHostBuilder`/`IHostEnvironment`/`IHostLifetime` abstractions it implements),
plus [`@rhombus-std/di.core`](../di.core/README.md) for registration. It
pulls in [`@rhombus-std/logging.browserconsole`](../logging.browserconsole/README.md)
for the console sink `BrowserHost` wires by default, and
[`@rhombus-std/config`](../config/README.md) for the in-memory configuration
source it seeds from `initialData`.

There's no sibling package downstream of this one — it's a hosting target,
the browser counterpart to running the same host in a server process.

Importing this package for its side effect (not just using `BrowserHost`)
unlocks the classic-builder form:

```ts
import '@rhombus-std/hosting.browser';
```

That registers the `useBrowserLifetime` augmentation against
`@rhombus-std/hosting.core`'s `IHostBuilder`, so an `IHostBuilder` gains a
fluent `.useBrowserLifetime(configureOptions?)` method alongside its other
`use*` calls — the classic-builder equivalent of what `BrowserHost` wires for
the modern builder.

## Notes

- **`BrowserHost.run()` owns the stop.** It drives the full start →
  wait-for-shutdown → stop pipeline through hosting's `runAsync`, so a terminal
  `pagehide` shuts the host down without any hand-wired listener. Best-effort
  only, though: on a real page close the async stop may be cut off before it
  finishes — put anything that MUST survive a close on
  `PageLifecycleEvents.onFlush` (synchronous), not a hosted service's `stop()`.
- **A persisted `pagehide` never stops the host.** When the page is being
  frozen into the back/forward cache rather than discarded, the lifetime
  bridges the event (so `PageLifecycleEvents` and the log reflect it) but
  never requests a shutdown — the host has no restart path, and the page may
  come back.
- **Never `unload`/`beforeunload`.** Both events disqualify a page from the
  back/forward cache, so this package doesn't listen for either — not even
  structurally; its page typings can't name them. `pagehide` is the only
  end-of-page signal it uses.
- **Persist on `onFlush`, not on stop.** `PageLifecycleEvents.onFlush` fires
  every time the page becomes hidden — that's the recurring, reliable point
  to save state, since a hidden page may be frozen, discarded, or simply
  never come back without ever firing `pagehide`.
- **No filesystem.** The browser environment's content root is `"/"` and its
  file provider is a no-op — there's nothing on disk for a page to read.
