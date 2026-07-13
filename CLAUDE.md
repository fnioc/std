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
  `scripts/build-all.ts`. Transformer-active packages resolve their upstream through the `built`
  d.ts condition, not source (see [Build layout](#build-layout--dist-referencing-in-progress-72)),
  so the upstream `dist` must be complete and stable before they compile — a flat parallel build
  races and silently mis-resolves. `build-all` tiers the workspace by its dependency graph and
  finishes each tier before the next (§1/§9).
- **`bun run test` is the full gate.** It includes the `examples.app.*` output-diff e2e: build with
  `tspc`, run, `diff` stdout against the checked-in `expected.txt` (§16). CI's `verify` job
  (`.github/workflows/ci.yml`) runs `build`/`test`/`lint` on every push/PR/merge_group and is a
  required status check on the `main` merge-queue ruleset — but it's the same local gate running
  remotely, not a separate suite; `bun run test` locally is still authoritative.
- **Typecheck is per-package**, inside each package's `build`/`lint` (`tsc --noEmit -p tsconfig.json`,
  or `tspc --noEmit` for transformer-consumers). The root `typecheck` script (`tsc -b`) points at
  an empty solution stub and checks nothing — don't rely on it.
- **Lint** is eslint (typescript-eslint, type-aware) over `libraries|examples/*/src`; but
  transformer-consuming packages lint by _typechecking_ (`tsc`/`tspc --noEmit`), since their
  authored forms only exist after the transform. Formatting is **dprint** (`useBraces: always`).

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
  iterating subscribers directly lets the throw reach the registrant, §78), and the `@augment(token)`
  class decorator that DELTA-installs (§78):
  on first application it catches up on the accumulated bag once, and each later registration installs
  only its own `set` onto the prototype — never the whole bag again, so a member on a heavily-shared
  token installs exactly once per class. Collision is resolved BLIND at install time (no token/receiver/
  member identity): a name already taken on the prototype with NO `merge` strategy THROWS (never a
  silent clobber), and with a `MergeStrategy` (per member name, §78) installs a dispatcher chaining the
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
  `di.transformer` (ts-patch: token derivation, dependency extraction, registration lowering,
  factory-signature diagnostic) depends on **`di.core` types only, never the `di` runtime**
  (§2 — hard invariant). `di.transformer.options` is a satellite lowering the `addOptions<T>()`
  sugar (§15). di.core's public type surface also ships `ServiceProviderFactory` — the reference
  `IServiceProviderFactory` analog, shared by the hosting builders (§24) — and the capability
  interfaces `RequiredResolver` / `ServiceQuery` that `Resolver` composes (the reference
  `ISupportRequiredService` / `IServiceProviderIsService` analogs, §27).
- **`options`** — the collapsed `Options<T>` accessor + the configure / post-configure / validate
  `OptionsFactory` pipeline (§4), **plus** startup validation (`IStartupValidator`/`StartupValidator`,
  forced by `Host.start`, §55) and `ValidateOptionsResultBuilder` for multi-failure aggregation
  (§64). Depends **`di.core` only; config-unaware.** `options.augmentations` is the **one place di
  and config meet** — the config→`Options<T>` bridge (§14) — and now also exports its pipeline
  slot-token grammar (`configureStepToken` et al., §54) so a downstream package can register an
  OPEN `IConfigureOptions`/`IOptionsChangeTokenSource`-style step for a type it doesn't own; its
  `validateOnStart` manifest verb (§55) and DI-injected `configure`/`postConfigure`/`validate`
  overloads (a token-tuple + tuple-typed callback, §64) round out the pipeline. All three pipeline
  stages are reachable through the manifest surface (§76); validation is **sync-only** by design
  (the async family stays out) and the config→`Options<T>` bind is a compose-not-clobber structural
  deep-merge, not a reflective bind (§76).
