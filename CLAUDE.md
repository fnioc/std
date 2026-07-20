# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# `@rhombus-std` monorepo

Project-specific rules only. General git/commit/worktree conventions live in user prefs, not here.

**`docs/decisions.md` is the living design record** — every load-bearing package boundary and
invariant below is numbered and justified there (cited as "§N"). Read it for the _why_ before
changing a boundary, and append to it when a decision lands. The root `README.md` is
scaffolding-era and stale — ignore it.

## Issue coding gate

Before writing any code for a GitHub issue, it must carry **both** `signoff` **and** `claude-ready`.
Both labels already exist — **never create new ones.**

- **`signoff`** — the owner's explicit go-ahead. Apply it yourself when the owner tells you to
  proceed ("do it", "go ahead", "code this", "ship it", or any equivalent). It records that the
  work was cleared.
- **`claude-ready`** — your own honest judgement that the issue can be implemented to completion
  with **zero** further owner interaction. Add it when that's true; remove it when it isn't.

Maintain `claude-ready` **silently**: whenever you look at an issue, add or remove it to match
"could I finish this unattended right now?" — don't narrate the change or ask about it, just adjust.

## Commands

Runtime is **bun** (workspaces, isolated linker per `bunfig.toml`); `mise.toml` pins bun + Node 24.

| Task                    | Command                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| Install                 | `bun install`                                                                  |
| Build all (topological) | `bun run build`                                                                |
| Test all (the gate)     | `bun run test`                                                                 |
| Test one package        | `bun --filter '@rhombus-std/di.test' test` (or `cd tests/di.test && bun test`) |
| Test one file / name    | from a test-package dir: `bun test <path>` · `bun test -t '<pattern>'`         |
| Lint all                | `bun run lint`                                                                 |
| Format                  | `bun run format` (write) · `bun run format:check`                              |

