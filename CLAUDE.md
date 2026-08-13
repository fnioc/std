# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# `@rhombus-std` monorepo

Project-specific rules only. General git/commit/worktree conventions live in user prefs, not here.

**Decision records** (`docs/`) — one authority rule: only the owner's file is gospel.

- **`decisions.user.md` — GOSPEL.** Decisions the owner made, nothing else. Ground architectural
  choices here and nowhere else. Every entry requires the owner's explicit signoff; never write to
  it without the owner's knowledge.
- **`decisions.v2.md` — NOT gospel.** Claude's own decision log (the "§N" citations below). Write to
  it freely — no permission needed — to track your thinking and to argue a position with the owner;
  never to ground an architectural decision.
- **`decisions.md` — retired; never write to it.** Correcting one of its entries = strike it there
  and author the corrected entry in `decisions.v2.md`.
- **No entry ever overrides another — correct the original in place instead.** Conflicting entries
  never coexist: the records read the same in any order. Entries speak only of the present, never of
  how things used to be.
- **di2 decisions stay distinct from di** until the owner says otherwise.

The root `README.md` is scaffolding-era and stale — ignore it.

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

Runtime is **bun** (workspaces, isolated linker per `bunfig.toml`). `mise.toml` pins Node to 24 and
pnpm/knip to exact versions; **bun and Go both track `latest` and are not pinned**, so a build here
is not reproducible across time or across machines by toolchain version alone.

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
  against the checked-in `expected.txt` (§16). CI splits that gate across jobs
  (`.github/workflows/ci.yml`): `main-gate` runs `build`/`test`/`lint`/`format:check` plus the Go
  gates, `transform-shards` runs the ttsc e2es (both behind a `changes` filter), and `verify` only
  aggregates their results — `verify` is the required status check on the `main` merge-queue
  ruleset. It's the same local gate running remotely, not a separate suite; `bun run test` locally
  is still authoritative.
- **Typecheck is per-package**, inside each package's `build`/`lint` (`tsc --noEmit -p tsconfig.ci.json`).
  Each package's `tsconfig.json` is the **editor** config instead — a whole-repo src-refs program (all
  `libraries/*/src` in one program, `@rhombus-std/*` → source) so IDE rename / find-refs span every
  package; the build and gate never read it (extends `/tsconfig.editor.json`).
  The root `typecheck` script (`tsc -b`) points at an empty solution stub and checks nothing — don't
  rely on it.
- **Lint** is `tsc --noEmit` for almost every package (29 of 32 libraries; `-p tsconfig.ci.json`).
  Typechecking suffices because the authored tokenless forms type-check against the sugar package's
  `declare module` augmentation — pulled in by a `types` array in the consuming package's
  `tsconfig.json` / `tsconfig.ttsc.json` — with no plugin, since `tokenfor` and the sugar forms have
  no type-level footprint. Only `di`, `di.core` and `hosting.core` run `eslint .`
  (typescript-eslint, type-aware). Formatting is **dprint** (`useBraces: always`).
