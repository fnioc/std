# Unused-code scan — triaged report

Generated from `bun run knip` against `chore-knip-unused-scan` (base `22f42eb`, PR #275 — the
di.core/di correctness and vestigial audit — landed), with knip `6.29.0` pinned in `mise.toml` and
the semantics configured in `knip.jsonc`.

This is a **worklist, not a gate**. Nothing here is auto-fixable and `--fix` must never be run
against this repo: every entry is a binary owner decision — **delete the symbol, or demonstrate
it in an example**.

> **Scope note.** Active work is scoped to the **di family**. Findings from every other family are
> recorded here as the standing worklist and are **not actionable now**. Sections are ordered so the
> di material is reachable directly ([di and di.core](#di-and-dicore--the-active-scope)).

## How to reproduce

```sh
bun run knip                 # the committed report-only run
bun run knip -- --reporter json > /tmp/knip.json    # machine-readable
```

`knip` comes from mise (`mise.toml` pins `npm:knip = "6.29.0"`), so the same shell that has Go
and bun on `PATH` has it. **Triage from the JSON**, not the text output: the per-name flag _sites_
are what separate a definition from a barrel re-export, and that distinction decides the bucket
(see [Reading a flag site](#reading-a-flag-site)).

**The run is deterministic with respect to build state, and this was checked rather than assumed.**
knip resolves modules with oxc-resolver under a fixed `require/import/node/default` condition set,
so a bare `@rhombus-std/x` would otherwise land on the package's `import` condition
(`./dist/bundle/index.js`) and the scan would see no references into any library's source at all.
`tsconfig.knip.json` maps the scope back to `src`, and tsconfig `paths` outrank node_modules
`exports` in that resolver. The JSON report from a never-built worktree and the JSON report from the
same worktree after a green `bun run build` are **byte-identical**.

## The semantics the config encodes

| Rule                                                                     | Mechanism                                                                             | Verified by                                                                                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Examples are the entry points; reachability runs from `examples/` inward | `libraries/*` declare no source entry; only `examples/*` seed the graph from `src/**` | `Host`, `ConfigBuilder`, `logInformation` (used by the app) are silent; `HostBuilder`, `NullLogger` are flagged                                                                |
| Tests are not references                                                 | `ignoreWorkspaces: ["tests/*"]` drops them from the graph, not just from the report   | `MemoryCache` is imported by six files under `tests/caching.memory.test` and is still flagged                                                                                  |
| Report only                                                              | `--no-exit-code`, no `--fix` in any script                                            | —                                                                                                                                                                              |
| Barrels need no special rule                                             | knip treats `export { X } from './x'` as an _export_, never as a _use_                | `CacheExtensions` is reported twice in one pass: at `caching.core/src/CacheExtensions.ts:45` (the definition) **and** at `caching.core/src/index.ts:33` (the barrel re-export) |

That last row is the fixed-point question, and the answer is better than expected: **no second pass
is needed.** knip does not credit a re-export as a consumer, so a symbol whose only reference is
its own barrel line is reported at both sites in a single run. See
[Limits](#limits-of-the-detector) for the one place the fixed point genuinely does _not_ close.

### Reading a flag site

Because a re-export is never a use, the **set of sites a name is flagged at** is itself the signal,
and it partitions the whole report three ways. Every count below is measured from the JSON.

| Flag sites                                             | What it means                                                                               | Count   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------- |
| **Definition _and_ barrel**                            | Nothing references the name anywhere — not in-package, not through the public surface       | **111** |
| **Definition only** (the name is in no barrel)         | The symbol is used inside its own file; the `export` keyword is what is dead                | **17**  |
| **Barrel only** (the definition site is _not_ flagged) | The definition **is** referenced in-package; the _public re-export_ is what has no consumer | **209** |

The heuristic is "flagged at a file not named `index.ts`" = definition site. Two verdicts in this
report turn on it, and both were wrong under the previous pass's coarser reading:
`RESOLVER_TOKEN_STRING` (barrel-only — delete the lines, keep the constant) and the whole of
`di`'s surface, which is 71-of-72 barrel-only and therefore a policy question rather than dead code.

## Headline numbers

| Bucket                                                             | Name entries                                                                                   | Confidence                                                                                                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **(a) Genuinely dead** — internal machinery, nothing should use it | **27**                                                                                         | **High for all 27.** The di provisionality that qualified this bucket last pass is discharged — see [di and di.core](#di-and-dicore--the-active-scope) |
| **(b) Kitchen-sink gap** — real public API no example exercises    | **310**                                                                                        | High that they are unexercised; the _decision_ (demonstrate vs. delete) is the owner's. **41 of them are pending PR #277**                             |
| **(c) False positive** — structurally invisible reference          | **2 files + 1 dependency row** left visible on purpose, plus 82 findings the config suppresses | High                                                                                                                                                   |

Raw tool output before triage: **312 unused exports, 148 unused types, 1 unused enum member —
461 findings over 337 name entries**; 2 unused files, 4 unused dependencies, 1 unused devDependency.

A **name entry** is a (package, name) pair; a name flagged at both its definition and its barrel is
one entry, and a name flagged in two different packages is two. Globally distinct names: 312.

### What moved, versus the previous pass

The previous report was generated at `3ee30fc`. That run was **re-executed at that commit with that
commit's `knip.jsonc`** rather than trusted, so this comparison is measured on both sides:

|                                       | `3ee30fc` (previous) | now   | delta   |
| ------------------------------------- | -------------------- | ----- | ------- |
| Findings                              | 505                  | 461   | **−44** |
| Name entries                          | 363                  | 337   | **−26** |
| Unused files                          | 3                    | 2     | −1      |
| Unused dependencies / devDependencies | 4 / 1                | 4 / 1 | —       |

**Every package outside the di family is byte-identical between the two runs.** The entire delta is
four packages:

| Package             | Then | Now | Cause                                          |
| ------------------- | ---- | --- | ---------------------------------------------- |
| `di.core`           | 51   | 34  | −17, code removed by #275                      |
| `di`                | 63   | 61  | −2 net (−4 removed, +2 arrived)                |
| `di.extras`         | 14   | 8   | −6, newly suppressed (`rhombus.inline` bodies) |
| `di.extras.options` | 1    | 0   | −1, newly suppressed                           |

25 name entries left the report and 2 arrived. Of the 25, **18 are code that no longer exists** —
`$1`…`$9` (the hole aliases, replaced by the generic `$<N>`), `ActivatorUtilities`, `ObjectFactory`,
`ActivationError`, `TokenManifest`, `TokenProvider`, `Descriptor`, `SealedTokenManifest`,
`IResolveScope`, `Specificity` — and **7 are the `rhombus.inline` sugar bodies**, now suppressed by
a documented ignore rather than removed (see [c.1](#c1--suppressed-by-knipjsonc)).

The 2 arrivals are `ProviderDisposedError` and `unkeyedToken`, both flagged at `di/src/index.ts`
re-export lines — the same barrel-only shape as the rest of di.

Three whole sub-blocks of the previous report's bucket (a) are **closed by deletion on `main`**: the
`TokenManifest` / `TokenProvider` / `Descriptor` / `SealedTokenManifest` group, and the
`ActivatorUtilities` / `ObjectFactory` / `ActivationError` group. Do not go looking for them.

---

## (a) Genuinely dead — recommend removal

**27 entries.** Two distinct failure modes, which want different edits. A flag site is not
automatically the symbol's home: check whether the flagged line DEFINES the name or merely
re-exports it, and whether the file carries import side effects, before deciding what to cut.

### a.1 — Referenced nowhere at all: delete the symbol

**The 13 `*_NAME` transformer-identifier constants.** Each is a string constant documenting the
identifier the Go lowering engine recognises, e.g.

```ts
/** The exported identifier name the transformer recognizes as `tokenfor`. */
export const TOKENFOR_NAME = 'tokenfor';
```

The engine that "recognises" it is Go, and it hard-codes the literal `"tokenfor"` in its own
source — it cannot import a TypeScript constant. There are **zero** references from library code,
from examples, from tests, and from `transforms/`. They are a contract that documents itself and
enforces nothing.

| Package             | Constants                                                                                                                                     | Flag sites                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `primitives.extras` | `TOKENFOR_NAME`, `TOKENOF_NAME`, `IS_FACTORY_NAME`, `IS_SINGULAR_NAME`, `PARAM_TOKENSFOR_NAME`, `RETURN_TOKENFOR_NAME`, `SINGULAR_VALUE_NAME` | definition **and** barrel           |
| `di.extras`         | `SIGNATUREOF_NAME`, `KEYOF_NAME`, `VALUEOF_NAME`, `KEYEDTOKENFOR_NAME`                                                                        | definition only — not in the barrel |
| `di.core`           | `SIGNATUREFOR_NAME`, `SIGNATURESFOR_NAME`                                                                                                     | definition **and** barrel           |

The `di.extras` four are cheaper to remove than the other nine: they were never in that package's
public surface, so deleting them cannot change what a consumer resolves.

**`RESOLVER_TOKEN_STRING` — re-export lines only.** The symbol is ALIVE (defined in
`di.core/src/token/constants.ts:8`, imported directly by `token/stringify.ts`). What is dead is the
pair of re-export lines carrying it outward, `token/node.ts:47` and `token/index.ts:9`; the
definition site is **not** flagged. Delete the two lines, keep the constant.

This is now the _only_ survivor of the previous report's `di.core/src/token/` block — the
`TokenManifest` machinery it sat beside was removed outright by #275.

**Individually dead symbols.**

| Symbol                           | File                                                    | Note                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currentCacheEntry`              | `caching.memory/src/CacheEntry.ts:71`                   | No caller anywhere                                                                                                                                                                                                                                    |
| `getParentPath`                  | `config.core/src/config-path.ts:39`                     | No caller anywhere                                                                                                                                                                                                                                    |
| `toDistributedCacheEntryOptions` | `caching.core/src/hybrid/HybridCacheEntryOptions.ts:67` | Deliberately kept out of the barrel per its own comment; dead because the `Hybrid/` subsystem is abstractions-only with no implementation yet. Keeping it is defensible — but then it is a permanent flag, so it wants a decision rather than a shrug |
| `HOSTED_SERVICE_TOKEN`           | `hosting/src/internal/Host.ts:32`                       | A re-export of `hosting.core`'s token, added "so a white-box consumer can reach it". The only white-box consumers are tests, which do not count — so the line exists purely for tests and is correctly flagged. Removing it will break a test import  |
| `Ignore`                         | `hosting/src/BackgroundServiceErrorBehavior.ts:22`      | Enum member never referenced. Sibling `StopHost` is. Reference parity may justify keeping it                                                                                                                                                          |

### a.2 — Live symbol, dead `export` keyword: drop the `export`

These are the **definition-only** class: each is used exactly once, inside its own file, and appears
in no barrel. The symbol stays; the export goes. Every in-file use below was re-verified against
current source rather than carried over.

| Symbol                                                  | File                                                 | Its one in-file use                                                                                                                                                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `select`, `SelectedRule`                                | `logging/src/LoggerRuleSelector.ts`                  | `select` is reached through `export const LoggerRuleSelector = { select }` on line 116 — the object is the consumed surface, the standalone export is a second door onto it. `SelectedRule` annotates `select`'s return type on line 38 |
| `HOST_LOGGER_CATEGORY`, `APPLICATION_LIFETIME_CATEGORY` | `hosting/src/host-composition.ts`                    | `loggerFactory.createLogger(...)` calls on lines 232 and 156                                                                                                                                                                            |
| `parseLogLevel`                                         | `logging.config/src/LoggerFilterConfigureOptions.ts` | Line 66                                                                                                                                                                                                                                 |
| `droppedMessagesWarning`                                | `logging.console/src/ConsoleLoggerProcessor.ts`      | Line 125                                                                                                                                                                                                                                |
| `BrowserHostingEnvironment`                             | `hosting.browser/src/browser-environment.ts`         | `new BrowserHostingEnvironment()` on line 50. Note this is an interface + class declaration merge, so both halves carry `export`                                                                                                        |
| `ttscEnv`                                               | `scripts/build-package.ts`                           | Line 135                                                                                                                                                                                                                                |

### a.3 — Dead dependency declarations

| Package             | Declared                                 | Finding                                                                                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `di.extras`         | `@rhombus-std/primitives`                | Source imports `@rhombus-std/primitives.extras`, never the runtime leaf. Stale since the `tokenfor`/`tokenof` move out of `primitives`                                                                                                                                                                              |
| `di.extras.options` | `@rhombus-std/primitives`                | Same                                                                                                                                                                                                                                                                                                                |
| `config.extras`     | `@rhombus-std/primitives.extras`         | `config.extras/src` imports only `./schemaof.js`                                                                                                                                                                                                                                                                    |
| `hosting`           | `@rhombus-std/options.augmentations`     | **Owner call.** No hosting source references it — but `CLAUDE.md`'s architecture digest asserts the `hosting ← options.augmentations` edge. Either the edge is real and something in hosting should be importing it for the prototype patch to land, or the digest is stale. Do not delete on the scan's word alone |
| `di.extras.options` | `@rhombus-std/di.extras` (devDependency) | Mirrors a declared `peerDependency` so the peer resolves in-repo. Arguably (c); left visible because "a peer you never reference" is worth a look                                                                                                                                                                   |

These five are unchanged from the previous pass. Dependency rows are counted separately from the 27.

---

## di and di.core — the active scope

**95 of the 337 entries** are in `di` (61) + `di.core` (34). The previous report marked all of them
**provisional** pending PR #275. **That caveat is discharged: #275 has landed and this report is
generated on top of it.** What replaces it is narrower, and measured rather than assumed.

### Still provisional — and exactly how much

**PR #277 ("make the examples a di kitchen sink") has NOT merged** as of this run (state `OPEN`,
`BLOCKED`). Because knip seeds reachability from `examples/`, that branch moves di findings directly.
Rather than guess at the size, its head was merged onto this branch on a scratch worktree and the
scan re-run:

|                      | now | with #277 merged | delta |
| -------------------- | --- | ---------------- | ----- |
| `di.core` entries    | 34  | **1**            | −33   |
| `di` entries         | 61  | **41**           | −20   |
| di family total      | 95  | **42**           | −53   |
| whole-report entries | 337 | 338              | +1    |

So: **the 53 di-family entries #277 clears are provisional and should not be acted on.** The
remaining **42 are not provisional** — they survive the kitchen sink.

Two things that measurement settles, both of which would have been guessed wrong:

1. **#277 nearly empties `di.core` (34 → 1; only `RESOLVER_TOKEN_STRING` survives, and that one is
   [a.1](#a1--referenced-nowhere-at-all-delete-the-symbol), not a coverage gap).** `di.core` needs no
   separate worklist after it lands.
2. **#277 barely dents `di`'s barrel (61 → 41).** The examples import from `@rhombus-std/di` at 32
   sites and `@rhombus-std/di.core` at 21, but a name exercised through `di.core` leaves `di`'s
   re-export line flagged regardless, because a re-export is never a use. **No amount of example
   coverage closes this**; only a policy decision does.

It also costs something: #277 adds ~50 new findings inside `examples.lib.with-transformer` /
`examples.lib.without-transformer` — demo modules that export helpers nothing imports. Net across
the whole report, it is a wash (337 → 338). Worth knowing before treating "close the gap with
examples" as a strictly-reducing move; a narrower barrel on the demo libraries would avoid it.

### The dual-export question — the single largest lever

**71 of `di`'s 72 findings sit on `di/src/index.ts` or `di/src/types.ts`.** Exactly one is a
definition in di's own source (`ServiceManifestContainerBuilderAugmentations`, at
`di/src/ServiceManifest.ts:48`). Those two files re-export `di.core`'s surface wholesale, by design —
"so the whole surface stays reachable through one `@rhombus-std/di` import".

Split by whether the underlying symbol is also flagged in `di.core`:

- **44 of the 61** are flagged in `di` _only_ — the symbol is live in `di.core`, and it is purely the
  di re-export line that has no consumer.
- **17** are flagged in both, so nothing reaches them by either route.

The clearest instance is the error taxonomy §130 moved into `di.core`. Fourteen error classes are
flagged at `di/src/index.ts:82-85`; only `DiError` and `OpenTokenRegistrationError` are also flagged
in `di.core`. The other **12 are live** — thrown and referenced inside `di.core` — with only their
di-side re-export dead. Deleting them from `di`'s barrel is a published-surface change, not dead-code
removal, and §130's own rule ("a library references the abstractions package; only an entry point
references the engine") is an argument that the re-export is doing its job precisely by being
unreferenced in-repo.

**This is a policy question the scan cannot answer, and it is worth 41 entries after #277 lands.**
Answer it before touching anything else in di.

### The rest of di.core (post-#275)

The 33 entries #277 clears break down as the surfaces the examples were missing: the brand types
(`$`, `Hole`, `Inject`, `Keyed`, `Typeof`), the authoring builder interfaces (`IAsBuilder`,
`IWithKeyBuilder`, `IWithSignatureBuilder`, `IWithSignaturesBuilder`), and the token AST
(`ConcreteNode`, `FactoryNode`, `HoleNode`, `LiteralNode`, `ProviderNode`, `UnionNode`,
`TokenWalker`, `TokenRewriter`, `Substituter`, `Validator`, `parseSlot`, `serialiseSlot`,
`parseToken`). The previous report called the AST's public-ness "a boundary question"; #277 answers
it by demonstrating the whole thing, which settles the question in favour of keeping it public.

---

## (b) Kitchen-sink gap — the worklist

**310 name entries of public API that no example demonstrates.** This is the bucket the scan exists
to produce. **Only the di material above is in scope right now**; everything in this section is the
standing worklist for later.

The shape is stark: the example apps exercise `config` (memory source + reload), `di`, `options`
(full configure → post-configure → validate pipeline), `hosting` (`Host` + a hosted lifecycle
service) and `logging` (factory + `logInformation`) — and _nothing else_. Counting from the example
manifests: **10 of the 32 libraries are depended on by an example at all; 22 are not.** The whole of
`caching`, `diagnostics` and `fileproviders`, every config provider, and both browser-target
packages are untouched. (`config.core`, `fileproviders.core`, `hosting.core` and `primitives` are on
that list too, but are reached transitively through the ten that are — their surfaces are partly
covered.)

The two apps mirror each other (`examples.app.with-transformer` in the tokenless dialect,
`examples.app.without-transformer` with explicit tokens), and both diff their stdout against a
checked-in `expected.txt`. Any addition below lands in **both** apps and updates both `expected.txt`
files, unless noted.

### b.1 — Config providers: `config.json`, `config.env`, `config.commandline`, `config.ini`, `config.xml`, `config.file` (28 entries)

Currently the apps build configuration from an in-memory collection only. Every file/env/argv
provider in the repo is undemonstrated, including the whole `config.file` base and both stream
providers per format.

> **Where:** both `examples.app.*`. Add a small `appsettings.json` (+ `appsettings.ini`,
> `appsettings.xml`) fixture beside the app and layer the sources the way a real composition root
> would.

```ts
const config = new ConfigBuilder().setBasePath(import.meta.dir) // config.file
  .addJsonFile('appsettings.json', { optional: true, reloadOnChange: false })
  .addIniFile('appsettings.ini', { optional: true }).addXmlFile(
    'appsettings.xml',
    { optional: true },
  ).addEnvironmentVariables({ prefix: 'RHOMBUS_' }) // config.env
  .addCommandLine(process.argv.slice(2)) // config.commandline
  .build();
```

- **`config.json`** (5) — `JsonConfigAugmentations`, `JsonConfigProvider`, `JsonConfigSourceOptions`, `JsonStreamConfigProvider`, `JsonStreamConfigSource`
- **`config.env`** (5) — `EnvironmentVariablesConfigProvider`, `EnvironmentVariablesConfigSourceOptions`, `EnvironmentVariablesExtensions`, `colonAndDotVariableNameTransformation`, `defaultVariableNameTransformation`
- **`config.commandline`** (3) — `CommandLineConfigAugmentations`, `CommandLineConfigProvider`, `CommandLineConfigSourceOptions`
- **`config.ini`** (6) — `IniConfigAugmentations`, `IniConfigProvider`, `IniConfigSource`, `IniConfigSourceOptions`, `IniStreamConfigProvider`, `IniStreamConfigSource`
- **`config.xml`** (6) — `XmlConfigAugmentations`, `XmlConfigProvider`, `XmlConfigSource`, `XmlConfigSourceOptions`, `XmlStreamConfigProvider`, `XmlStreamConfigSource`
- **`config.file`** (3) — `FileConfigAugmentations`, `FileLoadErrorContext`, `InvalidDataError`

The `*Augmentations` constants are the standalone call surface of each provider's declaration-merged
verb; an example that only ever calls `builder.addJsonFile(...)` dot-style leaves the standalone
form unexercised. Demonstrating one of them once (e.g. `JsonConfigAugmentations.addJsonFile(builder, …)`)
is the cheapest way to cover that half of the augmentation contract. The stream providers
(`addJsonStream`/`addIniStream`/`addXmlStream`) need a `Uint8Array`/string payload rather than a file.

The `config.env` pair `colonAndDotVariableNameTransformation` / `defaultVariableNameTransformation`
are the exported name-transformation functions — demonstrate by passing one explicitly to the
env source's options. Note both are flagged at their **definition** as well as the barrel, so
nothing in `config.env` itself routes through them either.

### b.2 — Caching: `caching.core`, `caching.memory` (23 entries)

Zero coverage. `MemoryCache` is a genuinely working implementation (expiration, size-limited
compaction, eviction callbacks, statistics) and no example touches it.

> **Where:** both `examples.app.*`. The `IServerReport` factory in
> `examples.lib.with-transformer/src/server-report.ts` is the natural host — cache the composed
> report and show the second call hitting the cache.

```ts
// registration, in the app's composition root
manifest = manifest.addMemoryCache(); // caching.memory
manifest = manifest.addDistributedMemoryCache(); // caching.memory

// use, inside the report factory
const cached = CacheExtensions.getOrCreate(cache, 'server-report', entry => {
  // CacheEntryExtensions acts on the live ICacheEntry ...
  CacheEntryExtensions.setSlidingExpiration(entry, 30_000);
  CacheEntryExtensions.setPriority(entry, CacheItemPriority.High);
  CacheEntryExtensions.registerPostEvictionCallback(entry, onEvicted); // PostEvictionDelegate
  return makeServerReport(resolver);
});

// ... while MemoryCacheEntryExtensions is the value-object form, over
// MemoryCacheEntryOptions -- both halves need a line to be covered.
const defaults = MemoryCacheEntryExtensions.setSlidingExpiration(
  new MemoryCacheEntryOptions(),
  30_000,
);
```

- **`caching.core`** (12) — `CacheExtensions`, `CacheEntryExtensions`, `MemoryCacheEntryExtensions`, `MemoryCacheEntryOptions`, `PostEvictionDelegate`, `DistributedCacheExtensions`, `DistributedCacheEntryExtensions`, `HybridCache`, `HybridCacheEntryOptions`, `HybridCacheEntryFlags`, `IHybridCacheSerializer`, `IHybridCacheSerializerFactory`
- **`caching.memory`** (11) — `MemoryCache`, `MemoryCacheOptions`, `MemoryCacheEntryOptions`, `MemoryCacheServiceManifestAugmentations`, `MemoryDistributedCache`, `MemoryDistributedCacheOptions`, `ISystemClock`, `MEMORY_CACHE_TOKEN`, `MEMORY_CACHE_OPTIONS_TOKEN`, `MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN`, `DISTRIBUTED_CACHE_TOKEN`

Caveat: the `Hybrid/` five (`HybridCache`, `HybridCacheEntryOptions`, `HybridCacheEntryFlags`,
`IHybridCacheSerializer`, `IHybridCacheSerializerFactory`) are abstractions ported ahead of any
implementation. There is nothing to demonstrate until a concrete tiered cache exists, so they will
stay flagged. That is honest signal, not noise — but it wants an explicit "known-parked" decision
so it does not read as rot.

### b.3 — Logging sinks and configuration: `logging.console`, `logging.config`, `logging.core`, `logging` (52 entries)

The apps resolve an `ILoggerFactory` and call `logInformation`, and that is the whole of it. No
provider is ever added, no filter configured, no scope opened, no formatter selected — which means
the console sink (at full reference parity, with three formatters and ANSI colour) is entirely
undemonstrated.

> **Where:** both `examples.app.*`, in the `addLogging` block that already exists implicitly through
> the host.

```ts
manifest = manifest.addLogging(builder => {
  builder.addConsole() // logging.console
    .addSimpleConsole(o => {
      o.colorBehavior = LoggerColorBehavior.Enabled;
    }).addJsonConsole().addConfig(config.getSection('Logging')) // logging.config
    .setMinimumLevel(LogLevel.Debug).addFilter('Rhombus.Hosting',
      LogLevel.Warning);
});

// in the worker, exercising the scope + message-template surface
using scope = beginScope(logger, 'request {id}', requestId); // logging.core
const logReady = LoggerMessage.define<string>(LogLevel.Information, 1,
  'ready: {name}');
logReady(logger, name, undefined);
```

- **`logging.console`** (15) — `ConsoleFormatter`, `ConsoleFormatterNames`, `ConsoleFormatterOptions`, `ConsoleLogger`, `ConsoleLoggerExtensions`, `ConsoleLoggerOptions`, `ConsoleLoggerQueueFullMode`, `DEFAULT_MAX_QUEUE_LENGTH`, `JsonConsoleFormatterOptions`, `JsonWriterOptions`, `LogEntry`, `LoggerColorBehavior`, `SimpleConsoleFormatterOptions`, `StringWriter`, `TextWriter`
- **`logging.config`** (11) — `ILoggerProviderConfig`, `ILoggerProviderConfigFactory`, `LoggerFilterConfigureOptions`, `LoggerProviderConfig`, `LoggerProviderConfigFactory`, `LoggerProviderConfigureOptions`, `LoggerProviderOptions`, `LoggerProviderOptionsChangeTokenSource`, `LoggingBuilderExtensions`, `LoggingConfig`, `loggerProviderConfigToken`
- **`logging.core`** (16) — `LoggerExtensions`, `LoggerFactoryExtensions`, `LoggerMessage`, `LogDefineOptions`, `beginScope`, `log`, `logTrace`, `logWarning`, `logCritical`, `formatMessage`, `EventIdLike`, `IBufferedLogger`, `BufferedLogRecord`, `ProviderAliased`, `providerAlias`, `getProviderAlias`
- **`logging`** (9) — `Logger`, `NullLogger`, `NullLoggerFactory`, `NullLoggerProvider`, `LoggerExternalScopeProvider`, `LoggerFilterOptionsExtensions`, `FilterLoggingBuilderExtensions`, `LoggingServiceManifestAugmentations`, `LOGGER_FILTER_OPTIONS_TOKEN`

`logging.core` is the most thoroughly dead surface in the report by flag site: **15 of its 16 are
flagged at their definition as well as the barrel**, so nothing inside `logging.core` uses them
either. Cheapest high-value slice: `addConsole()` plus one `addConfig(...)` covers most of
`logging.console` and `logging.config` at once, because the barrel symbols are the options/formatter
types those two calls instantiate. The `Null*` trio is the standard null-object surface — a one-line
demonstration (`const logger = NullLogger.instance`) is enough to justify keeping it.

### b.4 — Diagnostics: `diagnostics`, `diagnostics.core` (29 entries)

Zero coverage, and note the caveat: the listener runtime is deliberately unported, so `addMetrics`
/ `addTracing` register no listener activation. What _is_ real and demonstrable is the
config-binding pipeline and the rule-matching primitives.

> **Where:** both `examples.app.*`, alongside the existing options pipeline — the rule resolvers are
> pure functions over plain-data queries and cost nothing to show.

```ts
manifest = manifest.addMetrics(b =>
  b.addMetricsConfig(config.getSection('Metrics'))
).addTracing(b => b.addTracingConfig(config.getSection('Tracing')));

// the family's documented selection primitive, exercised directly
const rule = getMostSpecificInstrumentRule(rules, { meterName: 'app',
  instrumentName: 'requests' });
```

- **`diagnostics.core`** (15) — `getMostSpecificInstrumentRule`, `getMostSpecificTracingRule`, `instrumentRuleMatches`, `tracingRuleMatches`, `isMoreSpecificInstrumentRule`, `isMoreSpecificTracingRule`, `InstrumentRuleQuery`, `TracingRuleQuery`, `MetricsBuilderExtensions`, `TracingBuilderExtensions`, `MetricsOptionsExtensions`, `TracingOptionsExtensions`, `METRICS_LISTENER_TOKEN`, `TRACING_LISTENER_TOKEN`, `IObservableInstrumentsSource`
- **`diagnostics`** (14) — `MetricsBuilder`, `TracingBuilder`, `MetricsConfig`, `TracingConfig`, `MetricsConfigureOptions`, `TracingConfigureOptions`, `MetricsServiceExtensions`, `TracingServiceExtensions`, `MetricsBuilderConfigExtensions`, `TracingBuilderConfigExtensions`, `MetricListenerConfigFactory`, `IMetricListenerConfigFactory`, `ActivityListenerConfigFactory`, `DefaultActivityListenerConfigFactory`

The six rule-matching functions the digest calls "the family's documented selection primitive" are
all flagged at their **definition**, which is worth reading plainly: nothing in `diagnostics`
consumes them, so they are documented-but-unwired rather than merely undemonstrated.

### b.5 — File providers: `fileproviders.composite`, `fileproviders.physical` (6 entries)

`fileproviders.core` itself is covered transitively (the host environment holds an `IFileProvider`),
but nothing constructs a real one.

> **Where:** both `examples.app.*`, wired into the config layering from b.1 — this is the natural
> pairing, since `setFileProvider` is what makes `addJsonFile` read from a composite root.

```ts
const files = new CompositeFileProvider(
  new PhysicalFileProvider(import.meta.dir, ExclusionFilters.DotPrefixed),
  new PhysicalFileProvider(join(import.meta.dir, 'overrides')),
);
const config = new ConfigBuilder().setFileProvider(files).addJsonFile(
  'appsettings.json',
).build();
```

- **`fileproviders.composite`** (2) — `CompositeFileProvider`, `CompositeDirectoryContents`
- **`fileproviders.physical`** (4) — `ExclusionFilters`, `PhysicalFileInfo`, `PhysicalDirectoryInfo`, `PhysicalDirectoryContents`

### b.6 — Hosting: `hosting`, `hosting.core` (20 entries)

The apps use `Host` + `HOST_APPLICATION_LIFETIME_TOKEN` and one hosted lifecycle service. The
classic `HostBuilder`, the lifetime implementations, `HostOptions`, and the whole
builder-augmentation surface are unexercised.

> **Where:** `examples.app.without-transformer` is the better home for the classic `HostBuilder`
> path (it is the explicit-token dialect, and the two builders are alternatives rather than
> additions — showing one in each app covers both without duplicating the scenario).

```ts
const host = new HostBuilder()
  .useEnvironment('Development')
  .useContentRoot(import.meta.dir)
  .configureHostOptions(o => { o.shutdownTimeout = 5_000; })   // HostOptions
  .useConsoleLifetime(o => { o.suppressStatusMessages = true; }) // ConsoleLifetime(Options)
  .useDefaultServiceProvider(o => { o.validateScopes = true; })  // ServiceProviderOptions
  .configureServices((ctx, services) => services.addHostedService(...))
  .build();
```

- **`hosting`** (16) — `HostBuilder`, `HostOptions`, `ConsoleLifetime`, `ConsoleLifetimeOptions`, `NullLifetime`, `BackgroundServiceErrorBehavior`, `HostingHostBuilderAugmentations`, `MetricsBuilder`, `HOST_OPTIONS_TOKEN`, `HOST_ENVIRONMENT_TOKEN`, `HOST_BUILDER_CONTEXT_TOKEN`, `HOST_ENVIRONMENT_VARIABLE_PREFIX`, `HOSTING_LIFETIME_CATEGORY`, `CONSOLE_LIFETIME_OPTIONS_TOKEN`, `CONFIG_TOKEN`, `ServiceProviderOptions`
- **`hosting.core`** (4) — `HostAbortedError`, `HostingAbstractionsHostBuilderExtensions`, `ServiceManifestHostedServiceAugmentations`, `HOSTED_SERVICE_TOKEN`

`HOSTED_SERVICE_TOKEN` appears in both buckets, at two different sites: the real token on
`hosting.core`'s barrel is (b) — the apps register hosted services but never name the token — while
hosting's internal re-export of it (a.1) is dead outright. Fixing (b) does not fix (a).

`hosting`'s `MetricsBuilder` is worth a second look during triage. It is hosting's **own** class
(`hosting/src/MetricsBuilder.ts`, re-exported at `index.ts:42`), and `diagnostics` exports a
class of the same name. Two same-named public builders, neither demonstrated, is more likely a
duplicate to collapse than a gap to fill.

### b.7 — Browser hosting: `hosting.browser`, `logging.browserconsole` (26 entries)

The largest gap outside di (21 + 5), and the only one that cannot be closed inside the existing
apps: these run in a page, and the example apps are `node dist/main.js` with a stdout diff.

> **Where:** a NEW example project — `examples.app.browser` — is required. It has no `expected.txt`
> analogue, so it needs a different gate (a headless page load, or at minimum a build-only check).
> **This is an owner decision, not a mechanical fill-in**: it means accepting a browser-shaped
> example and a browser-shaped gate into the repo.

- **`hosting.browser`** (21) — `BrowserHost`, `BrowserLifetime`, `BrowserLifetimeOptions`, `BrowserLifetimeHostBuilderAugmentations`, `BrowserEnvironmentSettings`, `BrowserHostApplicationBuilderSettings`, `PageLifecycleEvents`, `PageLifecyclePhase`, `PageContext`, `PageTransitionEventLike`, `DocumentLike`, `WindowLike`, `DocumentLifecycleEventType`, `WindowLifecycleEventType`, `DocumentVisibilityState`, `createBrowserEnvironment`, `defaultPageContext`, `registerBrowserLifetime`, `BROWSER_LIFETIME_CATEGORY`, `BROWSER_LIFETIME_OPTIONS_TOKEN`, `PAGE_LIFECYCLE_EVENTS_TOKEN`
- **`logging.browserconsole`** (5) — `BrowserConsoleLogger`, `BrowserConsoleLoggerProvider`, `ConsoleLike`, `ConsoleMethod`, `consoleMethodFor`

Until that project exists, these 26 will stay flagged every run. If the owner would rather not build
it, the honest alternative is to accept them as permanently-flagged and record why — but _not_ to
silence them in `knip.jsonc`, because an ignore here would also hide genuine rot in the same
packages.

### b.8 — Options, primitives and the config core (27 entries)

Small, cheap, and worth closing first — these sit right next to code the apps already run.

- **`options`** (2) — `OptionsValidationError`, `ValidateOptionsResultBuilder`. The apps already
  build a validate step; make one of them **fail** and aggregate through
  `ValidateOptionsResultBuilder`, then catch `OptionsValidationError`. That also demonstrates
  multi-failure aggregation, which is the entire reason the builder exists.
- **`options.augmentations`** (6) — `OptionsServiceManifestAugmentations`,
  `OptionsConfigServiceManifestAugmentations`, `OptionsBuilderExtensions`, `postConfigureStepToken`,
  `validateStepToken`, `startupValidationTargetToken`. The apps use the dot-callable verbs; the
  standalone augmentation objects and the pipeline slot tokens (the surface a downstream package
  uses to register a step for a type it does not own) are unexercised. A ten-line "third-party
  registers a post-configure step by slot token" vignette covers all six.
- **`primitives`** (4) — `Multimap`, `MergeStrategy`, `ChangeTokenConsumer`,
  `AbortControllerConstructor`. `MergeStrategy` is the augmentation collision-resolution strategy —
  demonstrating it means an example that deliberately registers a colliding augmentation member,
  which is genuinely instructive. `ChangeTokenConsumer` is the async-consumer form of
  `ChangeToken.onChange`; the apps already do a config reload, so switching that callback to the
  async form covers it.
- **`config`** (14, listed here rather than b.1 because they are the core builder's own surface) —
  `ConfigSection`, `ConfigReloadToken`, `compareConfigKeys`, `OPTIONAL`, `Schema`, `ObjectSchema`,
  `OptionalSchema`, `Infer`, `SchemaCoercionError`. The schema family is the `.withType<T>()`
  sugar's runtime; the apps never call it. `config.core`'s `isConfigSection` (1) is the branded
  runtime discriminant — one `if (isConfigSection(node))` in a config-walking helper covers it.

  The other five are the in-package Memory and Chained providers — `MemoryConfigProvider`,
  `MemoryConfigBuilderExtensions`, `ChainedConfigSource`, `ChainedConfigProvider`,
  `ChainedBuilderExtensions` — and they are flagged at `config/src/memory/index.ts` and
  `config/src/chained/index.ts` only because those are their nearest declaration sites, NOT because
  the files are dead re-export shells. **Do not delete either file.** Each carries the `declare
  module` merges plus a top-level `registerAugmentations(tokenfor<IConfigBuilder>(), …)` — deleting
  one uninstalls `addInMemoryCollection` / `addConfig` from both `ConfigBuilder` and `ConfigManager`,
  and both apps call `.addInMemoryCollection(...)`
  (`examples.app.with-transformer/src/main.ts:72`, `examples.app.without-transformer/src/main.ts:60`).
  Deleting only the flagged export LINES is the quieter mistake: `config/src/index.ts:42,47`
  star-re-exports both sub-barrels, so all five names are in the published surface
  (`config/dist/bundle/index.d.ts:686`) and removing them shrinks reference parity while every gate
  stays green.

  The two `*Extensions` constants are the standalone call surface of the dot-callable verb — the
  same shape b.1 treats as the cheapest augmentation coverage, so
  `MemoryConfigBuilderExtensions.addInMemoryCollection(builder, …)` in one app covers that pair.
  `ChainedConfigSource` is the easy one: `builder.add(new ChainedConfigSource({ config: shared }))`
  is the hand-written form of `addConfig`, and layering a second `IConfig` over the app's own is a
  scenario worth showing anyway. The two `*Provider` classes are the awkward ones — both `build()`
  methods return `IConfigProvider`, so no fluent usage ever names them, and covering them means an
  explicit annotation or `instanceof` check purely for the scan's benefit. That is the case where
  "delete it from the barrel" deserves a real hearing against reference parity, and it is an owner
  call, not a fill-in.

### b.9 — The example libraries themselves (3 entries)

`examples.lib.without-transformer` exports `CasualGreeting`, `HealthCheck` and
`HEALTH_CHECK_TOKEN`, and the apps import only `addCasualServices` and `GREETING_TOKEN`. The types
are reached through DI, never by name. Either narrow that barrel, or have the app resolve
`HEALTH_CHECK_TOKEN` explicitly instead of only through the report factory.

PR #277 grows this bucket from 3 entries to 53 — 44 in `examples.lib.without-transformer`, 9 in
`examples.lib.with-transformer` (see [di and di.core](#still-provisional--and-exactly-how-much)) —
which makes the "narrow the barrel" option clearly the better of the two.

---

## (c) False positives

### c.1 — Suppressed by `knip.jsonc`

| What                                                                                                                                         | Why invisible                                                                                                                                                                     | Suppression                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| The `rhombus.inline` sugar bodies — 7 exports across `di.extras` + `di.extras.options`, plus `config.extras/src/inline.ts` as an unused file | Located by a **string in `package.json`** (`rhombus.inline.entries[].impl`) and side-parsed out of source by the transform engine. No TypeScript import exists                    | `ignoreIssues: { "**/src/inline.ts": ["exports", "files"] }` — **new this pass**, see below                                             |
| `<pkg>/ttsc.mjs` default + named export (4 files), and their duplicate-export report                                                         | `ttsc` resolves the descriptor through the package's `./ttsc` export subpath and calls it at build time; there is no TypeScript-visible import                                    | `ignoreIssues: { "**/ttsc.mjs": ["exports", "duplicates"] }`                                                                            |
| `rollup*.dts.mjs` default export (31 files)                                                                                                  | Read by the `rollup -c` CLI, never imported                                                                                                                                       | `ignoreIssues: { "**/rollup*.dts.mjs": ["exports"] }`, plus listing the file as an entry so its `rollup-plugin-dts` import _is_ counted |
| `ttsc`, `@ttsc/unplugin` declared in ~27 packages                                                                                            | Named in `tsconfig.ttsc.json`'s `plugins[].transform` (a JSON descriptor knip has no plugin for) and spawned by `scripts/build-package.ts` from each package's own directory      | `ignoreDependencies`                                                                                                                    |
| `gofmt`, `diff`, `mise`, `knip` binaries                                                                                                     | Invoked from CI YAML and package script strings. `gofmt`/`diff` are ambient; `mise` and `knip` are mise-pinned tools rather than devDependencies, per the no-global-devtools rule | `ignoreBinaries`                                                                                                                        |

That is 82 findings removed (8 inline-body findings, 8 exports, 4 duplicate-export pairs, 4 unlisted
deps, 5 binaries, 53 devDependencies), plus the 31 rollup-config default exports that entry-listing
those files would otherwise have introduced. All structural, none judgemental.

**On the inline bodies specifically — and a correction.** The previous version of this report left
them visible on the reasoning that a sister change would make them "visibly referenced", so the
findings would "disappear on their own". **That was an assumption and it is false.** The sister
change (PR #278) adds `registerInlineBodies(X)` beside each body set — a runtime no-op that states
the package.json↔source relationship in code for a human reader. It was measured against this
branch: **all seven body sets are still flagged with it applied**, because the reference it creates
lives in the _same file_ as the declaration, and knip does not count a same-file reference as usage.
No marker placed beside a declaration can ever clear it. Hence the ignore.

The `knip.jsonc` entry carries that mechanism in full, including the "do not delete this on the
theory that the marker covers it" clause. Two scope details worth repeating here:

- It suppresses only the body file's own **exports** (and, for `config.extras`, the unused-**file**
  report). The file stays **in** the graph, so its ordinary imports still count — which is what
  keeps `signatureof`, `valueof` and `keyof` silent. A file-level `ignore` would drop those edges
  and manufacture three new false positives. Verified: those three are absent from the JSON after
  the change.
- When PR #278 lands it will add two findings of its own, `InlineBody` and `InlineBodySet` (types in
  `primitives.extras/src/registerInlineBodies.ts`, re-exported from that barrel). They are **not**
  covered by this ignore and are **not** an instance of its mechanism — they are the ordinary
  [Limits #4](#limits-of-the-detector) case of a type satisfied structurally (callers pass an object
  literal to `registerInlineBodies` and never name the interface). Decide them on that basis when
  they appear; they are not flagged as of this run, so nothing was configured for them in advance.

### c.2 — Not suppressed, and deliberately so

**`config.extras/src/index.ts` and `config.extras/src/schemaof.ts` — 2 unused files.** A different
mechanism from the inline bodies above, which is why they are not covered by the same ignore: that
package's only export is `./ttsc`, so knip has no entry point that anchors `src` at all, and reports
every file it cannot reach. Left visible because "a package whose source is unreachable from its own
manifest" is a fact worth seeing rather than hiding, and because the surrounding `.extras` packages
are actively being restructured.

**TypeScript embedded in Go string literals.** `transforms/` contains `.go` files carrying TS
fixtures, many of which embed `import { … } from '@rhombus-std/…'` statements. Cross-referencing
those against the report, about ten flagged names have a reference there: `$`, `Hole`, `Inject`,
`Keyed`, `Typeof`, `IAsBuilder`, `IWithSignatureBuilder`, `IServiceManifestBase` (di.core / di) and
`OPTIONAL` (config).

**There is no config lever for this, and there should not be one.** Two reasons, and they compound:

1. knip cannot see inside Go string literals. The only expressible suppression is a per-file
   `ignoreIssues` over `di.core`/`di.extras`/`config` source, which would blind the detector to
   genuine rot in the packages that most need watching. Teaching knip to read Go via a
   `syncCompilers` hook is possible in principle, but that is a hand-rolled analyser living in the
   config file — out of scope by the "own as little code as possible" constraint.
2. Even if it were visible, it should not count. Those fixtures are overwhelmingly `*_test.go`, and
   the owner's own rule is that tests are mirrors, not consumers. A Go test asserting that the
   engine lowers `Keyed<…>` correctly is precisely the "test existing solely to exercise a symbol"
   case.

So the actionable read on all ten is **bucket (b), not (c)**: they are real authoring API that no
example demonstrates. PR #277 covers every one of them.
`transforms/` itself needs no exclusion — it holds zero `.ts` files and never enters the graph.

---

## Limits of the detector

Five things a reader of this report needs to know.

**1. The `Unused files` bucket is nearly useless here, by construction.** Every library's
`package.json` exposes the white-box seam `"./tokens/*": "./src/*.ts"`, which knip expands to
`./src/**/*.ts` and treats as a package entry point — so every library source file is an entry, and
an entry is by definition reachable. Only `config.extras` (which has no such seam) can be reported
as an unused file. The information is not lost: with `includeEntryExports: true` a wholly dead
module surfaces as _every one of its exports_ being flagged, which is the same fact at finer
granularity. Read a file whose entire export list appears in this report as an unused file — with
one guard, because it has a live counter-example. A module can be imported for its SIDE EFFECTS
rather than its names, and knip scores only the names. `config/src/chained/index.ts` has all three
of its exports flagged and is nonetheless load-bearing: `config/src/index.ts:47` pulls it in so its
top-level `registerAugmentations` call runs, installing `addConfig` on both concrete builders. So
before reading a fully-flagged file as dead, check it for top-level statements and `declare module`
blocks; if it has either, the exports are the question and the file is not.

**2. The barrel fixed point closes; the dead-code-uses-dead-code fixed point does not.** knip never
credits `export { X } from './x'` as a use, so barrel chains resolve in one pass (verified above).
But an ordinary import _does_ count as a use even when the importing file is itself dead. Concrete
case: `di.extras/src/inline.ts` has no live importer — it is dead by the scan's own account, which
is exactly why it needs the c.1 suppression — yet it imports `signatureof`, `valueof` and `keyof`,
and those three are silent. A symbol kept alive only by dead code will not be reported. knip does
not iterate, and no configuration makes it. **After deleting anything from bucket (a), re-run the
scan** — the next round may surface symbols the deleted code was propping up.

**3. Some flags mean "the `export` keyword is dead", not "the symbol is dead".** knip's default
reports an export used only inside its own file. The flag-site split above isolates the candidates
mechanically — the 17 **definition-only** entries — but it does not decide them: "not in any barrel"
covers both "used once in its own file" (section a.2, 8 of the 17) and "used nowhere at all" (the
four `di.extras` `*_NAME` constants and a.1's five individually-dead symbols). Separating those two
needs a human to open the file, and every one of the 8 in a.2 was re-verified that way for this pass.
Elsewhere in the report a flag means no reference at all.

**4. `types` findings are weaker signal than `exports` findings.** 148 of the 461 findings are
type-only. A type consumed purely structurally — a parameter shape a caller satisfies with an object
literal, never naming the interface — reads as unused. Treat type flags on interfaces that describe
_inputs_ with more suspicion than flags on classes, constants and functions.

**5. A same-file reference is not a use.** knip's model of "used" is cross-file. A marker,
registration call, or self-test placed _beside_ a declaration to document it cannot clear that
declaration's finding, no matter how real the reference is at runtime. This is the mechanism behind
c.1's `registerInlineBodies` correction, and it generalises: if the plan for clearing a finding is
"add a line next to it", the plan does not work.

## Suggested order of work

Active scope first; everything after item 3 is the standing worklist and is not actionable now.

1. **Answer the di dual-export question.** Whether `@rhombus-std/di` should keep re-exporting
   `di.core`'s whole surface is worth 41 entries after #277 lands, and it is the only di finding that
   no amount of example coverage can resolve. §130's "a library references the abstractions package;
   only an entry point references the engine" is the relevant precedent.
2. **Land PR #277, then re-run.** It clears 53 di-family entries and empties `di.core` down to a
   single a.1 item. Nothing in di's bucket (b) should be acted on before then. Budget for the ~50 new
   `examples.lib.*` findings it introduces, and consider narrowing those demo barrels in the same
   change.
3. **di's bucket (a)** — the two `di.core` `*_NAME` constants, the four `di.extras` ones, and
   `RESOLVER_TOKEN_STRING`'s two re-export lines (the constant itself stays). Seven entries,
   mechanical, independent of both items above.
4. **Non-di bucket a.1 + a.2** — the remaining 20 entries, mechanical apart from the three the
   section itself flags as judgement calls (`toDistributedCacheEntryOptions`, `HOSTED_SERVICE_TOKEN`
   and `Ignore`, each of which has a reason to keep it). Re-run afterwards (Limits #2).
5. **Bucket a.3** — five dependency lines; the `hosting → options.augmentations` one needs an owner
   answer first.
6. **Bucket b.8** — options/primitives/config, 27 entries sitting next to code the apps already
   run; the cheapest coverage per line of example.
7. **Bucket b.1 + b.5** — config providers plus file providers, closed together as one layered
   configuration story (~34 entries).
8. **Bucket b.3** — logging sinks and configuration (~52 entries); `addConsole()` + `addConfig()`
   covers most of it.
9. **Bucket b.2, b.4, b.6** — caching, diagnostics, the classic host builder.
10. **Bucket b.7** — the browser example, if the owner wants it. Decide before starting; it is a new
    project and a new gate, not an edit.