- **`bun run build` (topological), never `bun --filter '*' build`.** It runs
  `scripts/build-all.ts`. Transformer-active packages resolve their upstream through its rolled
  d.ts (see [Build layout](#build-layout--dist-referencing-in-progress-72)), not source, so the
  upstream `dist` must be complete and stable before they compile — a flat parallel build races and
  silently mis-resolves. `build-all` tiers the workspace by its dependency graph and finishes each
  tier before the next (§1/§9).
- **`bun run test` is the full gate.** It runs every package's `test`, then every package's
  `test:e2e` — the ttsc parity e2es join the gate (they self-skip only on a Go-less machine). It
  includes the `examples.app.*` output-diff e2e: build with the Go/ttsc engine, run, `diff` stdout
  against the checked-in `expected.txt` (§16). CI's `verify` job (`.github/workflows/ci.yml`) runs
  `build`/`test`/`lint`/`format:check` plus the Go gates on every push/PR/merge_group and is a
  required status check on the `main` merge-queue ruleset — but it's the same local gate running
  remotely, not a separate suite; `bun run test` locally is still authoritative.
- **Typecheck is per-package**, inside each package's `build`/`lint` (`tsc --noEmit -p tsconfig.ci.json`).
  Each package's `tsconfig.json` is the **editor** config instead — a whole-repo src-refs program (all
  `libraries/*/src` in one program, `@rhombus-std/*` → source) so IDE rename / find-refs span every
  package; the build and gate never read it (extends `/tsconfig.editor.json`).
  The root `typecheck` script (`tsc -b`) points at an empty solution stub and checks nothing — don't
  rely on it.
- **Lint** is eslint (typescript-eslint, type-aware) over `libraries|examples/*/src`; but
  transformer-consuming packages lint by _typechecking_ (`tsc --noEmit`) — the authored tokenless
  forms type-check against the transformer's `declare module` augmentation (pulled in via `types`),
  with no plugin, since `nameof` and the sugar forms have no type-level footprint. Formatting is
  **dprint** (`useBraces: always`).
- **Go gates** (the ttsc engine's own): `node scripts/gen-go-work.mjs` then, from `transforms/`,
  `go build ./... && go vet ./... && go test ./... && gofmt -l .` (needs mise Go on PATH; the
  generator rebuilds the gitignored `go.work` against the installed ttsc shim modules).

## Architecture

Four package families **mirror the `ME.*` reference dependency graph**
(`docs/reference/me-extensions-dependencies.md`) package-for-package and edge-for-edge; the
API surface _within_ a package may deviate where TS/bun justifies it, but the graph is faithful
first and a distinction is collapsed only after it's shown unjustified (§0). Naming below in
[Package naming](#package-naming).

**The `ME.*` mirror is a means, not the goal.** Faithfulness is a disposable starting discipline:
the plan is to complete the port faithfully, _then_ refactor away from `ME.*` shapes. So "it mirrors
`ME.*`" is a weak design tiebreaker — where an `ME.*` shape conflicts with what's most correct or
idiomatic for TS, prefer correctness and say so; hold the `ME.*` shape during the faithful pass only
where that's cheap, and flag the intended divergence rather than pre-emptively taking it.

- **`primitives`** — universal leaf, zero deps. The change-token trio (`IChangeToken`,
  `ChangeToken.onChange` — the async-consumer forms real, via a runtime thenable check, §58 — plus
  `CompositeChangeToken` merging N tokens into one, §58) that underpins live-reload (§8), **and**
  the augmentation infra:
  one named exported object literal per ME static extension class, `satisfies AugmentationSet<R>`
  (§28), installed either directly via `applyAugmentations` (CLOSED receivers) or through the
  **augmentation registry** (§38) for OPEN receivers — `Token` (hoisted from di.core, which
  re-exports it), `registerAugmentations(token, set, merge?)` (per-token bag = a
  `Multimap<string, [fn, merge?]>` holding a per-name LIST of contributions, each pairing the fn
  with its own strategy — a second same-name registration ACCUMULATES, never throws at registration;
  notifies a per-token SYNCHRONOUS subscriber list, deliberately NOT an `EventTarget` bus — a
  strategy-less collision THROWS from install and `EventTarget.dispatchEvent` would swallow it, so
  iterating subscribers directly lets the throw reach the registrant, §79), and the `@augment(token)`
  class decorator that DELTA-installs (§79):
  on first application it catches up on the accumulated bag once, and each later registration installs
  only its own `set` onto the prototype — never the whole bag again, so a member on a heavily-shared
  token installs exactly once per class. Collision is resolved BLIND at install time (no token/receiver/
  member identity): a name already taken on the prototype with NO `merge` strategy THROWS (never a
  silent clobber), and with a `MergeStrategy` (per member name, §79) installs a dispatcher chaining the
  incoming over the existing — letting an augmentation share a name with the class's own primitive
  (`ILogger.log`/`beginScope`, `IMemoryCache.tryGetValue`, `ILoggerFactory.createLogger`, and `di`'s
  `build`-over-stub — dot-callable at runtime; not statically typed, TS2430). It lives here
  (not `di.core`) because di ⊥ config forces the shared home onto the zero-dep leaf.
  `primitives.transformer` hosts the `nameof<T>()`/token-derivation machinery extracted from
  di.transformer (which depends on it and re-exports the old surface). It also owns the structural
  platform typings (§39/§44): `AbortSignal`/`AbortController` (+ the inert `neverSignal`
  singleton), `ProcessLike`/`process`, `TimeoutHandle`/`setTimeout`/`clearTimeout`, and
  `ReadableStream<R>` — typed `globalThis` lookups, so libraries never need
  lib.dom/`@types/node`/bun-types to touch the platform. That zero-ambient-types program is
  pinned by `types: []` in `/tsconfig.lib.json`; `node:fs`/`node:path` imports get per-package
  compile-scope `node-builtins.d.ts` files (§44).
- **`di`** — `di.core` (the abstractions **and** the concrete `ServiceManifest` registration
  builder + registration-time errors — it ships runtime, §9 — plus the
  `ServiceCollectionDescriptorExtensions.removeAll`/`tryAdd*`/`replace*` descriptor verbs (§38, §56),
  `ActivatorUtilities` (activate an unregistered class from a provider, §56), and the
  `EmptyServiceProvider` null-object singleton, §56) ← `di` (the resolution engine: scopes,
  resolution, captive-dependency protection, `ServiceProviderOptions`-gated `validateScopes` /
  `validateOnBuild` (§57), and aggregated — not abort-on-first-throw — disposal, §57).
  `di.transformer` (the Go/ttsc authoring surface: the `declare module` for the tokenless
  registration forms, the inline sugar bodies, and the `signatureof` primitive) depends on
  **`di.core` types only, never the `di` runtime** (§2 — hard invariant). `di.transformer.options` is a satellite lowering the `addOptions<T>()`
  sugar (§15). di.core's public type surface also ships `IServiceProviderFactory` — the reference
  `IServiceProviderFactory` analog, shared by the hosting builders (§24) — and the capability
  interfaces `IRequiredResolver` / `IServiceQuery` that `IResolver` composes (the reference
  `ISupportRequiredService` / `IServiceProviderIsService` analogs, §27).
- **`options`** — the collapsed `IOptions<T>` accessor + the configure / post-configure / validate
  `OptionsFactory` pipeline (§4), **plus** startup validation (`IStartupValidator`/`StartupValidator`,
  forced by `Host.start`, §55) and `ValidateOptionsResultBuilder` for multi-failure aggregation
  (§64). Depends **`di.core` only; config-unaware.** `options.augmentations` is the **one place di
  and config meet** — the config→`IOptions<T>` bridge (§14) — and now also exports its pipeline
  slot-token grammar (`configureStepToken` et al., §54) so a downstream package can register an
  OPEN `IConfigureOptions`/`IOptionsChangeTokenSource`-style step for a type it doesn't own; its
  `validateOnStart` manifest verb (§55) and DI-injected `configure`/`postConfigure`/`validate`
  overloads (a token-tuple + tuple-typed callback, §64) round out the pipeline. All three pipeline
  stages are reachable through the manifest surface (§76); validation is **sync-only** by design
  (the async family stays out) and the config→`IOptions<T>` bind is a compose-not-clobber structural
  deep-merge, not a reflective bind (§76).
- **`config`** — `config.core` (the abstractions assembly mirroring the reference
  `.Configuration.Abstractions`: the `IConfig*` types, the shared `properties` key/value bag between
  a builder and its sources (§59), **and** the abstraction-level runtime that belongs here by
  reference parity (§102, reversing §21) — the `configPath` helpers, the `ConfigAugmentations`/
  `ConfigRootAugmentations` convenience sets + `exists`, the `ConfigDebugViewContext` type, and the
  `isConfigSection` branded runtime discriminant (a unique-symbol brand the concrete `ConfigSection`
  stamps on itself, the runtime stand-in for the reference's `config is IConfigurationSection`
  interface test); no longer types-only, it now emits a JS bundle) ← `config` (builder/root/section
  engine + reload tokens, §8; `ConfigManager` seeds a default memory source so `set()`
  works before any `add()`, §32; `ConfigProvider#toString` gives `getDebugView` a friendly
  provider label, §33; `ChainedConfigSource`/`ChainedConfigProvider` wrap an
  existing `IConfig` as a source — implements `IConfigProvider` directly, no data
  store of its own — installing `addConfiguration` on BOTH `ConfigBuilder` and
  `ConfigManager`, §37; `StreamConfigSource`/`Provider` read an already-open
  `Uint8Array | string` payload with a once-only load guard, §59) ← providers `config.json` /
  `config.env` / `config.commandline` (each a `declare module` augmentation adding e.g.
  `addJsonFile` to BOTH `ConfigBuilder` and `ConfigManager`, §35; `config.json` adds
  `JsonStreamConfigSource`/`Provider` + `addJsonStream` over a shared internal
  `JsonConfigFileParser`, §59). `config.env` also exports
  `colonAndDotVariableNameTransformation` and normalizes its prefix through the transform before
  matching (§30/§31) and re-keys `*CONNSTR_`-prefixed vars into the `ConnectionStrings` section
  (provider-name sub-keys omitted, §75); `config.commandline` honors bare `key=value` argv tokens
  (§34). The **file-configuration sub-family** (§75): `config.file` — the shared base
  (`FileConfigSource`/`FileConfigProvider`, `FileLoadErrorContext`,
  `FormatError`/`InvalidDataError`, reload-on-change over an `IFileProvider`, and the
  `setFileProvider`/`setBasePath`/`setFileLoadErrorHandler` builder augmentations; ← `config` peer +
  `config.core` + `fileproviders.core` + `fileproviders.physical`; reads synchronously via
  `IFileInfo.physicalPath`, resets its store by reassignment per #86) ← `config.json` (rebased onto
  the base: reads through an `IFileProvider`, top-level JSON array now rejected), `config.ini`
  (`IniStreamParser` grammar), and `config.xml` (a self-contained tokenizer, NO XML-parser dep;
  encrypted-config decryptor and `KeyPerFile` out of scope). Hosting's default `reloadOnChange` stays
  OFF pending file-provider-watcher disposal ownership (§75, the #182 disposal question).
  `config.transformer` rewrites `.withType<T>()` and is standalone — di-independent (§15).
- **`hosting`** — `hosting.core` (`IHost`/`IHostedService`/`IHostedLifecycleService`/
  `BackgroundService`/`IHostApplicationLifetime`/`IHostLifetime`/`IHostBuilder`/
  `HostBuilderContext`/`IHostEnvironment`/`IHostApplicationBuilder` + the `addHostedService`
  augmentation; ← `config.core` + `di.core` + `diagnostics.core` + `fileproviders.core` +
  `logging.core`) ← `hosting` (the Generic Host runtime — classic `HostBuilder` and modern
  `HostApplicationBuilder`, the static `Host` factory, `HostOptions`, `ConsoleLifetime`,
  `HostingEnvironment`; ← the concrete `config`/`di`/`diagnostics`/`logging` packages +
  `options` + `options.augmentations` + the new `logging.console` console sink). The host→app
  configuration composition is a live `addConfiguration` chain, not a `flattenConfiguration`
  snapshot (§37). Full reference parity, no stubs inside hosting itself (§23); the builder parity
  surface is now finished (§67): `addHostedService`'s factory overload, a real
  `useDefaultServiceProvider` (threading `di`'s `ServiceProviderOptions` through `build()`, via a
  `WeakMap` side channel on the classic builder since the single-container model has no factory
  seam, §24), `HostApplicationBuilder.asHostBuilder()` (a classic `IHostBuilder` view backed by an
  internal `HostBuilderAdapter`), the `HostAbortedError(message, innerError)` constructor,
  and no-context convenience overloads on the pure-extension builder members only (the three
  core-interface members keep their single context-taking signature — a TS arity constraint, not
  an omission). The physical file provider now exists at its own family (`fileproviders.physical`,
  §73); only its content-root _wiring_ into `hosting` (swapping
  `HostingEnvironment.contentRootFileProvider`'s `NullFileProvider` default) stays a follow-up,
  and the non-console logging sinks it composes stay deferred (§18, §20/§73). `hosting.browser`
  (← `hosting` + `hosting.core` +
  `di.core`) hosts the same runtime in a page: `BrowserLifetime` on the existing
  `HOST_LIFETIME_TOKEN` (waitForStart immediate, pagehide-not-persisted → best-effort
  `stopApplication()` only — never a suspend→stop mapping, since `stopApplication` is a terminal
  one-shot latch and bfcache can resurrect a suspended tab), `PageLifecycleEvents` as the
  injectable lifecycle bridge (recurring flush-on-hidden as the persistence point, `onRestore` on
  bfcache pageshow), a browser `IHostEnvironment` + `BrowserHost` facade over
  `createEmptyApplicationBuilder` (never a fork); no reference-graph counterpart (§69).
- **`diagnostics`** — `diagnostics.core` (the `IMetricsBuilder`/`ITracingBuilder` abstractions,
  the rule/options data model, `METRICS_*`/`TRACING_*` tokens, `clearMetricsListeners`/
  `clearTracingListeners` via `di.core`'s `removeAll` (§61), and the most-specific-rule-wins
  resolvers `getMostSpecificInstrumentRule`/`getMostSpecificTracingRule` extracted as standalone
  pure functions over plain-data rule queries — the family's documented selection primitive,
  independent of the still-deferred listener runtime, §61; ← `di.core` + `options`) ←
  `diagnostics` (concrete `MetricsBuilder`/`TracingBuilder`, config-binding pipeline wired
  through `ConfigChangeTokenSource` for reload-reactive `IOptions<T>`, the per-listener
  `IMetricListenerConfigFactory`/`ActivityListenerConfigFactory` merged-configuration
  views `addMetricsConfiguration`/`addTracingConfiguration` register (§66), and the
  `addMetrics`/`addTracing` declaration-merging augmentations onto `di.core`'s
  `ServiceManifestClass`; ← `diagnostics.core` + `config` + `options` + `options.augmentations`
  - `primitives`, `di.core` as peer). The metrics/tracing **listener runtime** (no `Meter`/
    `Instrument`/`Activity`/`ActivitySource` analog) is intentionally not ported — `IMetricsListener`
    collapses to its rule-matching `name`, `ActivityListenerBuilder`'s delegate params collapse to
    `unknown`, and `addMetrics`/`addTracing` register no listener-activation wiring. Console/debug
    listener packages, `ME.Http.Diagnostics`, `ME.Diagnostics.ResourceMonitoring`, and
    `ME.Diagnostics.ExceptionSummarization` are all out of scope (no consumer, YAGNI).
- **`logging`** — `logging.core` (`ILogger`/`ILoggerFactory`/`ILoggerProvider`/`ILoggingBuilder`,
  `LogLevel`, `EventId`, structured `FormattedLogValues` (a lazy `[holeName, value]` enumeration +
  the `{OriginalFormat}` pseudo-entry, §63) + the `log*` convenience wrappers, plus the
  reference-type-parity additions `LogEntry<TState>`, `IBufferedLogger`/`BufferedLogRecord`,
  `ProviderAlias` (a decorator-free symbol marker + `getProviderAlias` reader), and
  `LoggerMessage.define`/`defineScope` (§63); `beginScope` and `LoggerFactoryExtensions.createLogger`
  are standalone-only-permanently, since each collides with its own receiver's primitive (§50); ←
  `di.core`) ← `logging` (`Logger`/`LoggerFactory` composite fan-out, `NullLogger*`,
  `LoggerFilterOptions`, `ILogger<T>`/`Logger<T>` generic-category logger via an open
  `ILogger<$1> → Logger<$1>` registration, `ISupportExternalScope` +
  `LoggerExternalScopeProvider` (`AsyncLocalStorage`-backed), the `LoggerRuleSelector`
  filter-selection engine actually consulted at log time, and the `addLogging` augmentation onto
  `di.core`'s `ServiceManifestClass`; ← `logging.core` + `options` + `options.augmentations`,
  `di` + `di.core` as peers — `setMinimumLevel` and `LoggerFactory.create` are real, no longer
  stubs, §62) ← `logging.config` (config-tree → `LoggerFilterOptions` binding via a lazy
  `addOptions`/`ConfigChangeTokenSource` pipeline, `addConfiguration`, and the full
  `ILoggerProviderConfigFactory`/`ILoggerProviderConfig<T>` provider-configuration
  plumbing over an open di template, §54; ← `logging` + `logging.core` + `config` + `config.core` +
  `di.core` + `options` + `options.augmentations`). Console/debug/event-log/trace-source providers
  beyond `logging.console` and `logging.browserconsole` (the page-hosted sibling — no
  reference-graph counterpart, §69) stay deferred pending a provider design (issue #75);
  `logging.console` itself is at full reference parity — formatters (`Simple`/`Json`/`Systemd`),
  ANSI colors, and a microtask-drained background queue in place of the reference's writer thread
  (§53).
- **`caching`** — `caching.core` (`IMemoryCache`/`ICacheEntry` abstractions + the
  `CacheExtensions`/`CacheEntryExtensions` convenience functions, owned outright so no
  augmentation is needed; the `MemoryCacheEntryExtensions` fluent sugar on `MemoryCacheEntryOptions`
  — a CLOSED value-object set, §49; the distributed-cache surface `IDistributedCache`/
  `DistributedCacheEntryOptions`/`DistributedCacheExtensions`/`DistributedCacheEntryExtensions`,
  with `IDistributedCache` on the standard interface-merge pattern like every other receiver (§80,
  retiring the §48/§60 many-implementers carve-out);
  and the `Hybrid/` abstractions-only subsystem (`HybridCache`/`HybridCacheEntryOptions`/
  `HybridCacheEntryFlags`/`IHybridCacheSerializer`/`IHybridCacheSerializerFactory`), ported ahead
  of any concrete tiered-cache implementation, §60; ← `primitives`) ← `caching.memory` (a
  genuinely working `MemoryCache`: absolute/sliding/change-token expiration, size-limited
  priority-then-LRU compaction, eviction callbacks, `getCurrentStatistics`/`MemoryCacheStatistics`,
  `keys`/`count` enumeration, linked-entry tracking (§65), plus `MemoryDistributedCache` +
  `addDistributedMemoryCache` (§60); `addMemoryCache`/`addDistributedMemoryCache` now route through
  a real `IOptions<T>` pipeline and resolve `ILoggerFactory` via `tryResolve`, registering through
  `di.core`'s `tryAddFactory` (§65); ← `caching.core` + `logging.core` + `options` + `primitives`,
  `di.core` as peer). Meter/observable-counter metrics hooks stay unported — no meter/instrument
  analog exists (§17).
- **`fileproviders`** — `fileproviders.core` (`IFileProvider`/`IFileInfo`/`IDirectoryContents`,
  `NullFileProvider`; ← `primitives`) ← `fileproviders.composite` (`CompositeFileProvider`
  fan-out over 0/1/N inner providers, `watch` now real for all tiers — including 2+
  change-emitting providers via `primitives`' `CompositeChangeToken`, closing issue #77, §58; ←
  `fileproviders.core` + `primitives`) ← `fileproviders.physical` (`PhysicalFileProvider`, a
  disk-backed provider over `IFileInfo`/`IDirectoryContents` with the reference's empty/invalid/
  absolute/above-root guards, `ExclusionFilters` — only `DotPrefixed` enforceable on this repo's
  POSIX target — and `watch` limited to exact-file / directory-prefix targets (an out-of-range
  wildcard filter throws rather than silently no-op'ing); the watcher is one mechanism per
  provider (active `fs.watch` XOR polling, 4000ms default, latching `hasChanged`), not the
  reference's always-composite backstop, since recursive `fs.watch` is unreliable on this repo's
  platform — polling is the deterministic path, §73; ← `fileproviders.core` + `primitives`).
  `ME.FileSystemGlobbing` (a `Physical`-only dependency upstream, no wildcard-watch consumer here)
  stays deliberately deferred — `fileproviders.physical`'s `watch` ports only the reference's
  non-glob branch, §73.

Cross-cutting invariants (each spans several packages — confirm against `docs/decisions.md`
before touching):

- **di ⊥ config** — neither imports the other; the only bridge is `options.augmentations` (§4.3).
- **Interface-first; no concrete leaks** — public signatures use the `di.core` interfaces
  (`IServiceProvider`, `IResolver`, `ServiceManifest`); the concrete `*Class` impls never appear in
  a public type (§1, §10).
- **Runtime identity is load-bearing** — `di` keeps `di.core` _external_ in its bundle so the
  `ServiceManifestClass` cross-package augmentations install onto is the same object everywhere;
  a private inlined copy forks identity and breaks the install (§9). config keeps providers
  external for the same reason. **Every bundling package keeps `@rhombus-std/primitives`
  external** — an inlined copy forks the augmentation registry's Map + event bus (§38).
- **Augmentations** — one named object literal per augmentation set (`satisfies
  AugmentationSet<R>`), authored first-party-only, installed via direct `applyAugmentations` for
  CLOSED receivers or the token registry + `@augment` decorator for OPEN ones; the transformer
  matches sugar calls at the receiver's declaration site, never by type name or call shape. Full
  mechanics, authoring steps, and gotchas: `docs/features/augmentations.md` (§89).

**Keep this digest in step with `docs/decisions.md`.** When a decision lands there that adds or
changes a family, a package boundary/edge, or a cross-cutting invariant, mirror it into the
Architecture section above. `decisions.md` is the full record; this file is the digest.

## Package naming

`@rhombus-std/<family>[.<qualifier>]`.

- **Families** (mirror the reference `ME.*` graph — see
  `docs/reference/me-extensions-dependencies.md`): `primitives`, `di`, `options`,
  `config`, `hosting`, `diagnostics`, `logging`, `caching`, `fileproviders`.
- **Qualifiers:**
  - `.core` — the abstractions/contracts layer for a family.
  - `.augmentations` — a side-effect declaration-merging extension package.
  - `.transformer` — an authoring-time transformer for a family.
  - Config providers keep their own name instead of a generic qualifier:
    `config.json`, `config.env`, `config.commandline`. Concrete providers in other families
    follow the same pattern — `logging.console` and `logging.browserconsole` are the console
    sinks for `logging`; `.browser` (`hosting.browser`) names a page-hosted runtime target rather
    than a provider, distinct from the qualifiers above.

## No-transformer-first

Every capability must be usable **smoothly and intuitively with no transformer at all** —
by direct consumers of these libraries _and_ by consumers of downstream libraries authored
on top of them. Design that hand-written experience first and make it good on its own
terms; it is the real API surface.

Transformers are pure ergonomics layered on afterward. A transformer must lower to
**exactly what a no-transformer user would have written by hand** — it may delete
boilerplate, never add a capability or change behavior. So the explicit/token forms
(`add(token, …)`, `addOptions(token, …)`) are primary and complete; the type-driven forms
(`add<T>()`, `addOptions<T>()`) are sugar rewritten _into_ them.

## Build layout — dist-referencing (§72)

**Every runtime library is dist-referenced (#68 complete).** Type-facing
`exports` conditions resolve the rolled `./dist/bundle/*.d.ts`, and runtime resolves the bundled
`./dist/bundle/*.js`, so an in-repo consumer typechecks and runs against the same sealed surface a
published consumer gets — never raw `.ts` source. The bundled artifacts live under `dist/bundle/` —
a role-named sibling of the `dist/stage/` lowering emit — so `dist` holds one directory per build
role. The old src-referencing rule (a `.` export's `source`/`bun`/`types` conditions pointing at
`./src/*.ts`) is retired (§72/§78). **src-refs are internal-only** now — never a runtime or publish
resolution: the per-core `<pkg>-source` self-compile condition, the `./tokens/*` / `./private/*`
white-box seams, and the editor whole-repo program's `source` condition (§105). **The white-box seam is two subpaths** — `./tokens/*` (all conditions → src, the token
surface the derivation reads) and, for a lowering package, `./private/*` (`types` → src, `bun` →
the lowered `./dist/stage/*.js` a white-box test executes). Neither is published (both scrubbed from
`publishConfig.exports`).

**Landed:** `primitives`, `options`, `fileproviders.core`, `fileproviders.composite`, `config.core`
(tiers 1–2, §72), and — following §74's token-derivation fix — `di.core`, `di`, `config.json`,
`config.env`, `config.commandline`, `diagnostics.core`, `diagnostics`, `logging.core`, `logging`,
`logging.config`, `logging.console`, `logging.browserconsole`, `caching.core`,
`caching.memory`, `hosting.core`, `hosting`, `hosting.browser`, `options.augmentations` (tier 3+,
§78). All: `.`-export type-facing conditions (and, for runtime-emitting libs, `bun`) point at
`dist/bundle`; root `main`/`types` point at `dist/bundle`. The three self-augmenting cores among them —
`di.core`, `diagnostics.core`, `hosting.core`, each of which `declare module`s its own public
receiver — carry a package-unique `<pkg>-source` condition (`di-core-source`/
`diagnostics-core-source`/`hosting-core-source`), listed first in the `.` export ahead of `types`,
so the core's OWN program resolves back to its not-yet-built src (the §72 TS2664 self-typecheck
fix) while every external consumer resolves the built dist; `hosting.core.test`'s white-box
program needs the same condition in its own tsconfig, since it pulls hosting.core's src through
`./private/*`. **The `built` custom condition is retired** (§78): dropped from di.core/di's `.`
export and from `customConditions` in all nine downstream consumer tsconfigs that used to force
dist-resolution with it (the `di.transformer` pair, the example/app programs, and the di + config
transformer test programs) — the per-core `-source` conditions above are its narrower replacement.

**`config` is converted — #68 complete.** Its `.` export resolves `bun`/`import`/`default` → dist
like every runtime lib; a package-unique `config-source` condition routes config's OWN program back
to `./src/*` for its `with-type-augment.ts` self-`declare module` (the same self-compile pattern as
the cores). Only its `./tokens/*` white-box subpath is src. No src-referenced runtime consumers
remain.

One further deviation, because a **transformer** is in play — now a single **Go/`ttsc`** engine
(the ts-patch/TS5 track was removed; restore tag `pre-tspatch-removal`):

- **Lint/typecheck is plain `tsc`.** Transformer-active packages type-check with `tsc --noEmit`; a
  `types` array in `tsconfig.ci.json` pulls the transformer's `declare module` augmentation into the
  program, so the authored tokenless forms type-check with no plugin (`nameof` and the sugar forms
  have no type-level footprint). `rollup` + `rollup-plugin-dts` live at the repo root.
- **The lowering stage (§40, stage-then-bundle).** Any library whose src calls `nameof<T>()` (etc.)
  ships it LOWERED: `buildPackage` runs a per-file `Bun.build` with the `@ttsc/unplugin/bun` adapter
  active — every `src/**/*.ts` its own entrypoint, all imports external — so each file is lowered
  into a stage dir; the main bundle then consumes that emit with no plugin (lowering commutes with
  bundling). The per-file emit is KEPT as `dist/stage/` (reached through the `./private/*` export's
  `bun` condition — white-box tests execute the lowered JS, since un-lowered `nameof` throws at
  import time; publish-excluded via `"!dist/stage"` in `files`), and the `.` export's `bun`
  condition points at `dist/bundle/index.js`.

Published `dist` is **bundled** (`bun build` for JS, `rollup-plugin-dts` for one rolled `.d.ts`),
never raw `tsc` output — extensionless bundler-style imports don't resolve under plain Node ESM
(`scripts/build-package.ts`).

**Build args are derived, not authored (§43).** There are no per-package `build.ts` files: every
library's `build` script runs `scripts/build-lib.ts`, which derives the `buildPackage` args from
the manifest — `external` = deps ∪ peers (the §9/§38 identity invariant as a rule; devDeps
inline), entrypoints/dts configs from the `exports` map, and the lowering stage runs iff a
`tsconfig.ttsc.json` exists. The optional `rhombusBuild` manifest field carries the deviations
(`typesOnly`/`inline`/`forbidImports`), each documented by a `//rhombusBuild` neighbor. Library
tsconfigs extend the shared root fragment `tsconfig.lib.json` (typecheck profile); the lowering-stage
config is the leaf `tsconfig.ttsc.json`, and a self-augmenting core's
`customConditions: ["<pkg>-source"]` (§78) stays leaf-side too.

### The transformer engine (Go/`ttsc`, §41/§90)

The four authoring-time transformers lower on ONE engine: a Go/`ttsc` port under the root
`transforms/` module (`go.mod` `github.com/fnioc/std/transforms`, ONE owner binary `cmd/ttsc-std`
linking all stages, shared `internal/`). It lowers `nameof`/`add`/`addOptions`/`withType` into the
shipped JS, and the lowered output equals what a no-transformer author would hand-write (the parity
invariant, token strings byte-for-byte). The **ts-patch/TS5 track is gone** (restore tag
`pre-tspatch-removal`); lint/typecheck is plain `tsc`. Go comes from **mise only** (`mise.toml`
pin), never system-wide.

- **Descriptor wiring** — every transformer's `./ttsc` subpath descriptor resolves to the SAME
  `cmd/ttsc-std` source dir (so `ttsc` dedupes every consumer to one cache key). Stage selection is
  **declare-by-depending** (§100/§103): the host's own workspace dependency scan (`CollectProject`,
  the single walk that also gathers inline bodies) activates the stages of every reachable
  `*.transformer` dependency — each names them in its `ttsc.stages` marker — and `ttsc-std` runs them
  in the hardcoded canonical order (inline → mergesynth → nameof → signatureof → di → di-options →
  config) regardless of declaration order. `build-lib.ts` passes no explicit plugin list, so `ttsc`'s
  own (direct-only) auto-discovery merely spawns the one host; an explicit `tsconfig.ttsc.json`
  `plugins` array is the override. The one binary links typia to run the `mergesynth` base stage
  (§103); di.core's `./ttsc` PRESET expands to the ordered di sugar bundle (inline → nameof →
  signatureof → di, no mergesynth).
- **Descriptor-only transformer packages** — `config.transformer` and `primitives.transformer`
  collapsed to their `./ttsc` (+ `inline-ttsc`/`signatureof-ttsc`) descriptors, no barrel to build.
  `di.transformer` / `di.transformer.options` keep a barrel that ships only the `declare module`
  authoring augmentation; di.transformer also holds the single-expression `inline.ts` sugar bodies
  (side-parsed from src, never bundled) + the `rhombus.inline` markers + the `signatureof` throwing
  stub.
- **Emit mechanism** — `ttsc -p` returns a stdout envelope, not files, so the build runs the Go
  plugin as a `@ttsc/unplugin/bun` onLoad transform inside the per-file `Bun.build` stage
  (`buildPackage`'s `ttscProject` via `ttscBunPlugin`). Toolchain pinned by `ttscEnv`
  (`GOTOOLCHAIN=local`, `TTSC_GO_BINARY` from `mise which go`, disk-backed `GOTMPDIR`).
- **Cache economics** — compiled sidecars cache at **repo-root** `node_modules/.cache/ttsc`
  (~25 MB/binary, shared not per-package): ~5 min cold once, ~3-4 s warm. CI provisions Go via
  `jdx/mise-action` and restores the `node_modules/.cache` tree + the Go build cache.
- **`transforms/go.work` is gitignored** (machine-specific abs paths); `scripts/gen-go-work.mjs`
  rebuilds it against the installed ttsc shim modules (`ttsc` also makes its own during a build, so
  `go.mod` has no `replace`). Parity: `tests/*.ttsc.e2e` (script `test:e2e`, now IN the default
  `bun run test` gate — self-skip only without Go) + the app example `expected.txt` byte-diff.
- **Go gates** — `node scripts/gen-go-work.mjs` then
  `cd transforms && go build ./... && go vet ./... && go test ./... && gofmt -l .` (needs mise Go on
  PATH).

## Publishing

**Publish with pnpm — never npm (or `bun publish`).** The dev→dist swap and the white-box scrub
(`docs/decisions.md` §7) both ride on `publishConfig.exports`; pnpm is the only package manager that
rewrites `exports` from that override at publish time. Publishing with anything else ships the wrong
entry points and leaks the white-box `./tokens/*` + `./private/*` seams.

## Tests

Tests live in sibling `tests/<lib>.test` packages (files under `tests/<lib>.test/test/`), not
co-located with `src/`. Transformer↔engine byte-parity suites are `tests/<family>.ttsc.e2e` (script
`test:e2e`).

- **White-box** (needs to reach into a library's internals): via that library's white-box seam —
  `./private/*` to EXECUTE delivered code (its `bun` condition resolves the lowered `dist/stage/`),
  or `./tokens/*` for the src-referenced token surface. A suite must not load one package through
  BOTH the barrel and `./private/*` — two module instances double-install the package's
  augmentations and collide.
- **Black-box** (exercises only the public surface): via a plain `workspace:*`
  devDependency on the library.

See `docs/decisions.md` §7 for the rationale and the publish-time scrub mechanics.
