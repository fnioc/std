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
  `scripts/build-all.ts`, which tiers the workspace by its dependency graph and finishes each tier
  before the next. In-repo resolution is source-first (see
  [Build layout](#build-layout--source-first-exports-192)), so no package's typecheck or lowering
  reads a sibling's dist any more — the tiers survive for determinism: publish artifacts are
  produced against complete upstream dists, and a failure surfaces at the shallowest package that
  owns it.
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
  Since resolution is source-first, a package's program compiles its transitive workspace-dep
  SOURCE, so an upstream type break surfaces in downstream gates at the edit. Each package's
  `tsconfig.json` is the **editor** config instead — a whole-repo program (all `libraries/*/src` in
  one program) so IDE rename / find-refs are complete across packages nothing currently open
  imports; the build and gate never read it (extends `/tsconfig.editor.json`). The root `typecheck`
  script (`tsc -b`) points at an empty solution stub and checks nothing — don't rely on it.
- **Lint** is `tsc --noEmit` for almost every package (29 of 32 libraries; `-p tsconfig.ci.json`).
  Typechecking suffices because the authored tokenless forms type-check against the sugar package's
  `declare module` augmentation — in the program whenever the package's source (or a dep's source
  that carries it) is — with no plugin, since the primitives and the sugar forms have no type-level
  footprint. Only `di`, `di.core` and `hosting.core` run `eslint .`
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

- **`primitives`** — universal leaf: no `@rhombus-std` deps; its only dependencies are the
  `@rhombus-toolkit` type packages (`func`, and `type-helpers`, which supplies `Flatten` and the
  `obj.*` precision types, §189). The **`Type` node space** (namespace `Type`, one
  factory per kind): a type is named by where it is reached from — `Type.imported(name, from,
  typeArgs?)` (`ImportedType`, kind `'imported'`) for a package, `Type.global(name, typeArgs?)`
  (`GlobalType`) for the ambient scope, no `from` member and `NominalType` unioning the two (§148);
  the factory is `imported` because `import` is a reserved word a namespace cannot export, and the
  namespace is what keeps every factory a documented declaration. Node names are spelled out and a
  factory pairs with its node — `func`/`ctor` are short only because `function`/`constructor` are
  unavailable as member names, not because they are callables (§149). A signature carries no
  quantifier list of its own — an open one is spelled by a generic hole sitting inside its
  `args`/`return`/`instance`, closed the same way any other hole is: by tree-position
  unification against the request (§152, §194). **`Type.match` is identity modulo holes** (§194,
  U5): outside a hole the two sides must be the SAME interned node — no assignability, no width
  subtyping, no literal widening, no member or signature search — and a hole binds its fragment, a
  repeated label binding the same type each time; `Type.satisfies` does not exist. **Union and
  intersection members store in one canonical order** (§195): kind rank (holes first, literals
  last) → the kind's scalars → children pairwise; visitors iterate members as stored.
  `ConstructorType` carries a boolean
  `abstract` member — a flag, not a kind — matching TypeScript's own `abstract new (...) =>` spelling;
  an abstract pattern matches only an abstract subject, and `ServiceDescriptor.ctor` throws on an
  abstract implementer (§181). `Iterable`/`Array` are the only
  aggregate kinds — delivery is call-site behavior, so `Type.async` and the dedicated `asyncIterable`
  kind are cancelled (`Promise<T>` and an ordinary global `AsyncIterable<E>` cover them, §151).
  **The wire format is fixed**: token strings never move for a TS-surface change. Also the
  change-token trio (`IChangeToken`,
  `ChangeToken.onChange` — the async-consumer forms real, via a runtime thenable check, §58 — plus
  `CompositeChangeToken` merging N tokens into one, §58) that underpins live-reload (§8), the
  `IServiceProvider` interface every resolution consumer holds, **and** the augmentation infra:
  one named exported NAMESPACE of function declarations per ME static extension class, the single
  source its receiver's members derive from (`interface R extends Flatten<typeof Ns>`, §28) —
  installed either directly via `applyAugmentations` (CLOSED receivers) or through the
  **augmentation registry** (§38) for OPEN receivers — `Token` (native to `primitives`),
  `registerAugmentations(token, set, merge?)` (per-token bag = a
  `Map<string, [fn, merge?][]>` holding a per-name LIST of contributions, each pairing the fn
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
  `primitives.extras` (the sugar-only authoring package) is the single home for the primitive
  vocabulary: BOTH verbs — `typefor<T>()`, which names a type, and `schemaof<T>()`, which expands
  one — plus `registerAugmentations`/`registerInlineBodies` and the derivation machinery. Each is a
  pure transformable, elided after lowering (§121), and the package is di-independent so any family
  can draw on them. The runtime leaf itself owns
  the structural
  platform typings (§39/§44): `AbortSignal`/`AbortController` (+ the inert `neverSignal`
  singleton), `ProcessLike`/`process`, `TimeoutHandle`/`setTimeout`/`clearTimeout`, and
  `ReadableStream<R>` — typed `globalThis` lookups, so libraries never need
  lib.dom/`@types/node`/bun-types to touch the platform. That zero-ambient-types program is
  pinned by `types: []` in `/tsconfig.lib.json`; `node:fs`/`node:path` imports get per-package
  compile-scope `node-builtins.d.ts` files (§44).
- **`di`** — `di.core` (the abstractions: `Manifest<Scopes>` the interface, `DefaultManifest<Scopes>`
  its concrete class — an iterable decorator chain whose own body declares only the public
  descriptor-taking primitives `add`/`remove`/`replace` (§188); every other verb, and `add`'s own
  sugared shapes, arrive through augmentation sets, so a discarded verb result registers NOTHING. A service is named by a `Type` (re-exported from `primitives`, authored via
  `typefor<T>()`). A keyed registration composes the key into the type —
  `Type.tag(base, key)`, never a separate argument or a `base#key` string, and a type wears AT MOST
  ONE tag (`TagType.type` and the `tag` base are `Exclude<Type, TagType>`; a tagged base arriving as
  a value throws rather than re-keying, §150) — and an open template is built structurally,
  `Type.imported(name, from, [Type.generic(label)])`, the generic hole shared between the service
  type and the signature slot. The WHOLE error taxonomy ships here:
  `DiError` an abstract root, `UnsatisfiableError`/`CycleError`/
  `ManifestValidationError` extending it so one `instanceof` classifies any container failure —
  `ManifestValidationError` carries its own readonly `errors` array positionally matching
  `failures` — it ships runtime) ← `di` (the resolution engine: `ServiceProvider` seals a manifest
  through the manifest's `build()` verb; `getRequiredService(type)` throws when nothing is
  registered, `getService(type)` returns `undefined`, `getServices(type)` yields the collection; it
  re-exports the taxonomy, so both imports name the same class and `instanceof` holds either way —
  di.core stays external in di's bundle so the `Manifest` cross-package augmentations install onto
  is the same object everywhere. **Resolution is one exact-answer loop** (§196): every request
  kind first takes the registrations answering its own address, newest first, first answer that
  builds — an unbuildable answer falls through — and only then synthesizes per kind. A union with
  no answer of its own settles by its FIRST RESOLVABLE MEMBER in canonical order — each member
  tried registration-then-synthesis in one pass — so there is no ambiguity error and no literal
  special-case: literals order last, keeping a literal member the fallback of an optional
  dependency. Collections are
  union-agnostic: an aggregate assembles the element's own answers in registration order plus one
  synthesis tail, never a member spread. `ServiceDescriptor.value` refuses an open service type
  unless the hole sits under a callable root — ctor/func, tag stripped — since one erased callable
  honestly is every closing and one instance is not, §197). Several provider members are declared and throw
  `NotImplementedError`, so a caller compiles and fails at the point of use, gated on the
  still-undecided lifetime and disposal model: `tryResolve`/`resolveAsync`/`dispose`/`disposeAsync`
  on `IServiceProvider`, plus `createAsyncScope` on both `IServiceProvider` and
  `IServiceScopeFactory` — `createScope(name?)` itself is real and takes an optional name,
  `IServiceScope` declares `getRequiredService`/`isService`, and
  `ServiceProviderOptions.validateScopes` is declared and read by nothing. The registration chain
  opens at `manifest.describe(serviceType)`: the doors `asClass(ctor, ctorType)`/
  `asFactory(fn, fnType)` take the implementer together with its own type, `asValue(value)` takes
  only the value, and once a door is taken the node IS a `ServiceDescriptor` — refined by
  `withLifetime`/`taggedAs`, handed to the descriptor-taking verbs, held in a variable, or built in
  a helper. The flat verbs share one uniform shape,
  `add/tryAdd/replace(serviceType, implementer, implementerType, scope?)`, the value door passing
  the bare `ConstantType` marker (a di.core value, not a `Type` node kind — a callable registered
  AS a value is indistinguishable from a factory by its own type, so the call site carries the
  choice) and kind selection a total switch over
  `ConstructorType | FunctionType | ConstantType`. A keyed registration is a TAGGED ADDRESS —
  there is no key argument anywhere. A
  builder that wraps a manifest holds it in a local structural `ManifestSlot`, and an all-in-one
  verb returns the manifest itself rather than a fluent tail. `NotImplementedError` lives in
  `primitives` and extends `Error` directly, since not-implemented is not a container concept.
  `di.extras` (the Go/ttsc authoring surface, depending on **`di.core` types only, never the `di`
  runtime** — hard invariant) carries `rhombus-std` marker `inline` entries for the flat verbs and
  value doors (`add`/`addValue`, `tryAdd`/`tryAddValue`, `replace`/`replaceValue`, `removeAll`,
  `describe`) plus the three `get*` provider
  members (`getService`/`getRequiredService`/`getServices`) — eleven entries total, each entry's
  `impl` resolved by walking `src/index.ts`'s re-export graph. Each sugar derives BOTH the service
  type and the observed implementer type (`add<ServiceType>(implementer, scope?)` lowers to
  `add(typefor<ServiceType>(), implementer, typefor(implementer), scope)`; a cast at the call site
  steers the observed SHAPE, never the kind), and the emitted call binds a different overload than
  the face, which is what terminates the lowering loop.
  `di.extras.options` is a satellite lowering the `addOptions<T>()` sugar.
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
  `config.extras` both TYPES `.withType<T>()` onto `ConfigBuilder` and rewrites it via the
  `schemaof<T>()` expansion primitive: depending on the package is what puts the member in scope
  AND spawns the transform, so without it `withType` is a compile error rather than a runtime
  stub. di-independent (§15).
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
  the rule/options data model, `clearMetricsListeners`/
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
  and leaves the receiver alone, so a discarded result registers NOTHING. A verb's long overload
  takes the implementer's whole `Type` node as a required arg 3 — `implementerType`, a
  `ConstructorType`/`FunctionType` carrying one parameter SIGNATURE per overload (the bare `ConstantType`
  marker for a value); an intersection means an
  intersection — and the descriptor stores that node beside the `implementer` itself, so signatures are
  read through `implementerType.args` and live in one place. `scope` is arg 4; a keyed registration
  spells its key inside the address (`Type.tag`), never as an argument. A builder
  that wraps a manifest
  (`ILoggingBuilder`, `IMetricsBuilder`, `IHostApplicationBuilder`) exposes it as a WRITABLE slot
  (a local structural `ManifestSlot`) and siblings over one manifest share ONE holder;
  `IHostBuilder.configureServices` takes a RETURNING delegate (§114).
- **A bare-hole slot delivers the closing TYPE** — in an open registration, a signature slot that
  IS the generic hole receives the bound closing `Type` node, never an instance and never a
  registration lookup (`ILogger<$1>` → `Logger`'s category; `ILoggerProviderConfig<$1>` → its
  section). A hole nested INSIDE a larger slot closes into that expression and resolves as an
  ordinary service, so one signature carries both readings. An instance of the bare closing type
  is inexpressible by design — take `IServiceProvider` beside the delivered type and look it up.
  No `Type` kind carries the distinction: the slot's shape is read BEFORE substitution, which is
  why the registry hands the lowering the registration plus its captured bindings rather than an
  already-substituted descriptor (§157).
- **A plan belongs to its manifest** — plans cache against the manifest; a resolution carrying
  additional descriptors (a latebound call's arguments) resolves an ephemeral COMPOSED manifest
  that neither reads nor writes the shared cache, and whose additionals outrank the manifest's own
  registrations. Union choice is decided per-manifest against that call's full descriptor universe,
  and a chosen member's RUNTIME failure fails the resolution — never a fallthrough (§158).
- **Runtime identity is load-bearing** — and guarded at runtime: primitives and di.core each stamp
  a `globalThis[Symbol.for('<pkg>/instance')]` sentinel at load, and a second, different copy of
  either throws immediately naming both module URLs (§199). `di` keeps `di.core` _external_ in its bundle so the
  `Manifest` cross-package augmentations install onto is the same object everywhere;
  a private inlined copy forks identity and breaks the install (§9). config keeps providers
  external for the same reason. **Every bundling package keeps `@rhombus-std/primitives`
  external** — an inlined copy forks the augmentation registry's Map + subscriber list (§38). The same
  holds for the rolled `.d.ts`: a package that inlines di.core's types forks
  `Manifest`, so every di.core dependent keeps it external in `rollup.dts.mjs` (§114).
- **Augmentations** — file `<Receiver>-<Topic>-augmentations.ts` (receiver's leading `I` dropped); a
  namespace of exported function declarations is the one place a member's shape is written, merged
  onto the receiver via `interface R extends Flatten<typeof TheNamespace> {}` in a `declare module`
  targeting the receiver's package specifier. `registerAugmentations<Receiver>(Ns, merge?)` installs
  it via the token registry + `@augment` decorator for OPEN receivers (the common case);
  `applyAugmentations(ClassCtor, Ns)` installs directly for a CLOSED receiver. `AugmentationSet2` and
  hand-authored member-map types don't exist — a colliding member (another contributor, or the
  receiver's own primitive) duplicates its signature in the `declare module` block, or,
  where the shapes can't unify into overloads, stays out of it and is reached only at runtime
  (a merge strategy) or standalone. The namespace is IMPLEMENTATION, written against the receiver at
  its widest (`this: Manifest<string>`, plain `string` scopes); the block is the caller-facing FACE
  and is RECEIVER-SPELLED — the interface's own generics in parameter positions, `Manifest<Scopes>`
  returns, never `this` and no this-param, and the `extends Flatten<…>` clause drops once every
  member is declared there (§188). A per-function `Self extends Receiver` generic survives only where
  one namespace serves two non-assignable receivers. A namespace function never ends its
  implementation in a bare rest parameter. Authored first-party-only. Full mechanics, authoring steps, and gotchas:
  `docs/features/augmentations.md`.

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
    `di.extras.options`, `config.extras`. `primitives.extras` homes the primitive vocabulary
    every other `.extras` package's sugar bodies are written against.
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
- Stale build-layout narration. In-repo resolution is source-first (dist is publish-only) —
  **verify against the package's `exports` before citing resolution behavior**, and never claim an
  in-repo consumer resolves a sibling's dist.

**Write** only what helps a caller use a public member, or is genuinely hard to grok on a quick
read. When torn, delete. Form is real TSDoc — `@remarks` for prose, `@param`/`@returns` OMITTED when
the signature already says it, `@typeParam`, `@example`; don't hand-write what the types generate; a
good error message replaces a comment; a trivially-simple function gets none. File-level headers are
not automatically wrong — keep a trimmed orienting one, cut it when it merely restates the type's
own docs below it.

`libraries/primitives/src/augmentation/registry.ts` is the canonical swept file — match it. Never
delete a comment when doing so loses the answer to "why does this exist at all"; rewrite it instead.

## Build layout — source-first exports (§192)

**In-repo resolution is source-first; dist is the published surface only.** Every library's dev
`exports` resolve `./src/index.ts` for every consumer and every condition (`.` is a bare-string
target), as do root `main`/`types`; `publishConfig` carries the `./dist/bundle/*` surface a
published consumer gets (pnpm rewrites `exports` from it at publish time). So the editor, the
per-package CI/typecheck program, `bun test`, and `bun run` all read the same source the author
edits, with nothing depending on `dist` being built — and one module instance per file means type
AND value identity hold by construction (one `Manifest`, one augmentation registry). There are NO
custom conditions anywhere: a package's own `declare module` against its own public specifier
resolves to the very source being compiled, so the self-typecheck needs no special casing.

**The one dev-only seam is `./tokens/*`** (`types`/`bun` → `./src/*.ts`, deliberately no `default`
so it stays non-public for token derivation, §97): the white-box surface test suites deep-import
internals through, scrubbed from `publishConfig.exports`. The bundled publish artifacts live under
`dist/bundle/` — a role-named sibling of the `dist/stage/` lowering emit — so `dist` holds one
directory per build role; nothing in-repo resolves either.

**In-repo execution lowers at load time.** A lowering library calls `typefor<T>()` at module top
level, which throws un-lowered — so `scripts/ttsc-preload.ts` registers ONE dispatching bun plugin
that lowers each loaded file through its owning package's own `tsconfig.ttsc.json` project (lazy,
memoized per package), serving the hoisted `__typefor__` const module as a virtual module from a
per-process emit dir. Generated per-package `bunfig.toml`s (`scripts/derive-preload-bunfig.ts
--write`, drift-checked like the publish config) wire it into `bun run` and `bun test` — bun's
config discovery is cwd-only, so the root bunfig cannot serve per-package runs. Running any suite
that touches a lowering library therefore needs the Go toolchain (mise), warm-cached after the
first sidecar compile. The example apps run their built output under `bun`, whose resolution +
preload serve the source-resolved workspace deps; a plain-node published-consumer proof belongs to
a packed-artifact gate (not built yet).

The publish build is unchanged by all of this — a **transformer** is in play, a single **Go/`ttsc`**
engine (the ts-patch/TS5 track was removed; restore tag `pre-tspatch-removal`):

- **Lint/typecheck is plain `tsc`** — no plugin (see the Lint bullet under [Commands](#commands) for
  how the `declare module` augmentation reaches the program). `rollup` + `rollup-plugin-dts` live at
  the repo root.
- **The lowering stage (§40, stage-then-bundle).** Any library whose src calls `typefor<T>()` (etc.)
  ships it LOWERED: the shared `stageLowering` runs a per-file `Bun.build` with the
  `@ttsc/unplugin/bun` adapter active — every `src/**/*.ts` its own entrypoint, all imports external
  — so each file is lowered into `.ttsc-out/`; the main bundle then consumes that emit with no
  plugin (lowering commutes with bundling). **Every ttsc consumer stages, including the two
  `examples/*.with-transformer`**, whose `tsconfig.ttsc.json` names the same `rootDir: ./src` /
  `outDir: .ttsc-out` pair the libraries do. The per-file emit is KEPT as `dist/stage/` (an
  inspectable record of what the bundle consumed; publish-excluded via `"!dist/stage"` in `files`).
- **The generated `Type` const module (§148).** `typefor<T>()` emits a reference to a named const,
  not the `Type.*` tree it derives; the engine writes one `__typefor__.js` per project into the
  program's `outDir` (so, the stage dir) holding one const per distinct derived type, composites
  referencing their members by name. `"rhombus-std": { "typefor": { "emit": "hoisted" | "inline" } }`
  picks the form — **`hoisted` is the default**, and it rides the PROJECT because the shared
  `./ttsc` descriptor is the one-spawn/one-cache-key dedup point. It is read through
  `inlinetransform.ResolveConfig`, the one entry point every rhombus-std config reader shares, so
  the emission may be declared in the package.json marker or in any file that marker `extends`.

Published `dist` is **bundled** (`bun build` for JS, `rollup-plugin-dts` for one rolled `.d.ts`),
never raw `tsc` output — extensionless bundler-style imports don't resolve under plain Node ESM
(`scripts/build-package.ts`).

**Build args are derived, not authored (§43).** There are no per-package `build.ts` files: every
library's `build` script runs `scripts/build-lib.ts`, which derives the `buildPackage` args from
the manifest — `external` = deps ∪ peers (the §9/§38 identity invariant as a rule; devDeps
inline), entrypoints/dts configs from the `exports` map, and the lowering stage runs iff a
`tsconfig.ttsc.json` exists. The optional `rhombusBuild` manifest field carries per-package
deviations (`typesOnly`/`inline`/`forbidImports`), each documented by a `//rhombusBuild` neighbor —
none today. Library tsconfigs extend the shared root fragment `tsconfig.lib.json` (typecheck
profile); the lowering-stage config is the leaf `tsconfig.ttsc.json`. `publishConfig` is derived
too (`scripts/derive-publish-config.ts`, drift-checked by `bun run lint`).

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

**The primitive roster is two verbs over one vocabulary (§137)**: `typefor<T>()` NAMES a type (a
named type yields its interned `NominalType` address) and, given a runtime class or factory value in
place of a type argument, OBSERVES it instead — deriving the whole callable `Type` its construct or
call signatures describe; `schemaof<T>()` EXPANDS one into the `Type` tree describing its members —
stopping at every name, so recursion terminates by construction. Both live in `primitives.extras`;
the `tokenfor`/`tokenof` string-token pair is retired. There is no second structural vocabulary: the
bespoke config schema grammar (`Schema`/`Infer`/`OPTIONAL`) and the `signaturefor`/`signaturesfor`/
`keyof` primitives are all retired.

- **Descriptor wiring — one always-on stage table, NO selection (§119).** Every `*.extras` package's
  `./ttsc` descriptor resolves to the SAME `cmd/ttsc-std` source dir under the SAME name, so `ttsc`
  dedupes every consumer to one cache key and one spawn. There is no stage selection: once spawned,
  the host runs its WHOLE stage table on every file in a fixed canonical order
  (mergesynth → inline → typefor → schemaof) looped to a fixed point — mergesynth rides the loop,
  since the inline stage is what mints the receiver-taking install calls it rewrites; a stage that matches nothing is a cheap no-op
  (disjoint match sets). The bespoke di /
  di-options / config domain stages, the `ttsc.stages` markers, `selectStages`/`BaseBundles`, and
  di.core's preset `./ttsc` descriptor are all GONE — the authoring forms (`add`/`addOptions`/
  `withType`/resolve-family) lower as `rhombus-std` marker `inline` sugar bodies the inline stage substitutes and
  the primitives lower. What a dependency governs is **spawning + which bodies are in play**: ttsc's
  direct-only auto-discovery spawns the one host from a consumer's direct `*.extras` dep (its
  `ttsc.plugin` marker), and the host's single `CollectProject` scan gathers the inline BODIES from
  the transitive graph (§100). `build-lib.ts` passes no explicit plugin list; an explicit
  `tsconfig.ttsc.json` `plugins` array is the only override. The one binary links typia to run
  `mergesynth` (§103) inside the loop.
- **`*.extras` package shapes** — every one carries a barrel re-exporting its marker bodies BY
  NAME, since an inline entry's `impl` is resolved by walking the barrel's re-export graph: a set
  only side-effect-imported is never found. `config.extras` pairs that barrel with its `./ttsc`
  descriptor. `primitives.extras` carries a barrel (both primitives, `typefor` and `schemaof`) plus
  its `./ttsc` descriptor. `di.extras` keeps a barrel shipping the `declare module` authoring
  augmentations; its eleven `rhombus-std` `inline` marker bodies live directly in those
  augmentation files (no separate `inline.ts`).
  `di.extras.options` and `config.extras` follow the same shape at one file each —
  `augmentations/Manifest-options-augmentations.ts` and
  `augmentations/ConfigBuilder-schema-augmentations.ts`, each holding its `declare module` beside
  its marker body. Keeping bodies under `augmentations/` is also what puts them inside the eslint
  `inline-authoring` glob.
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

- **White-box** (needs to reach into a library's internals): via the library's `./tokens/*` seam —
  a deep import of the source file, typed and runnable (the preload lowers it at load time). The
  barrel and a `./tokens/*` deep import resolve the same source files, so both land on ONE module
  instance per file — mixing them cannot fork the package's augmentation installs.
- **Black-box** (exercises only the public surface): via a plain `workspace:*`
  devDependency on the library.

See `docs/decisions.md` §7 for the rationale and the publish-time scrub mechanics.
