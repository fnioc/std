# @rhombus-std/hosting.core

Skeleton port target for the reference runtime's `ME.Hosting.Abstractions`. Types only, no
runtime logic -- a starting point for the real Generic Host port.

## What's deliberately missing

- **`IOptions`/`IOptions<T>` are not ported.** Configuration in this monorepo made a
  no-Options decision; anything that would have taken an `IOptions<T>` upstream takes a
  plain value or a config accessor instead.
- **`IFileProvider`/`ContentRootFileProvider` are omitted.** `HostBuilderContext` keeps
  `contentRootPath` as a plain string rather than wrapping it in a file-provider abstraction.
- **Logging (`ILogger`/`ILoggerFactory`) is a local stub**, not a real logging abstraction.
  It exists only so `IHost`/`IHostBuilder` have something to reference; it'll be replaced
  by `@rhombus-std/logging` once that package exists.
- **`ServiceProvider` is a local placeholder**, not `@rhombus-std/di`'s real type --
  `@rhombus-std/di` isn't a dependency of this package yet.

## Status

Skeleton only. Not wired to DI or config; see the monorepo root README for overall status.
