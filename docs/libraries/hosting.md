# `@rhombus-std/hosting`

The Generic Host runtime: `hosting.core` (`IHost`/`IHostedService`/`IHostedLifecycleService`/
`BackgroundService`/`IHostApplicationLifetime`/`IHostLifetime`/`IHostBuilder`/
`IHostApplicationBuilder`) ← `hosting` (the classic `HostBuilder` and modern
`HostApplicationBuilder`, the static `Host` factory, `ConsoleLifetime`, `HostingEnvironment`).
`hosting.browser` hosts the same runtime in a page (`BrowserLifetime`, `PageLifecycleEvents`,
`BrowserHost` — no reference-graph counterpart).

## Justified divergences

None beyond the augmentation pattern — see `docs/features/augmentations.md`.
