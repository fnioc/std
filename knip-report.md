# Unused-code scan — triaged report

Generated from `bun run knip` against `chore-knip-unused-scan` (base `3ee30fc`), with knip
`6.29.0` pinned in `mise.toml` and the semantics configured in `knip.jsonc`.

This is a **worklist, not a gate**. Nothing here is auto-fixable and `--fix` must never be run
against this repo: every entry is a binary owner decision — **delete the symbol, or demonstrate
it in an example**.

## How to reproduce

```sh
bun run knip                 # the committed report-only run
bun run knip -- --reporter json > /tmp/knip.json    # machine-readable
```

`knip` comes from mise (`mise.toml` pins `npm:knip = "6.29.0"`), so the same shell that has Go
and bun on `PATH` has it.

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

## Headline numbers

| Bucket                                                             | Distinct symbols                                                                                      | Confidence                                                                                 |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **(a) Genuinely dead** — internal machinery, nothing should use it | **36**                                                                                                | High for 31; medium for the 5 in `di.core` (see [Provisional](#provisional-di-and-dicore)) |
| **(b) Kitchen-sink gap** — real public API no example exercises    | **320**                                                                                               | High that they are unexercised; the _decision_ (demonstrate vs. delete) is the owner's     |
| **(c) False positive** — structurally invisible reference          | **10 symbols + 3 files** left visible on purpose, plus 74 findings the config now suppresses outright | High                                                                                       |

Raw tool output before triage: 328 unused exports, 176 unused types, 1 unused enum member
(505 findings over 363 distinct names — a name flagged at both its definition and its barrel
re-export counts twice), 3 unused files, 4 unused dependencies, 1 unused devDependency.

107 of the 363 names live in `libraries/di` + `libraries/di.core`, which PR #275 is concurrently
rewriting. **Treat every di finding in this report as provisional.**

---

## (a) Genuinely dead — recommend removal

Two distinct failure modes, which want different edits.

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

| Package             | Constants                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `primitives.extras` | `TOKENFOR_NAME`, `TOKENOF_NAME`, `IS_FACTORY_NAME`, `IS_SINGULAR_NAME`, `PARAM_TOKENSFOR_NAME`, `RETURN_TOKENFOR_NAME`, `SINGULAR_VALUE_NAME` |
| `di.extras`         | `SIGNATUREOF_NAME`, `KEYOF_NAME`, `VALUEOF_NAME`, `KEYEDTOKENFOR_NAME`                                                                        |
| `di.core`           | `SIGNATUREFOR_NAME`, `SIGNATURESFOR_NAME`                                                                                                     |

**Dead sub-barrels.** Three internal `index.ts` files re-export names nothing imports through them;
the underlying symbols are alive and reached directly.

- `config/src/chained/index.ts` — `ChainedConfigSource`, `ChainedConfigProvider`,
  `ChainedBuilderExtensions`
- `config/src/memory/index.ts` — `MemoryConfigProvider`, `MemoryConfigBuilderExtensions`
- `di.core/src/token/index.ts` — `TokenManifest`, `TokenProvider`, `Descriptor`,
  `SealedTokenManifest`, `RESOLVER_TOKEN_STRING` _(provisional — PR #275)_

**Individually dead symbols.**

| Symbol                           | File                                                    | Note                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currentCacheEntry`              | `caching.memory/src/CacheEntry.ts:71`                   | No caller anywhere                                                                                                                                                                                                                                    |
| `getParentPath`                  | `config.core/src/config-path.ts:39`                     | No caller anywhere                                                                                                                                                                                                                                    |
| `toDistributedCacheEntryOptions` | `caching.core/src/hybrid/HybridCacheEntryOptions.ts:67` | Deliberately kept out of the barrel per its own comment; dead because the `Hybrid/` subsystem is abstractions-only with no implementation yet. Keeping it is defensible — but then it is a permanent flag, so it wants a decision rather than a shrug |
| `HOSTED_SERVICE_TOKEN`           | `hosting/src/internal/Host.ts:32`                       | A re-export of `hosting.core`'s token, added "so a white-box consumer can reach it". The only white-box consumers are tests, which do not count — so the line exists purely for tests and is correctly flagged. Removing it will break a test import  |
| `Ignore`                         | `hosting/src/BackgroundServiceErrorBehavior.ts:22`      | Enum member never referenced. Sibling `StopHost` is. Reference-parity may justify keeping it                                                                                                                                                          |

### a.2 — Live symbol, dead `export` keyword: drop the `export`

These are used exactly once, inside their own file. The symbol stays; the export goes.

| Symbol                                                  | File                                                 | Its one in-file use                                                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `select`, `SelectedRule`                                | `logging/src/LoggerRuleSelector.ts`                  | Reached through `export const LoggerRuleSelector = { select }` on line 116 — the object is the consumed surface, the standalone export is a second door onto it |
| `HOST_LOGGER_CATEGORY`, `APPLICATION_LIFETIME_CATEGORY` | `hosting/src/host-composition.ts`                    | `loggerFactory.createLogger(...)` calls in the same file                                                                                                        |
| `parseLogLevel`                                         | `logging.config/src/LoggerFilterConfigureOptions.ts` | Line 66                                                                                                                                                         |
| `droppedMessagesWarning`                                | `logging.console/src/ConsoleLoggerProcessor.ts`      | Line 125                                                                                                                                                        |
| `BrowserHostingEnvironment`                             | `hosting.browser/src/browser-environment.ts`         | `new BrowserHostingEnvironment()` on line 50. Note this is an interface + class declaration merge, so both halves carry `export`                                |
| `ttscEnv`                                               | `scripts/build-package.ts`                           | Line 135                                                                                                                                                        |

### a.3 — Dead dependency declarations

| Package             | Declared                                 | Finding                                                                                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `di.extras`         | `@rhombus-std/primitives`                | Source imports `@rhombus-std/primitives.extras`, never the runtime leaf. Stale since the `tokenfor`/`tokenof` move out of `primitives`                                                                                                                                                                              |
| `di.extras.options` | `@rhombus-std/primitives`                | Same                                                                                                                                                                                                                                                                                                                |
| `config.extras`     | `@rhombus-std/primitives.extras`         | `config.extras/src` imports only `./schemaof.js`                                                                                                                                                                                                                                                                    |
| `hosting`           | `@rhombus-std/options.augmentations`     | **Owner call.** No hosting source references it — but `CLAUDE.md`'s architecture digest asserts the `hosting ← options.augmentations` edge. Either the edge is real and something in hosting should be importing it for the prototype patch to land, or the digest is stale. Do not delete on the scan's word alone |
| `di.extras.options` | `@rhombus-std/di.extras` (devDependency) | Mirrors a declared `peerDependency` so the peer resolves in-repo. Arguably (c); left visible because "a peer you never reference" is worth a look                                                                                                                                                                   |

---

## (b) Kitchen-sink gap — the worklist

**320 public barrel exports that no example demonstrates.** This is the interesting bucket and the
one the scan exists to produce. The shape of it is stark: the example apps exercise `config` (memory
source + reload), `di`, `options` (full configure → post-configure → validate pipeline), `hosting`
(`Host` + a hosted lifecycle service) and `logging` (factory + `logInformation`) — and _nothing
else_. Counting from the example manifests: **10 of the 32 libraries are depended on by an example
at all; 22 are not.** The whole of `caching`, `diagnostics` and `fileproviders`, every config
provider, and both browser-target packages are untouched. (`config.core`, `fileproviders.core`,
`hosting.core` and `primitives` are on that list too, but are reached transitively through the ten
that are — their surfaces are partly covered.)

The two apps mirror each other (`examples.app.with-transformer` in the tokenless dialect,
`examples.app.without-transformer` with explicit tokens), and both diff their stdout against a
checked-in `expected.txt`. Any addition below lands in **both** apps and updates both `expected.txt`
files, unless noted.

### b.1 — Config providers: `config.json`, `config.env`, `config.commandline`, `config.ini`, `config.xml`, `config.file` (28 symbols)

Currently the apps build configuration from an in-memory collection only. Every file/env/argv
provider in the repo is undemonstrated, including the whole `config.file` base and both stream
providers per format.

> **Where:** both `examples.app.*`. Add a small `appsettings.json` (+ `appsettings.ini`,
> `appsettings.xml`) fixture beside the app and layer the sources the way a real composition root
> would.

```ts
const config = new ConfigBuilder()
  .setBasePath(import.meta.dir) // config.file
  .addJsonFile('appsettings.json', { optional: true, reloadOnChange: false })
  .addIniFile('appsettings.ini', { optional: true })
  .addXmlFile('appsettings.xml', { optional: true })
  .addEnvironmentVariables({ prefix: 'RHOMBUS_' }) // config.env
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
env source's options.

### b.2 — Caching: `caching.core`, `caching.memory` (23 symbols)

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

### b.3 — Logging sinks and configuration: `logging.console`, `logging.config`, `logging.core`, `logging` (52 symbols)

The apps resolve an `ILoggerFactory` and call `logInformation`, and that is the whole of it. No
provider is ever added, no filter configured, no scope opened, no formatter selected — which means
the console sink (at full reference parity, with three formatters and ANSI colour) is entirely
undemonstrated.

> **Where:** both `examples.app.*`, in the `addLogging` block that already exists implicitly through
> the host.

```ts
manifest = manifest.addLogging(builder => {
  builder
    .addConsole() // logging.console
    .addSimpleConsole(o => {
      o.colorBehavior = LoggerColorBehavior.Enabled;
    })
    .addJsonConsole()
    .addConfig(config.getSection('Logging')) // logging.config
    .setMinimumLevel(LogLevel.Debug)
    .addFilter('Rhombus.Hosting', LogLevel.Warning);
});

// in the worker, exercising the scope + message-template surface
using scope = beginScope(logger, 'request {id}', requestId); // logging.core
const logReady = LoggerMessage.define<string>(LogLevel.Information, 1,
  'ready: {name}');
logReady(logger, name, undefined);
```

- **`logging.console`** (16) — `ConsoleFormatter`, `ConsoleFormatterNames`, `ConsoleFormatterOptions`, `ConsoleLogger`, `ConsoleLoggerExtensions`, `ConsoleLoggerFormat`, `ConsoleLoggerOptions`, `ConsoleLoggerQueueFullMode`, `DEFAULT_MAX_QUEUE_LENGTH`, `JsonConsoleFormatterOptions`, `JsonWriterOptions`, `LogEntry`, `LoggerColorBehavior`, `SimpleConsoleFormatterOptions`, `StringWriter`, `TextWriter`
- **`logging.config`** (11) — `ILoggerProviderConfig`, `ILoggerProviderConfigFactory`, `LoggerFilterConfigureOptions`, `LoggerProviderConfig`, `LoggerProviderConfigFactory`, `LoggerProviderConfigureOptions`, `LoggerProviderOptions`, `LoggerProviderOptionsChangeTokenSource`, `LoggingBuilderExtensions`, `LoggingConfig`, `loggerProviderConfigToken`
- **`logging.core`** (16) — `LoggerExtensions`, `LoggerFactoryExtensions`, `LoggerMessage`, `LogDefineOptions`, `beginScope`, `log`, `logTrace`, `logWarning`, `logCritical`, `formatMessage`, `EventIdLike`, `IBufferedLogger`, `BufferedLogRecord`, `ProviderAliased`, `providerAlias`, `getProviderAlias`
- **`logging`** (9) — `Logger`, `NullLogger`, `NullLoggerFactory`, `NullLoggerProvider`, `LoggerExternalScopeProvider`, `LoggerFilterOptionsExtensions`, `FilterLoggingBuilderExtensions`, `LoggingServiceManifestAugmentations`, `LOGGER_FILTER_OPTIONS_TOKEN`

Cheapest high-value slice: `addConsole()` plus one `addConfig(...)` covers most of
`logging.console` and `logging.config` at once, because the barrel symbols are the options/formatter
types those two calls instantiate. The `Null*` trio is the standard null-object surface — a one-line
demonstration (`const logger = NullLogger.instance`) is enough to justify keeping it.

### b.4 — Diagnostics: `diagnostics`, `diagnostics.core` (29 symbols)

Zero coverage, and note the caveat: the listener runtime is deliberately unported, so `addMetrics`
/ `addTracing` register no listener activation. What _is_ real and demonstrable is the
config-binding pipeline and the rule-matching primitives.

> **Where:** both `examples.app.*`, alongside the existing options pipeline — the rule resolvers are
> pure functions over plain-data queries and cost nothing to show.

```ts
manifest = manifest
  .addMetrics(b => b.addMetricsConfig(config.getSection('Metrics')))
  .addTracing(b => b.addTracingConfig(config.getSection('Tracing')));

// the family's documented selection primitive, exercised directly
const rule = getMostSpecificInstrumentRule(rules, { meterName: 'app',
  instrumentName: 'requests' });
```

- **`diagnostics.core`** (15) — `getMostSpecificInstrumentRule`, `getMostSpecificTracingRule`, `instrumentRuleMatches`, `tracingRuleMatches`, `isMoreSpecificInstrumentRule`, `isMoreSpecificTracingRule`, `InstrumentRuleQuery`, `TracingRuleQuery`, `MetricsBuilderExtensions`, `TracingBuilderExtensions`, `MetricsOptionsExtensions`, `TracingOptionsExtensions`, `METRICS_LISTENER_TOKEN`, `TRACING_LISTENER_TOKEN`, `IObservableInstrumentsSource`
- **`diagnostics`** (14) — `MetricsBuilder`, `TracingBuilder`, `MetricsConfig`, `TracingConfig`, `MetricsConfigureOptions`, `TracingConfigureOptions`, `MetricsServiceExtensions`, `TracingServiceExtensions`, `MetricsBuilderConfigExtensions`, `TracingBuilderConfigExtensions`, `MetricListenerConfigFactory`, `IMetricListenerConfigFactory`, `ActivityListenerConfigFactory`, `DefaultActivityListenerConfigFactory`

### b.5 — File providers: `fileproviders.composite`, `fileproviders.physical` (6 symbols)

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

### b.6 — Hosting: `hosting`, `hosting.core` (20 symbols)

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

### b.7 — Browser hosting: `hosting.browser`, `logging.browserconsole` (26 symbols)

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

### b.8 — Options, primitives and the config core (22 symbols)

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
- **`config`** (9, listed here rather than b.1 because they are the core builder's own surface) —
  `ConfigSection`, `ConfigReloadToken`, `compareConfigKeys`, `OPTIONAL`, `Schema`, `ObjectSchema`,
  `OptionalSchema`, `Infer`, `SchemaCoercionError`. The schema family is the `.withType<T>()`
  sugar's runtime; the apps never call it. `config.core`'s `isConfigSection` (1) is the branded
  runtime discriminant — one `if (isConfigSection(node))` in a config-walking helper covers it.

### b.9 — The example libraries themselves (3 symbols)

`examples.lib.without-transformer` exports `CasualGreeting`, `HealthCheck` and
`HEALTH_CHECK_TOKEN`, and the apps import only `addCasualServices` and `GREETING_TOKEN`. The types
are reached through DI, never by name. Either narrow that barrel, or have the app resolve
`HEALTH_CHECK_TOKEN` explicitly instead of only through the report factory.

---

## Provisional: `di` and `di.core`

**107 of 363 names.** PR #275 is rewriting exactly this code; do not act on this section until it
lands, then re-run.

The shape, for context:

- `di/src/index.ts` + `di/src/types.ts` re-export `di.core`'s entire surface, by design — "so the
  whole surface stays reachable through one `@rhombus-std/di` import". Every library in the repo
  imports from `di.core` directly, and the apps import only `RESOLVER_TOKEN` + `IResolver` from
  `di`, so **63 of those re-exports have no consumer at all**. That is not obviously dead code; it
  is a dual-export policy question the scan cannot answer. It is the single largest lever in the
  report — resolving it one way removes ~63 findings at a stroke.
- `di.core`'s brand types (`$`, `$1`…`$9`, `Hole`, `Inject`, `Keyed`, `Typeof`) and authoring
  builder interfaces (`IAsBuilder`, `IWithKeyBuilder`, `IWithSignatureBuilder`,
  `IWithSignaturesBuilder`) are the open-generic / keyed-service authoring surface. The examples
  demonstrate neither open generics nor keyed services — a real kitchen-sink gap, and squarely
  PR #275's subject matter.
- `di.core`'s token AST (`ConcreteNode`, `FactoryNode`, `HoleNode`, `LiteralNode`, `ProviderNode`,
  `UnionNode`, `TokenWalker`, `TokenRewriter`, `Substituter`, `Validator`, `Specificity`,
  `parseSlot`, `serialiseSlot`) is public but consumed only by the Go engine's own reimplementation
  and by tests. Whether it should be public at all is a boundary question.

---

## (c) False positives

### c.1 — Suppressed by `knip.jsonc`

| What                                                                                 | Why invisible                                                                                                                                                                     | Suppression                                                                                                                             |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `<pkg>/ttsc.mjs` default + named export (4 files), and their duplicate-export report | `ttsc` resolves the descriptor through the package's `./ttsc` export subpath and calls it at build time; there is no TypeScript-visible import                                    | `ignoreIssues: { "**/ttsc.mjs": ["exports", "duplicates"] }`                                                                            |
| `rollup*.dts.mjs` default export (31 files)                                          | Read by the `rollup -c` CLI, never imported                                                                                                                                       | `ignoreIssues: { "**/rollup*.dts.mjs": ["exports"] }`, plus listing the file as an entry so its `rollup-plugin-dts` import _is_ counted |
| `ttsc`, `@ttsc/unplugin` declared in ~27 packages                                    | Named in `tsconfig.ttsc.json`'s `plugins[].transform` (a JSON descriptor knip has no plugin for) and spawned by `scripts/build-package.ts` from each package's own directory      | `ignoreDependencies`                                                                                                                    |
| `gofmt`, `diff`, `mise`, `knip` binaries                                             | Invoked from CI YAML and package script strings. `gofmt`/`diff` are ambient; `mise` and `knip` are mise-pinned tools rather than devDependencies, per the no-global-devtools rule | `ignoreBinaries`                                                                                                                        |

That is 74 findings removed (8 exports, 4 duplicate-export pairs, 4 unlisted deps, 5 binaries,
53 devDependencies), plus the 31 rollup-config default exports that entry-listing those files
would otherwise have introduced. All structural, none judgemental.

### c.2 — Not suppressed, and deliberately so

**The `rhombus.inline` sugar bodies (7 symbols + 3 files).** The inline stage locates a sugar body
by a **string in `package.json`** — `rhombus.inline.entries[].impl` — and side-parses it out of
source. No TypeScript import exists, so knip sees dead modules:

- `di.extras/src/inline.ts` — `ServiceQueryInline`, `ResolverInline`, `ServiceManifestInline`,
  `ServiceManifestOverrideInline`, `ServiceManifestSelfInline`, `ManifestChainInline`
- `di.extras.options/src/inline.ts` — `ServiceOptionsInline`
- `config.extras/src/{index,inline,schemaof}.ts` — reported as three **unused files**
  (`ConfigBuilderInline` lives there; the package's only export is `./ttsc`, so nothing anchors src)

Left visible because the sister track is making these bodies visibly referenced; once that lands
these findings disappear on their own, which is the right outcome. An ignore now would have to be
removed again immediately, and would blind the scan to the `.extras` packages exactly while they
are being restructured.

**TypeScript embedded in Go string literals.** `transforms/` contains 35 `.go` files carrying TS
fixtures, ~19 of which embed `import { … } from '@rhombus-std/…'` statements. Cross-referencing
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
example demonstrates, and they are listed above under [Provisional](#provisional-di-and-dicore).
`transforms/` itself needs no exclusion — it holds zero `.ts` files and never enters the graph.

---

## Limits of the detector

Four things a reader of this report needs to know.

**1. The `Unused files` bucket is nearly useless here, by construction.** Every library's
`package.json` exposes the white-box seam `"./tokens/*": "./src/*.ts"`, which knip expands to
`./src/**/*.ts` and treats as a package entry point — so every library source file is an entry, and
an entry is by definition reachable. Only `config.extras` (which has no such seam) can be reported
as an unused file. The information is not lost: with `includeEntryExports: true` a wholly dead
module surfaces as _every one of its exports_ being flagged, which is the same fact at finer
granularity. Read a file whose entire export list appears in this report as an unused file.

**2. The barrel fixed point closes; the dead-code-uses-dead-code fixed point does not.** knip never
credits `export { X } from './x'` as a use, so barrel chains resolve in one pass (verified above).
But an ordinary import _does_ count as a use even when the importing file is itself dead. Concrete
case from this very report: `di.extras/src/inline.ts` has all six of its exports flagged — it is
dead by the scan's own account — yet it imports `signatureof`, `valueof` and `keyof`, and those
three are silent. A symbol kept alive only by dead code will not be reported. knip does not iterate,
and no configuration makes it. **After deleting anything from bucket (a), re-run the scan** — the
next round may surface symbols the deleted code was propping up.

**3. Some flags mean "the `export` keyword is dead", not "the symbol is dead".** knip's default
reports an export used only inside its own file. Section a.2 separates these out; elsewhere in the
report a flag means no reference at all.

**4. `types` findings are weaker signal than `exports` findings.** 176 of the 505 findings are
type-only. A type consumed purely structurally — a parameter shape a caller satisfies with an object
literal, never naming the interface — reads as unused. Treat type flags on interfaces that describe
_inputs_ with more suspicion than flags on classes, constants and functions.

## Suggested order of work

1. **Bucket a.1 + a.2** — 31 non-di symbols, mechanical, no design content. Re-run afterwards
   (limit 2).
2. **Bucket a.3** — four dependency lines; the `hosting → options.augmentations` one needs an owner
   answer first.
3. **Bucket b.8** — options/primitives/config, 22 symbols sitting next to code the apps already
   run; the cheapest coverage per line of example.
4. **Bucket b.1 + b.5** — config providers plus file providers, closed together as one layered
   configuration story (~34 symbols).
5. **Bucket b.3** — logging sinks and configuration (~52 symbols); `addConsole()` + `addConfig()`
   covers most of it.
6. **Bucket b.2, b.4, b.6** — caching, diagnostics, the classic host builder.
7. **Bucket b.7** — the browser example, if the owner wants it. Decide before starting; it is a new
   project and a new gate, not an edit.
8. **`di` / `di.core`** — after PR #275 lands. Answer the dual-export question first; it is worth
   ~63 findings on its own.