- **Go gates** (the ttsc engine's own): `node scripts/gen-go-work.mjs` then, from `transforms/`,
  `go build ./... && go vet ./... && go test ./... && gofmt -l .` (needs mise Go on PATH; the
  generator rebuilds the gitignored `go.work` against the installed ttsc shim modules).

## Architecture

The package families **mirror the `ME.*` reference dependency graph**
(`docs/reference/me-extensions-dependencies.md`) package-for-package and edge-for-edge; the
API surface _within_ a package may deviate where TS/bun justifies it, but the graph is faithful
first and a distinction is collapsed only after it's shown unjustified (§0). Naming below in
[Package naming](#package-naming).

**The `ME.*` mirror is a means, not the goal.** Faithfulness is a disposable starting discipline:
the plan is to complete the port faithfully, _then_ refactor away from `ME.*` shapes. So "it mirrors
`ME.*`" is a weak design tiebreaker — where an `ME.*` shape conflicts with what's most correct or
idiomatic for TS, prefer correctness and say so; hold the `ME.*` shape during the faithful pass only
where that's cheap, and flag the intended divergence rather than pre-emptively taking it.

- **`primitives`** — universal leaf, zero deps. The **`Type` node space** (namespace `Type`, one
  factory per kind): a type is named by where it is reached from — `Type.imported(name, from,
  typeArgs?)` (`ImportedType`, kind `'imported'`) for a package, `Type.global(name, typeArgs?)`
  (`GlobalType`) for the ambient scope, no `from` member and `NominalType` unioning the two (§148);
  the factory is `imported` because `import` is a reserved word a namespace cannot export, and the
  namespace is what keeps every factory a documented declaration. Node names are spelled out and a
  factory pairs with its node — `func`/`ctor` are short only because `function`/`constructor` are
  unavailable as member names, not because they are callables (§149). Signatures carry their OWN
  quantifiers in `genericArgs` (open-only, identity-bearing, closed positionally; spec-object door;
  the token spells them in front — `<%T>(%T) => app:Box<%T>`, §152). `Iterable`/`Array` are the only
  aggregate kinds — delivery is call-site behavior, so `Type.async` and the dedicated `asyncIterable`
  kind are cancelled (`Promise<T>` and an ordinary global `AsyncIterable<E>` cover them, §151).
  **The wire format is fixed**: token strings never move for a TS-surface change. Also the
  change-token trio (`IChangeToken`,
  `ChangeToken.onChange` — the async-consumer forms real, via a runtime thenable check, §58 — plus
  `CompositeChangeToken` merging N tokens into one, §58) that underpins live-reload (§8), the
  `IServiceProvider` interface every resolution consumer holds, **and** the augmentation infra:
  one named exported object literal per ME static extension class — `satisfies AugmentationSet<R>`
  for a CLOSED receiver, or typed `AugmentationSet2<R, MemberMap>` against a named member-map type
  for OPEN (§28) — installed either directly via `applyAugmentations` (CLOSED receivers) or through the
  **augmentation registry** (§38) for OPEN receivers — `Token` (native to `primitives`),
  `registerAugmentations(token, set, merge?)` (per-token bag = a
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
  (`ILogger.log`/`beginScope`, `IMemoryCache.tryGetValue`, `ILoggerFactory.createLogger` — dot-callable
  at runtime; not statically typed, TS2430). It lives here
  (not `di.core`) because di ⊥ config forces the shared home onto the zero-dep leaf.
  `primitives.extras` (the sugar-only authoring package, née `primitives.transformer`) hosts the
  `tokenfor<T>()`/`tokenof()` token primitives — moved here out of this runtime leaf (§121:
  pure transformables, elided after lowering) — plus `typefor<T>()`, the `Type`-based authoring
  primitive `di` draws its tokenless sugar from, and the token-derivation machinery,
  di-independent so any family can mint augmentation tokens from types. The runtime leaf itself owns
  the structural
  platform typings (§39/§44): `AbortSignal`/`AbortController` (+ the inert `neverSignal`
  singleton), `ProcessLike`/`process`, `TimeoutHandle`/`setTimeout`/`clearTimeout`, and
  `ReadableStream<R>` — typed `globalThis` lookups, so libraries never need
  lib.dom/`@types/node`/bun-types to touch the platform. That zero-ambient-types program is
  pinned by `types: []` in `/tsconfig.lib.json`; `node:fs`/`node:path` imports get per-package
  compile-scope `node-builtins.d.ts` files (§44).
- **`di`** — `di.core` (the abstractions: `Manifest<Scopes>` the interface, `DefaultManifest<Scopes>`
  its concrete class — an iterable decorator chain whose own body declares only `_add`/`_remove`/
  `_replace`; every public verb arrives through augmentation sets, so a discarded verb result
  registers NOTHING. A service is named by a `Type` (re-exported from `primitives`, authored via
  `typefor<T>()`); public parameters take `Type | string` and normalize through `Type.from`,
  everything internal is `Type` only. A keyed registration composes the key into the type —
  `Type.tag(base, key)`, never a separate argument or a `base#key` string, and a type wears AT MOST
  ONE tag (`TagType.type` and the `tag` base are `Exclude<Type, TagType>`; a tagged base arriving as
  a value throws rather than re-keying, §150) — and an open template is built structurally,
  `Type.imported(name, from, [Type.generic(label)])`, the generic hole shared between the service
  type and the signature slot. The WHOLE error taxonomy ships here:
  `DiError` an abstract root, `UnsatisfiableError`/`CycleError`/`AmbiguousUnionError`/
  `ManifestValidationError` extending it so one `instanceof` classifies any container failure —
  `ManifestValidationError` carries its own readonly `errors` array positionally matching
  `failures` — it ships runtime) ← `di` (the resolution engine: `ServiceProvider` seals a manifest
  through the manifest's `build()` verb; `getRequiredService(type)` throws when nothing is
  registered, `getService(type)` returns `undefined`, `getServices(type)` yields the collection; it
  re-exports the taxonomy, so both imports name the same class and `instanceof` holds either way —
  di.core stays external in di's bundle so the `Manifest` cross-package augmentations install onto
  is the same object everywhere). Several provider members are declared and throw
  `NotImplementedError`, so a caller compiles and fails at the point of use, gated on the
  still-undecided lifetime and disposal model: `tryResolve`/`resolveAsync`/`dispose`/`disposeAsync`
  on `IServiceProvider`, plus `createAsyncScope` on both `IServiceProvider` and
  `IServiceScopeFactory` — `createScope(name?)` itself is real and takes an optional name,
  `IServiceScope` declares `getRequiredService`/`isService`, and
  `ServiceProviderOptions.validateScopes` is declared and read by nothing. The registration builder
  is real end to end: `add(type, configure)` hands the configure lambda a fluent chain —
  `asClass`/`asFactory`/`asValue` choose the implementation, `withSignature`/`withType` name its
  call shape (exactly one of the two, ever), and `withLifetime`/`taggedAs` set the scope and key. A
  builder that wraps a manifest holds it in a local structural `ManifestSlot`, and an all-in-one
  verb returns the manifest itself rather than a fluent tail. `NotImplementedError` lives in
  `primitives` and extends `Error` directly, since not-implemented is not a container concept.
  `di.extras` (the Go/ttsc authoring surface, depending on **`di.core` types only, never the `di`
  runtime** — hard invariant) carries `rhombus-std` marker `inline` entries for the twelve manifest verbs
  (`add`/`addClass`/`addFactory`/`addValue`, `tryAdd`/`tryAddClass`/`tryAddFactory`/`tryAddValue`,
  `replaceClass`/`replaceFactory`/`replaceValue`, `removeAll`) plus the three `get*` provider
  members (`getService`/`getRequiredService`/`getServices`) — fifteen entries total, each entry's
  `impl` resolved by walking `src/index.ts`'s re-export graph. The builder chain's own members
  (`asClass`/`asFactory`/`asValue`/`withSignature`/`withType`/`withLifetime`/`taggedAs`) carry no
  inline marker entries yet, so `add(type, configure)` has no type-driven `add<T>(configure)`
  counterpart. `di.extras.options` is a satellite lowering the `addOptions<T>()` sugar.
  The live parity suites under `tests/*.ttsc.e2e` are the test oracle, each asserting the emission
  an author would have written by hand.
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
  interface test); it emits a JS bundle) ← `config` (builder/root/section
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
  A schema is a **`Type` tree** — `Type.object({...})` at every level, a global `string`/`number`/
  `boolean` at each leaf, a union with `undefined` for an omittable member (§137); `withSchema<U>`
  takes the shape as a type argument, since a `Type` tree carries no type-level image.
  `config.extras` rewrites `.withType<T>()` via the `schemaof<T>()` expansion primitive and is
  standalone — di-independent (§15).
- **`hosting`** — `hosting.core` (`IHost`/`IHostedService`/`IHostedLifecycleService`/
  `BackgroundService`/`IHostApplicationLifetime`/`IHostLifetime`/`IHostBuilder`/
  `HostBuilderContext`/`IHostEnvironment`/`IHostApplicationBuilder` + the `addHostedService`
  augmentation; ← `config.core` + `di.core` + `diagnostics.core` + `fileproviders.core` +
  `logging.core`) ← `hosting` (the Generic Host runtime — classic `HostBuilder` and modern
  `HostApplicationBuilder`, the static `Host` factory, `HostOptions`, `ConsoleLifetime`,
  `HostingEnvironment`; ← the concrete `config`/`di`/`logging` packages + `diagnostics.core` +
  `options` + `options.augmentations` + the `logging.console` console sink). The host→app
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
  `addMetrics`/`addTracing` declaration-merging augmentations onto `di.core`'s `Manifest`; ←
  `diagnostics.core` + `config` + `options` + `options.augmentations`
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
  `di.core`'s `Manifest`; ← `logging.core` + `options` + `options.augmentations` + `di`,
  with `di.core` as its peer — `setMinimumLevel` and `LoggerFactory.create` are real, §62)
  ← `logging.config` (config-tree → `LoggerFilterOptions` binding via a lazy
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

Cross-cutting invariants (each spans several packages — confirm against the decisions docs
before touching):

- **di ⊥ config** — neither imports the other; the only bridge is `options.augmentations` (§4.3).
- **A library references the abstractions package; only an entry point references the engine**
  (§130) — repo-wide, not an examples-only convention. Everything a library needs (authoring
  registrations, holding an `IServiceProvider`, classifying a container failure) is reachable from
  `di.core` alone; `examples.lib.*` are the existence proof.
- **Interface-first; no concrete leaks** — public signatures use the `di.core` interfaces
  (`IServiceProvider`, `Manifest`); a concrete implementation (`DefaultManifest`, `ServiceProvider`)
  never appears in a public type (§1, §10).
- **The manifest is IMMUTABLE** — `Manifest` is an iterable decorator chain: every verb
  (`add`/`addFactory`/`addValue`, the descriptor verbs, every augmentation) returns a NEW manifest
  and leaves the receiver alone, so a discarded result registers NOTHING. `signatures` is a
  required arg 3; `scope` is arg 4 and `key` arg 5. A builder that wraps a manifest
  (`ILoggingBuilder`, `IMetricsBuilder`, `IHostApplicationBuilder`) exposes it as a WRITABLE slot
  (a local structural `ManifestSlot`) and siblings over one manifest share ONE holder;
  `IHostBuilder.configureServices` takes a RETURNING delegate (§114).
- **Runtime identity is load-bearing** — `di` keeps `di.core` _external_ in its bundle so the
  `Manifest` cross-package augmentations install onto is the same object everywhere;
  a private inlined copy forks identity and breaks the install (§9). config keeps providers
  external for the same reason. **Every bundling package keeps `@rhombus-std/primitives`
  external** — an inlined copy forks the augmentation registry's Map + subscriber list (§38). The same
  holds for the rolled `.d.ts`: a package that inlines di.core's types forks
  `Manifest`, so every di.core dependent keeps it external in `rollup.dts.mjs` (§114).
- **Augmentations** — file `<Receiver>-<Topic>-augmentations.ts` (receiver's leading `I` dropped); a
  named member-map type `I<Receiver><Topic>Augmentations` merges onto the receiver via `declare
  module … extends`, and the exported const `<Receiver><Topic>Augmentations` is typed
  `AugmentationSet2<Receiver, MemberMap>`, installed via the token registry + `@augment` decorator
  for OPEN receivers (the common case); a CLOSED receiver keeps `satisfies
  AugmentationSet<Receiver>` + direct `applyAugmentations`. Authored first-party-only; the
  transformer matches sugar calls at the receiver's declaration site, never by type name or call
  shape. Full mechanics, authoring steps, and gotchas: `docs/features/augmentations.md` (§89).

**Keep this digest in step with `docs/decisions.v2.md`.** When a decision lands there that adds or
changes a family, a package boundary/edge, or a cross-cutting invariant, mirror it into the
Architecture section above. The decisions docs are the full record; this file is the digest.

## Package naming

`@rhombus-std/<family>[.<qualifier>]`.

- **Families** (mirror the reference `ME.*` graph — see
  `docs/reference/me-extensions-dependencies.md`): `primitives`, `di`, `options`,
  `config`, `hosting`, `diagnostics`, `logging`, `caching`, `fileproviders`.
- **Qualifiers:**
  - `.core` — the abstractions/contracts layer for a family.
  - `.augmentations` — a side-effect declaration-merging extension package.
  - `.extras` — a sugar-only authoring package for a family (declare-module typings +
    `rhombus-std` marker `inline` bodies + one ttsc spawn descriptor). The old `.transformer` qualifier
    was renamed to `.extras` (§121): `primitives.extras`, `di.extras`,
    `di.extras.options`, `config.extras`. `primitives.extras` also homes the shared
    authoring-time token primitives (`tokenfor`/`tokenof` moved out of the runtime
    `primitives` leaf).
  - Config providers keep their own name instead of a generic qualifier — `config.json`,
    `config.env`, `config.commandline`, plus the file sub-family `config.file`/`config.ini`/
    `config.xml` (the Architecture section above is the authoritative roster). Concrete providers in other families
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

## Comments

**A comment explains the code in front of the reader — never the history of how it got there.**
This is a port, so comments accreted a running commentary on the porting process: lineage, decision
citations, rejected alternatives, superseded designs. None of that helps someone reading the code;
it occupies the space an explanation should. Where a case isn't covered below, decide by asking
_does this help someone understand the code in front of them?_

**Never write:**

- **Any allusion to `ME.*` / the reference implementation, however oblique** — "ported from `ME.X`",
  "the reference's Y", "reference parity", "mirrors the reference", ".NET", "Microsoft". This is
  judgment, not pattern-matching: an **intra-repo cross-reference is not lineage** ("the tracing
  counterpart of `MeterScope`" is fine — `MeterScope` is ours), and neither is ordinary English
  ("no POSIX **analog** — a documented no-op on Linux" is a platform fact a caller needs; "the
  **original**-cased key"). Naming an `ME.*` type that exists only there is lineage — cut it.
- `§N` decision refs, issue/PR numbers, version lore.
- Superseded designs and decided-against alternatives — "the old X", "previously", "retired".
- Transformer / plugin / "no-transformer" / "lowers to" framing — a token-arg signature already
  implies the plugin-less path, so there is nothing to say.
- Engine or architecture lore, _unless_ it directly helps a CALLER call the member.
- Restatements of visible code, the member name reworded, what a callee does at its call site, and
  what a NAME already conveys ("tryParse never throws" — `try` says it).
- Stale build-layout narration. src-referencing survives only **internally** (the `./tokens/*` and
  `./private/*` seams, the per-core `<pkg>-source` condition, the editor program) — **verify against
  the package's `exports` before citing it**, and never claim a package's runtime resolution is src.

**Write** only what helps a caller use a public member, or is genuinely hard to grok on a quick
read. When torn, delete. Form is real TSDoc — `@remarks` for prose, `@param`/`@returns` OMITTED when
the signature already says it, `@typeParam`, `@example`; don't hand-write what the types generate; a
good error message replaces a comment; a trivially-simple function gets none. File-level headers are
not automatically wrong — keep a trimmed orienting one, cut it when it merely restates the type's
own docs below it.

`libraries/primitives/src/augmentation-registry.ts` is the canonical swept file — match it. Never
delete a comment when doing so loses the answer to "why does this exist at all"; rewrite it instead.

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

Uniformly: a `.`-export's type-facing conditions (and, for runtime-emitting libs, `bun`) point at
`dist/bundle`, as do root `main`/`types`.

**A package that `declare module`s its own public receiver carries a package-unique `<pkg>-source`
condition** — `di-core-source`, `diagnostics-core-source`, `hosting-core-source`, `config-source` —
listed first in the `.` export ahead of `types`, so that package's OWN program resolves back to its
not-yet-built src (the §72 TS2664 self-typecheck fix) while every external consumer resolves the
built dist. `config`'s routes its `with-type-augment.ts` self-`declare module`; `hosting.core.test`'s
white-box program needs `hosting-core-source` in its own tsconfig, since it pulls hosting.core's src
through `./private/*`. **There is no `built` custom condition** (§78): neither di.core/di's `.` export nor any consumer
tsconfig's `customConditions` carries one — the per-package `-source` conditions above are what
force dist-resolution where it is wanted.

One further deviation, because a **transformer** is in play — now a single **Go/`ttsc`** engine
(the ts-patch/TS5 track was removed; restore tag `pre-tspatch-removal`):

- **Lint/typecheck is plain `tsc`** — no plugin (see the Lint bullet under [Commands](#commands) for
  how the `declare module` augmentation reaches the program). `rollup` + `rollup-plugin-dts` live at
  the repo root.
- **The lowering stage (§40, stage-then-bundle).** Any library whose src calls `tokenfor<T>()` (etc.)
  ships it LOWERED: `buildPackage` runs a per-file `Bun.build` with the `@ttsc/unplugin/bun` adapter
  active — every `src/**/*.ts` its own entrypoint, all imports external — so each file is lowered
  into a stage dir; the main bundle then consumes that emit with no plugin (lowering commutes with
  bundling). The per-file emit is KEPT as `dist/stage/` (reached through the `./private/*` export's
  `bun` condition — white-box tests execute the lowered JS, since un-lowered `tokenfor` throws at
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

### The transformer engine (Go/`ttsc`, §41/§90, rewritten §115)

The authoring-time sugar lowers on ONE engine: a Go/`ttsc` port under the root `transforms/`
module (`go.mod` `github.com/fnioc/std/transforms`, ONE owner binary `cmd/ttsc-std` linking every
stage, shared `internal/`). One always-on set of domain-agnostic primitive stages runs to a fixed
point per file (§115); the authoring surfaces (`add`/`addOptions`/`withType`/resolve-family) lower
as `rhombus-std` marker `inline` sugar bodies the inline stage substitutes and the primitives lower — no bespoke
per-family Go stage (§117). The lowered output equals what a no-transformer author would hand-write
(the parity invariant, token strings byte-for-byte). The **ts-patch/TS5 track is gone** (restore
tag `pre-tspatch-removal`); lint/typecheck is plain `tsc`. Go comes from **mise only**, never
system-wide — `mise.toml` declares it, but as `latest`, not a pinned version. Full mechanics:
`docs/features/transformer-architecture.md`.

**The primitive roster is three verbs over one vocabulary (§137)**: `typefor<T>()` NAMES a type (a
named type yields its interned `NominalType` address), `schemaof<T>()` EXPANDS one into the `Type`
tree describing its members — stopping at every name, so recursion terminates by construction —
and `signatureof(ctor)` OBSERVES a runtime constructor. `tokenfor`/`tokenof` are the string-token
pair, pending their own held retirement. There is no second structural vocabulary: the bespoke
config schema grammar (`Schema`/`Infer`/`OPTIONAL`) and the `signaturefor`/`signaturesfor`/`keyof`
primitives are all retired.

- **Descriptor wiring — one always-on stage table, NO selection (§119).** Every `*.extras` package's
  `./ttsc` descriptor resolves to the SAME `cmd/ttsc-std` source dir under the SAME name, so `ttsc`
  dedupes every consumer to one cache key and one spawn. There is no stage selection: once spawned,
  the host runs its WHOLE stage table on every file: `mergesynth` first, once, as a pre-pass, then
  the rest in a fixed canonical order (inline → nameof → signatureof → schemaof) looped to
  a fixed point; a stage that matches nothing is a cheap no-op
  (disjoint match sets). The bespoke di /
  di-options / config domain stages, the `ttsc.stages` markers, `selectStages`/`BaseBundles`, and
  di.core's preset `./ttsc` descriptor are all GONE — the authoring forms (`add`/`addOptions`/
  `withType`/resolve-family) lower as `rhombus-std` marker `inline` sugar bodies the inline stage substitutes and
  the primitives lower. What a dependency governs is **spawning + which bodies are in play**: ttsc's
  direct-only auto-discovery spawns the one host from a consumer's direct `*.extras` dep (its
  `ttsc.plugin` marker), and the host's single `CollectProject` scan gathers the inline BODIES from
  the transitive graph (§100). `build-lib.ts` passes no explicit plugin list; an explicit
  `tsconfig.ttsc.json` `plugins` array is the only override. The one binary links typia to run
  `mergesynth` (§103) as a one-shot pre-pass ahead of the loop.
- **`*.extras` package shapes** — `config.extras` collapses to its single `./ttsc` descriptor (no
  barrel). `primitives.extras` carries a barrel (the token primitives `tokenfor`/`tokenof`) plus
  its `./ttsc` descriptor. `di.extras` / `di.extras.options` keep a barrel shipping only the
  `declare module` authoring augmentation; di.extras also holds the single-expression `inline.ts`
  sugar bodies (side-parsed from src, never bundled) + the `rhombus-std` `inline` markers + the
  `signatureof` throwing stub.
- **Emit mechanism** — `ttsc -p` returns a stdout envelope, not files, so the build runs the Go
  plugin as a `@ttsc/unplugin/bun` onLoad transform inside the per-file `Bun.build` stage
  (`buildPackage`'s `ttscProject` via `ttscBunPlugin`). Toolchain pinned by `ttscEnv`
  (`GOTOOLCHAIN=local`, `TTSC_GO_BINARY` from `mise which go`, shared home-dir `GOTMPDIR` +
  `TTSC_CACHE_DIR`).
- **Cache economics (§107)** — the compiled sidecars live at `~/.cache/fnioc-ttsc/cache`
  (`TTSC_CACHE_DIR`, env-overridable), shared across every worktree and e2e suite: keyed binaries,
  ~30 MB each. The Go objects go to the global `~/.cache/go-build` (`GOCACHE` pinned to Go's own
  default — a set value is what flips ttsc off its private cache), shared with the transforms Go
  gates, so a cold sidecar compile against a gate-warmed cache is mostly re-linking; a truly cold
  machine pays ~5 min once. The throwaway e2e sandboxes
  live per-worktree at `~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname>` — OUTSIDE the repo tree,
  since a sandbox under an enclosing `package.json` makes ttsc re-root its token derivation to that
  package (off the per-user-quota tmpfs `/tmp`). CI provisions Go via `jdx/mise-action` and restores
  `~/.cache/fnioc-ttsc/cache` + the Go build cache.
- **`transforms/go.work` is gitignored** (machine-specific abs paths); `scripts/gen-go-work.mjs`
  rebuilds it against the installed ttsc shim modules (`ttsc` also makes its own during a build, so
  `go.mod` has no `replace`). Parity: `tests/*.ttsc.e2e` (script `test:e2e`, now IN the default
  `bun run test` gate — self-skip only without Go) + the app example `expected.txt` byte-diff.
- **Go gates** — see the Go-gates bullet under [Commands](#commands).

## Publishing

**Publish with pnpm — never npm (or `bun publish`).** The dev→dist swap and the white-box scrub
(`docs/decisions.md` §7) both ride on `publishConfig.exports`; pnpm is the only package manager that
rewrites `exports` from that override at publish time. Publishing with anything else ships the wrong
entry points and leaks the white-box `./tokens/*` + `./private/*` seams.

## Repository settings

Repo settings, labels and rulesets are code: **`.github/settings.yml`**, applied by the Probot
Settings app installed org-wide on `fnioc`. **Change them by editing the file and PRing it**, never
through `gh api` or the web UI — a hand-made change is invisible to the file, which then misdescribes
the repo until someone reconciles it by hand.

- **A sync takes ~13 minutes and reports nothing.** The app creates no check run, so one still in
  progress is indistinguishable from one that died. Allow 15 minutes before concluding a section
  failed to apply.
- **It never reconciles drift, and the trigger set is narrow**: a push to `main` whose commit
  touches `settings.yml`, repository creation, or a default-branch change. Nothing else — a label
  event does not sync, despite the installation subscribing to `label`. A comment-only edit to the
  file is enough to force one.
- **Every list section is destructive.** `labels:` and `rulesets:` are diffed against the live repo:
  an entry present remotely but absent from the file is DELETED, not left alone. Dropping a label
  strips it from every issue and PR carrying it. Omitting a whole section is a safe no-op;
  half-populating one is not.
- **`repository:` is a pass-through PATCH**, so any field the update-repo endpoint accepts works.
  `topics` is a comma-separated **string**, not a list.
- **Write ruleset parameters out in full**, API defaults included. The app decides "changed?" by
  deep-equal against what GitHub returns, so an omitted default re-PUTs the ruleset every sync.
- **Two `repository:` keys are set by hand, not by the file** — `topics` and
  `security_and_analysis`. Both are commented out in `settings.yml` with the reproduction and the
  command to set them; keep the commented values in step when you change either. `security_and_analysis`
  is unfixable in the app's design: GitHub silently drops the block when it arrives alongside other
  repository fields, and the app sends exactly one PATCH containing all of them.
- **Secrets and variables are not manageable there** and never will be — a file in this repo is
  public plaintext. Use `gh secret set` / `gh variable set`.
- Two rules **cannot** exist here, both verified against the API: push rules (`target: push`, thus
  `file_path_restriction` and family) are rejected on public repos outright, and the `workflows`
  rule fails with an empty error detail. The first ruleset in the file carries every rule type
  commented out, with the evidence — read that before re-deriving either.

Validate a ruleset change by POSTing it as `enforcement: disabled`, confirming it's accepted, then
DELETEing it. That never touches the live `main-merge-queue`.

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