- **`config`** — `config.core` (the `IConfiguration*` types — pure types, zero runtime emit, so it
  is dist-referenced as `dist/index.d.ts` only, §72 — plus the shared `properties` key/value bag
  between a builder and its sources, §59) ← `config` (builder/root/section
  engine + reload tokens, §8; `ConfigurationManager` seeds a default memory source so `set()`
  works before any `add()`, §32; `ConfigurationProvider#toString` gives `getDebugView` a friendly
  provider label, §33; `ChainedConfigurationSource`/`ChainedConfigurationProvider` wrap an
  existing `IConfiguration` as a source — implements `IConfigurationProvider` directly, no data
  store of its own — installing `addConfiguration` on BOTH `ConfigurationBuilder` and
  `ConfigurationManager`, §37; `StreamConfigurationSource`/`Provider` read an already-open
  `Uint8Array | string` payload with a once-only load guard, §59) ← providers `config.json` /
  `config.env` / `config.commandline` (each a `declare module` augmentation adding e.g.
  `addJsonFile` to BOTH `ConfigurationBuilder` and `ConfigurationManager`, §35; `config.json` adds
  `JsonStreamConfigurationSource`/`Provider` + `addJsonStream` over a shared internal
  `JsonConfigurationFileParser`, §59). `config.env` also exports
  `colonAndDotVariableNameTransformation` and normalizes its prefix through the transform before
  matching (§30/§31) and re-keys `*CONNSTR_`-prefixed vars into the `ConnectionStrings` section
  (provider-name sub-keys omitted, §75); `config.commandline` honors bare `key=value` argv tokens
  (§34). The **file-configuration sub-family** (§75): `config.file` — the shared base
  (`FileConfigurationSource`/`FileConfigurationProvider`, `FileLoadErrorContext`,
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
  through `ConfigurationChangeTokenSource` for reload-reactive `Options<T>`, the per-listener
  `IMetricListenerConfigurationFactory`/`ActivityListenerConfigurationFactory` merged-configuration
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
  stubs, §62) ← `logging.configuration` (config-tree → `LoggerFilterOptions` binding via a lazy
  `addOptions`/`ConfigurationChangeTokenSource` pipeline, `addConfiguration`, and the full
  `ILoggerProviderConfigurationFactory`/`ILoggerProviderConfiguration<T>` provider-configuration
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
  with `IDistributedCache` getting the many-implementers no-interface-merge treatment (§48, §60);
  and the `Hybrid/` abstractions-only subsystem (`HybridCache`/`HybridCacheEntryOptions`/
  `HybridCacheEntryFlags`/`IHybridCacheSerializer`/`IHybridCacheSerializerFactory`), ported ahead
  of any concrete tiered-cache implementation, §60; ← `primitives`) ← `caching.memory` (a
  genuinely working `MemoryCache`: absolute/sliding/change-token expiration, size-limited
  priority-then-LRU compaction, eviction callbacks, `getCurrentStatistics`/`MemoryCacheStatistics`,
  `keys`/`count` enumeration, linked-entry tracking (§65), plus `MemoryDistributedCache` +
  `addDistributedMemoryCache` (§60); `addMemoryCache`/`addDistributedMemoryCache` now route through
  a real `Options<T>` pipeline and resolve `ILoggerFactory` via `tryResolve`, registering through
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
  (`ServiceProvider`, `Resolver`, `ServiceManifest`); the concrete `*Class` impls never appear in
  a public type (§1, §10).
- **Runtime identity is load-bearing** — `di` keeps `di.core` _external_ in its bundle so the
  `ServiceManifestClass` cross-package augmentations install onto is the same object everywhere;
  a private inlined copy forks identity and breaks the install (§9). config keeps providers
  external for the same reason. **Every bundling package keeps `@rhombus-std/primitives`
  external** — an inlined copy forks the augmentation registry's Map + event bus (§38).
- **Augmentations, one object literal per ME static class** — every augmentation is a single named
  exported const mirroring exactly one reference-stack static extension class (e.g.
  `JsonConfigurationExtensions`), `satisfies AugmentationSet<R>`, with camelCased receiver-first
  members; there are no floating standalone `addX(receiver, …)` functions — the object-literal
  member (`JsonConfigurationExtensions.addJsonFile(builder, …)`) IS the functional call surface
  (§28). Install path (§38): CLOSED receivers (interface + all augmentations in one family) use
  direct `applyAugmentations`; OPEN receivers (extended by downstream packages) register via
  `registerAugmentations(nameof<Receiver>(), TheConst)` beside the const, and each concrete class
  is decorated `@augment(nameof<Receiver>())` — one token can decorate several classes. Tokens are
  derived INLINE at each use site (`nameof<Interface>()`, lowered to
  `"<declaring-package>:<TypeName>"`); there are NO exported token consts (§40). A hand-written
  (no-transformer) consumer writes the literal string directly. A
  `.core`-authored const's interface-side `declare module` merge lives beside it in `.core`.
  **Implementer class-side merges are retired (§71, supersedes §38's "stays downstream" text):**
  a concrete class that implements an augmented interface gets a same-name empty extends-merge
  beside its `@augment` decoration (`export interface C extends I {}`) instead of restating
  members — the extends binds the interface symbol onto the class so every augmentation flows
  through live, present or future. Cross-package class-side merges (a downstream package widening
  an upstream `internal/*`-reached class) are banned outright as the #168 publish-hazard class,
  not merely retired. The carve-out: a class with no augmented-interface counterpart (a CLOSED
  value-object receiver, a many-implementers receiver left deliberately unmerged, or a class that
  intentionally doesn't implement its family's base interface) keeps a direct class-side merge —
  flagged per-site for owner review, not auto-converted. `publishConfig.exports` is now derived by
  `scripts/derive-publish-config.ts` (`--check` wired into the root `lint` script) rather than
  hand-authored, closing the matching #168 hazard on the publish-config side. **Merge-identity
  rule:** every interface-side merge for one interface must
  resolve to the interface's declaring module file — but a DOWNSTREAM/published-facing author
  merging onto an OPEN receiver it doesn't own must resolve through the receiver's PUBLIC BARREL,
  never `internal/*` (the publish-time scrub makes `internal/*` unreachable for a published
  extender, §47; `di.core`'s `authoring.ts` documents the barrel form). Mixing barrel and
  declaring-module specifiers for the SAME interface makes TS treat the `this`-returning members as
  unrelated this-types and breaks `implements` (§38). **Many-implementers rule:** a receiver with
  multiple present/future/test-fake implementers and no single owning concrete (`ILogger`,
  `IDistributedCache`) gets NO interface-side merge at all — registry install + per-class
  `@augment` + an exported `*ExtensionMethods` typing interface only, since a merge would force
  phantom members onto every implementer (§36, §48).

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

## Build layout — dist-referencing, in progress (§72)

**The target invariant (not yet universal): every package is dist-referenced.** Type-facing
`exports` conditions resolve the rolled `./dist/*.d.ts`, and runtime resolves the bundled
`./dist/*.js`, so an in-repo consumer typechecks and runs against the same sealed surface a
published consumer gets — never raw `.ts` source. The old src-referencing rule (a `.` export's
`source`/`bun`/`types` conditions pointing at `./src/*.ts`, permitted only for d.ts-only libs) is
being retired package by package; see §72 in `docs/decisions.md` for why and for the current
front line. **`internal/*` deliberately stays src-referenced** — white-box tests need it, and there
is no rolled per-file `.d.ts` for it to resolve to instead.

**Landed:** `primitives`, `options`, `fileproviders.core`, `fileproviders.composite`, `config.core`
(tiers 1–2, §72), and — following §74's token-derivation fix — `di.core`, `di`, `config.json`,
`config.env`, `config.commandline`, `diagnostics.core`, `diagnostics`, `logging.core`, `logging`,
`logging.configuration`, `logging.console`, `logging.browserconsole`, `caching.core`,
`caching.memory`, `hosting.core`, `hosting`, `hosting.browser`, `options.augmentations` (tier 3+,
§78). All: `.`-export type-facing conditions (and, for runtime-emitting libs, `bun`) point at
`dist`; root `main`/`types` point at `dist`. The three self-augmenting cores among them —
`di.core`, `diagnostics.core`, `hosting.core`, each of which `declare module`s its own public
receiver — carry a package-unique `<pkg>-source` condition (`di-core-source`/
`diagnostics-core-source`/`hosting-core-source`), listed first in the `.` export ahead of `types`,
so the core's OWN program resolves back to its not-yet-built src (the §72 TS2664 self-typecheck
fix) while every external consumer resolves the built dist; `hosting.core.test`'s white-box
program needs the same condition in its own tsconfig, since it pulls hosting.core's src through
`./internal/*`. **The `built` custom condition is retired** (§78): dropped from di.core/di's `.`
export and from `customConditions` in all nine downstream consumer tsconfigs that used to force
dist-resolution with it (the `di.transformer` pair, the example/app programs, and the di + config
transformer test programs) — the per-core `-source` conditions above are its narrower replacement.

**Deferred — `config` is the sole remaining src-referenced runtime lib (#68 stays open, scoped to
it).** `config` declares its augmentation receivers at SUBPATH exports
(`./configuration-builder`, `./configuration-manager`) that its providers merge onto;
`config.json`/`config.env`/`config.commandline` converted fine against config's still-src
subpaths, since their augmentations are compile-time-only with no runtime token to desync. Flipping
config's own `.` export to dist would seal it external, and `rollup-plugin-dts` can no longer pull
those src subpath modules into a provider's program (TS2664, with no `-source`-style fix available
since the receivers themselves live at the subpaths). Per §74, this closes only via a COMPLETE
per-package flip — collapsing those subpaths onto the rolled root barrel AND updating
`config.transformer`'s token derivation to match — a design decision, not a mechanical shim, so it
was left rather than forced (§78).

Mechanically, for packages not yet converted: they consume each other's raw TS `src` via
`workspace:*` + `exports` whose `source`/`bun`/`types` conditions point at `.ts`, under
`moduleResolution: bundler`. The `import`/`default` conditions point at built `dist` — what
published consumers resolve.

One further deviation, because a **transformer** is in play:

- **`tspc`, not `tsc`.** Transformer-active packages build/typecheck with `tspc` (ts-patch), wired
  per-package: a `plugins: [{ transform, import }]` entry in `tsconfig.json` plus the `types` array
  bringing the augmentation into the program. `ts-patch`, `rollup`, and `rollup-plugin-dts` live at
  the repo root so every workspace can reach them.
- **The `nameof` lowering stage (§40).** Any library whose src calls `nameof<T>()` must ship it
  LOWERED: its build runs `tspc -p tsconfig.build.json` into `.tspc-out/` and `bun build` bundles
  that emit (`buildPackage`'s `tspcProject`). The per-file emit is kept as `dist/internal/` (the
  `internal/*` export's `bun` condition — white-box tests execute lowered JS, since un-lowered
  `nameof` throws at import time; publish-excluded via `"!dist/internal"` in `files`), and the
  `.` export's `bun` condition points at `dist/index.js`.

Published `dist` is **bundled** (`bun build` for JS, `rollup-plugin-dts` for one rolled `.d.ts`),
never raw `tsc` output — extensionless bundler-style imports don't resolve under plain Node ESM
(`scripts/build-package.ts`).

**Build args are derived, not authored (§43).** There are no per-package `build.ts` files: every
library's `build` script runs `scripts/build-lib.ts`, which derives the `buildPackage` args from
the manifest — `external` = deps ∪ peers (the §9/§38 identity invariant as a rule; devDeps
inline), entrypoints/dts configs from the `exports` map, lowering engine from twin-config
existence (`tsconfig.build.json` → tspc, `tsconfig.ttsc.json` → ttsc). The optional
`rhombusBuild` manifest field carries the four deviations (`lowering`/`typesOnly`/`inline`/
`forbidImports`), each documented by a `//rhombusBuild` neighbor. Library tsconfigs extend the
shared root fragments `tsconfig.lib.json` (typecheck profile) / `tsconfig.tspc.json` (lowering
stage); `include`, `rootDir`/`outDir`, and a self-augmenting core's `customConditions: ["<pkg>-source"]`
(§78) stay leaf-side.

### Two transformer engines — dual-track (§41)

The four authoring-time transformers exist twice. The **ts-patch/TS5** sources
(`libraries/*.transformer`) stay the **lint/typecheck gate** (`tspc --noEmit`, eslint) — unchanged.
A **Go/`ttsc`** port under the root `transforms/` module
(`go.mod` `github.com/fnioc/std/transforms`, one `cmd/ttsc-*` per plugin, shared `internal/`) is
the **build/emit engine**: it lowers `nameof`/`add`/`addOptions`/`withType` into the shipped JS.
The two must lower **identically — token strings byte-for-byte** (the parity invariant); code shape
may differ. Go comes from **mise only** (`mise.toml` pin), never system-wide.

- **Descriptor wiring** mirrors the canonical `ttsc` recipe: each transformer keeps its ts-patch
  `.` entry and adds a `./ttsc` subpath → thin `ttsc.mjs` shim that `path.resolve`s the Go
  `cmd/ttsc-<name>` source, plus a `"ttsc": { "plugin": { "transform": "…/ttsc" } }` marker.
- **One native backend per pass** — `ttsc` errors on two plugins, so a consumer needing both di +
  di-options wires ONE aggregate host (`cmd/ttsc-di-app`, `di.transformer.options/ttsc-app`).
- **Emit mechanism** — `ttsc -p` returns a stdout envelope, not files, so the build runs the Go
  plugin as a `@ttsc/unplugin/bun` onLoad transform inside `Bun.build`: `buildPackage`'s
  `ttscProject` (parallel to `tspcProject`, one XOR the other) via `ttscBunPlugin`. Toolchain pinned
  by `ttscEnv` (`GOTOOLCHAIN=local`, `TTSC_GO_BINARY` from `mise which go`, disk-backed `GOTMPDIR`).
- **Cache economics** — compiled sidecars cache at **repo-root** `node_modules/.cache/ttsc`
  (~25 MB/binary, shared not per-package): ~5 min cold once per distinct plugin, ~3-4 s warm. CI
  provisions Go via `jdx/mise-action` and restores this cache.
- **Pilot** — only `caching.core` flips its emit to `ttscProject` (byte-identical dist; tspc twin
  retained as `tsconfig.build.json`); full library-tier conversion is a measured follow-up.
- **`transforms/go.work` is gitignored** (machine-specific abs paths); `ttsc` makes its own, so
  `go.mod` has no `replace`. Parity: `tests/*.ttsc.e2e` (script `test:e2e`, self-skip without Go —
  OUT of the default `bun --filter '*' test` gate) + the app example `expected.txt` byte-diff.
- **Go gates** — `cd transforms && go build ./... && go vet ./... && go test ./... && gofmt -l .`
  (needs mise Go on PATH and the machine-local `go.work`).

## Publishing

**Publish with pnpm — never npm (or `bun publish`).** The dev→dist swap and the
`internal/*` white-box scrub (`docs/decisions.md` §7) both ride on `publishConfig.exports`;
pnpm is the only package manager that rewrites `exports` from that override at publish
time. Publishing with anything else ships the wrong entry points and leaks `internal/*`.

## Tests

Tests live in sibling `tests/<lib>.test` packages (files under `tests/<lib>.test/test/`), not
co-located with `src/`. End-to-end suites that cross the transformer→engine boundary are
`tests/<family>.tests.integration`.

- **White-box** (needs to reach into a library's internals): via that library's
  `internal/*` export subpath.
- **Black-box** (exercises only the public surface): via a plain `workspace:*`
  devDependency on the library.

See `docs/decisions.md` §7 for the rationale and the publish-time scrub mechanics.
