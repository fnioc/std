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
  d.ts condition, not source (see [Build layout](#build-layout--source-libs-with-a-built-exception)),
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
  `ChangeToken.onChange`) that underpins live-reload (§8), **and** the augmentation infra:
  one named exported object literal per ME static extension class, `satisfies AugmentationSet<R>`
  (§28), installed either directly via `applyAugmentations` (CLOSED receivers) or through the
  **augmentation registry** (§38) for OPEN receivers — `Token` (hoisted from di.core, which
  re-exports it), `registerAugmentations(token, set)` (flat per-token bag, throws on member-name
  collision, notifies an `EventTarget` bus), and the `@augment(token)` class decorator that
  (re)installs the token's bag on the prototype now and on every later registration. It lives here
  (not `di.core`) because di ⊥ config forces the shared home onto the zero-dep leaf.
  `primitives.transformer` hosts the `nameof<T>()`/token-derivation machinery extracted from
  di.transformer (which depends on it and re-exports the old surface). It also owns structural
  `AbortSignal`/`AbortController` typings + a typed constructor re-export (§39), so libraries never
  need lib.dom/`@types/node`/bun-types just to name the abort API.
- **`di`** — `di.core` (the abstractions **and** the concrete `ServiceManifest` registration
  builder + registration-time errors — it ships runtime, §9 — plus the
  `ServiceCollectionDescriptorExtensions.removeAll` descriptor verb, §38) ← `di` (the resolution engine:
  scopes, resolution, captive-dependency protection, disposal). `di.transformer` (ts-patch: token
  derivation, dependency extraction, registration lowering, factory-signature diagnostic) depends
  on **`di.core` types only, never the `di` runtime** (§2 — hard invariant). `di.transformer.options`
  is a satellite lowering the `addOptions<T>()` sugar (§15). di.core's public type surface also ships
  `ServiceProviderFactory` — the reference `IServiceProviderFactory` analog, shared by the hosting
  builders (§24) — and the capability interfaces `RequiredResolver` / `ServiceQuery` that `Resolver`
  composes (the reference `ISupportRequiredService` / `IServiceProviderIsService` analogs, §27).
- **`options`** — the collapsed `Options<T>` accessor + the configure / post-configure / validate
  `OptionsFactory` pipeline (§4). Depends **`di.core` only; config-unaware.** `options.augmentations`
  is the **one place di and config meet** — the config→`Options<T>` bridge (§14).
- **`config`** — `config.core` (the `IConfiguration*` types + one runtime export, the
  `IConfigurationBuilder` augmentation token — no longer pure-types, §38) ← `config` (builder/root/section
  engine + reload tokens, §8; `ConfigurationManager` seeds a default memory source so `set()`
  works before any `add()`, §32; `ConfigurationProvider#toString` gives `getDebugView` a friendly
  provider label, §33; `ChainedConfigurationSource`/`ChainedConfigurationProvider` wrap an
  existing `IConfiguration` as a source — implements `IConfigurationProvider` directly, no data
  store of its own — installing `addConfiguration` on BOTH `ConfigurationBuilder` and
  `ConfigurationManager`, §37) ← providers `config.json` / `config.env` / `config.commandline`
  (each a `declare module` augmentation adding e.g. `addJsonFile` to BOTH `ConfigurationBuilder`
  and `ConfigurationManager`, §35). `config.env` also exports
  `colonAndDotVariableNameTransformation` and normalizes its prefix through the transform before
  matching (§30/§31); `config.commandline` honors bare `key=value` argv tokens (§34).
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
  snapshot (§37). Full reference parity, no stubs inside hosting itself (§23); the physical file
  provider and the non-console logging sinks it composes stay deferred at their own families
  (§18, §20).
- **`diagnostics`** — `diagnostics.core` (the `IMetricsBuilder`/`ITracingBuilder` abstractions,
  the rule/options data model, `METRICS_*`/`TRACING_*` tokens; ← `di.core` + `options`) ←
  `diagnostics` (concrete `MetricsBuilder`/`TracingBuilder`, config-binding pipeline wired
  through `ConfigurationChangeTokenSource` for reload-reactive `Options<T>`, and the
  `addMetrics`/`addTracing` declaration-merging augmentations onto `di.core`'s
  `ServiceManifestClass`; ← `diagnostics.core` + `config` + `options` + `options.augmentations`
  - `primitives`, `di.core` as peer). The metrics/tracing **listener runtime** (no `Meter`/
    `Instrument`/`Activity`/`ActivitySource` analog) is intentionally not ported — `IMetricsListener`
    collapses to its rule-matching `name`, `ActivityListenerBuilder`'s delegate params collapse to
    `unknown`, and `addMetrics`/`addTracing` register no listener-activation wiring. Console/debug
    listener packages, `ME.Http.Diagnostics`, `ME.Diagnostics.ResourceMonitoring`, and
    `ME.Diagnostics.ExceptionSummarization` are all out of scope (no consumer, YAGNI).
- **`logging`** — `logging.core` (`ILogger`/`ILoggerFactory`/`ILoggerProvider`/`ILoggingBuilder`,
  `LogLevel`, `EventId`, `FormattedLogValues` + the `log*` convenience wrappers; ← `di.core`) ←
  `logging` (`Logger`/`LoggerFactory` composite fan-out, `NullLogger*`, `LoggerFilterOptions`,
  the `addLogging` augmentation onto `di.core`'s `ServiceManifestClass`; ← `logging.core`,
  `di.core` as peer) ← `logging.configuration` (config-tree → `LoggerFilterOptions` binding,
  `addConfiguration`; ← `logging` + `logging.core` + `config` + `config.core` + `di.core` +
  `options`). No concrete sinks (console/debug/event-log/trace-source providers) are ported this
  pass except `logging.console` (the console sink, whose `addConsole` hosting's defaults consume);
  the rest stay deferred pending a provider design (issue #75). `clearProviders` is real (ports
  through di.core's `removeAll`, §38); `setMinimumLevel` and `LoggerFactory.create` are
  hosting-style stubs pending the options-DI-builder and `di` runtime integrations they need.
- **`caching`** — `caching.core` (`IMemoryCache`/`ICacheEntry` abstractions + the
  `CacheExtensions`/`CacheEntryExtensions` convenience functions, owned outright so no
  augmentation is needed; ← `primitives`) ← `caching.memory` (a genuinely working `MemoryCache`:
  absolute/sliding/change-token expiration, size-limited priority-then-LRU compaction, eviction
  callbacks; ← `caching.core` + `logging.core` + `options` + `primitives`, `di.core` as peer via
  the `addMemoryCache` augmentation). Statistics/metrics, linked-entry tracking, and the
  options-pipeline/`ILoggerFactory`-DI wiring for `addMemoryCache` are deferred — no consumer yet.
- **`fileproviders`** — `fileproviders.core` (`IFileProvider`/`IFileInfo`/`IDirectoryContents`,
  `NullFileProvider`; ← `primitives`) ← `fileproviders.composite` (`CompositeFileProvider`
  fan-out over 0/1/N inner providers; ← `fileproviders.core` + `primitives`). A disk-backed
  provider (`ME.FileProviders.Physical`) and `ME.FileSystemGlobbing` (only ever a `Physical`
  dependency upstream) are deliberately deferred — what a physical provider means here is an open
  design question, not yet scoped. `CompositeFileProvider.watch` over 2+ change-emitting
  providers is a stub pending a `CompositeChangeToken` primitive (tracked against issue #77; the
  0- and 1-provider cases are fully functional).

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
  `.core`-authored const's interface-side `declare module` merge lives beside it in `.core`;
  class-side merges stay downstream next to each concrete class (retired per-lib on dist
  conversion, #68). **Merge-identity rule:** every interface-side merge for one interface must
  resolve to the interface's declaring module file (downstream packages use the `internal/*`
  subpath) — mixing barrel and declaring-module specifiers makes TS treat the `this`-returning
  members as unrelated this-types and breaks `implements` (§38).

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
    follow the same pattern — `logging.console` is the console sink for `logging`.

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

## Build layout — source-libs, with a `built` exception

**Src-referencing rule.** Only **d.ts-only** libs (zero runtime emit — in practice the `*.core`
abstraction libs, but the rule keys on the property, not the name) may be _src-referenced_: expose
the `.` export's `source`/`bun`/`types` conditions pointing at `./src/*.ts`. A lib that emits
runtime `.js` must be _dist-referenced_ — its type-facing conditions resolve to the rolled
`./dist/*.d.ts`, so in-repo consumers see the same sealed surface a published consumer does.
Src-referencing a runtime lib is what forces the `built` condition (below): the consumer's
typecheck sees raw pre-augmentation source, which the impl classes can't satisfy once a transformer
augmentation merges in. `config.core` is the model; `di.core` ships runtime (§9) and so does
**not** qualify despite its name. **Not yet enforced — most runtime libs are still src-referenced;
tracked in #68.**

Mechanically: packages consume each other's raw TS `src` via `workspace:*` + `exports` whose
`source`/`bun`/`types` conditions point at `.ts`, under `moduleResolution: bundler`. The
`import`/`default` conditions point at built `dist` — what published consumers resolve.

Two deviations, both because a **transformer** is in play:

- **The `built` condition.** A program that pulls a transformer's `declare module` augmentation
  into scope (via its `tsconfig` `types` array) cannot co-compile di's _source_ — the impl classes
  stop satisfying their interfaces once the authored 0-arg forms are merged in. Such packages set
  `customConditions: ["built"]`, so the di family resolves to its rolled `.d.ts` instead —
  reproducing how a real published consumer sees di. This is why build order matters and why
  `bun run build` is mandatory over a flat parallel build (§1/§9). This per-consumer opt-in is the
  interim hatch the src-referencing rule above will retire (#68).
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
