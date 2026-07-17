# Divergence alarm — audit of gaps vs the reference

> **Point-in-time snapshot, as-of 2026-07-12.** This document synthesizes a repo-wide
> port-completeness audit run against the reference dependency graph
> (`docs/reference/me-extensions-dependencies.md`). Some rows have already shifted since
> the audit was gathered: `ME.FileProviders.Physical` landed via #184, the augmentation
> token-derivation fix landed via #185, and `ME.Configuration`'s file-layer/ini/xml
> completion work is in flight. Treat every `[in-flight]` row below as **possibly already
> landed** — re-check the package before acting on it. `[silent]` rows are the ones that
> need attention regardless of timing: nothing anywhere records that the gap is known or
> intentional.

Every gap the audit found is classified one of three ways:

- **`[recorded]`** — covered by a `docs/decisions.md` §, a `CLAUDE.md` note, or an open/closed
  issue that names the gap and the reasoning.
- **`[silent]`** — no record anywhere. These are the alarm cases.
- **`[in-flight]`** — active work exists (a branch, a tracked issue) but hasn't landed yet as of
  the snapshot date.

---

## Alarm — silent gaps

Ranked by consumer impact. Every row below is `[silent]`: no `decisions.md` §, no `CLAUDE.md`
note, no issue — except #1 and #9, each corrected in place below after verification found it
recorded.

| #  | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Family         | Consumer impact                                                                                                                                                                                                                                                                                                  |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | **Keyed-service surface** — **correction: `[recorded]`, not silent.** `docs/decisions.v2.md` §85 ("Keyed services as token-key composition") is an owner-approved design for `IKeyedServiceProvider`/`ServiceKeyAttribute`/`ServiceKeyLookupMode`/`FromKeyedServicesAttribute`, the `AddKeyed*` overload ladder, `TryAddKeyed*`/`RemoveAllKeyed`, `GetKeyedService*`, and `IServiceProviderIsKeyedService`, and has since landed.                                                                      | di / di.core   | None — a port path exists and is tracked at §85, superseding the narrower `ActivatorUtilities` note (decisions.md §56) this row previously leaned on.                                                                                                                                                            |
| 2  | **`ME.Http` has no package and no tracking issue at all**                                                                                                                                                                                                                                                                                                                                                                                                                                              | cross-family   | `Http` is a first-class node in the target family set named in decisions.md §0 and present in the dependency graph, yet zero code exists and no issue scopes it. A consumer building anything HTTP-client-integrated has no starting point and no signal that this is even planned.                              |
| 3  | **Provider-injection wiring in `addLogging`** — **RESOLVED (verified, no bug).** `addProvider` registers under `LOGGER_PROVIDER_TOKEN`; the `addLogging`-built `LoggerFactory` is injected the aggregated `Array<ILoggerProvider>` collection and fans out to every provider — landed PR #162 / §62                                                                                                                                                                                                    | logging        | Not a functional bug. Verified end-to-end (`tests/logging.test/test/add-logging.test.ts` + a fresh repro): a fake provider added via `addLogging(b => b.addProvider(...))` receives log output. The alarm was seeded by a stale in-source `addProvider` comment citing a #75 deferral; corrected in this change. |
| 4  | **`config.env` drops the reference's connection-string prefix mapping** (`*CONNSTR_`-prefixed variables → `ConnectionStrings:*` / `*_ProviderName` keys)                                                                                                                                                                                                                                                                                                                                               | config.env     | Environment variables using the reference's hosting-platform connection-string convention are silently dropped instead of remapped — a consumer relying on that convention loses the keys entirely with no error.                                                                                                |
| 5  | **`config.json`'s parser accepts a top-level JSON array**, where the reference strictly requires an object root and rejects anything else                                                                                                                                                                                                                                                                                                                                                              | config.json    | Behavioral loosening with no recorded rationale — a malformed config file the reference would reject outright is silently accepted and parsed, which can mask a bad file rather than surface it.                                                                                                                 |
| 6  | **`ME.Configuration.FileExtensions`'s disposition is unclear** — no standalone `config.fileextensions` package exists, and nothing states whether it was intentionally collapsed into `config.json` or genuinely dropped                                                                                                                                                                                                                                                                               | config         | Blocks cleanly resolving the graph edge the in-flight physical-file-provider work (#180) needs; a future contributor can't tell "collapsed on purpose" from "forgotten" without re-deriving it from scratch.                                                                                                     |
| 7  | **`ActivatorUtilities` generic-`T` convenience overloads** (`CreateInstance<T>()`, `GetServiceOrCreateInstance<T>()`)                                                                                                                                                                                                                                                                                                                                                                                  | di.core        | Low impact — the non-generic core verbs are ported and thoroughly documented (§56); this reads as TS-generic ergonomics noise, not a functional hole.                                                                                                                                                            |
| 8  | **Async / source-gen options validators** — `IAsyncValidateOptions<T>`, `IAsyncStartupValidator` (only the sync `ValidateOnStart` path is ported), and the compile-time source-gen validator surface (`OptionsValidatorAttribute`, `ValidateObjectMembersAttribute`, `ValidateEnumeratedItemsAttribute` — no TS analog exists for the source-gen half)                                                                                                                                                 | options        | Low-to-moderate — no async options-validation path exists at all; a code comment justifies sync-only but doesn't cite a decision.                                                                                                                                                                                |
| 9  | **`NullLogger<T>`** (generic form) — **correction: `[recorded]`, not silent.** `decisions.md` §77 and `docs/libraries/logging.md` §2 both state it's a contested call resolved to no-op: `ILogger<TCategoryName>` is phantom-param, so `ILogger<T>` collapses structurally to `ILogger` and `NullLogger.instance` is already assignable to it for any `T`. Left at #9 only to keep the ranking's numbering stable for the cross-references elsewhere in this file, not because it's still an open gap. | logging        | None — subsumed by design, not an unrecorded hole.                                                                                                                                                                                                                                                               |
| 10 | **`MemoryCache`'s allocation-avoidance alt-lookup overloads** (span-keyed `TryGetValue`)                                                                                                                                                                                                                                                                                                                                                                                                               | caching.memory | Perf-shape only — the string-keyed hot path these optimize already has full functional coverage through the existing `get`/`tryGetValue`.                                                                                                                                                                        |

**Also flagged, lower materiality (no decisions.md/issue citation found for any of these):**

- `OptionsManager<T>` / `UnnamedOptionsManager<T>` (options) — the concrete DI-facing manager
  classes have no explicitly-named port counterpart; likely subsumed by
  `options.augmentations/assemble-options.ts` but unconfirmed structurally.
- `OptionsWrapper<T>` (options) — trivial static-value test helper, unported.
- `LoggerFactoryOptions` / `ActivityTrackingOptions` / `LoggingBuilderExtensions.Configure(...)`
  (logging) — entirely absent beyond an in-source comment; low practical impact since no
  activity/diagnostics-listener analog exists anyway.

---

## Record-keeping debt

Not code gaps — gaps in the record itself, which is exactly what lets code gaps stay silent.

- **The graph doc omits nodes that exist on disk in the reference source tree.**
  `ME.DependencyModel` and `HostFactoryResolver` were never entered into
  `docs/reference/me-extensions-dependencies.md`'s graph at all — no family audit could have
  caught them as gaps, because the audit worked from the graph, not the source tree.
- **`ME.Hosting.WindowsServices` and `ME.Hosting.Systemd`** (platform service-host lifetimes) are
  in neither the graph nor `decisions.md`. This is distinct from `logging.console`'s already-ported
  and already-recorded Systemd **formatter** (decisions.md, ~line 1960) — that's an unrelated,
  correctly-scoped piece of `logging.console`, not the host-lifetime package.
- **`ME.FileProviders.Embedded` is absent from the sparse reference checkout entirely** (there's no
  such directory under the vendored reference source at all — not merely unported), and that
  absence itself is unrecorded. Nothing distinguishes "deliberately excluded from the pulled
  reference set" from "nobody noticed it was missing." A one-line addendum next to §20/§73 would
  close this permanently.
- **Stale-but-open umbrella issues.** #76 ("caching: import ME.Caching") is still open despite the
  family being substantially complete per decisions.md §49/§60/§65 and four closed feature issues
  (#144/#147/#159/#164) — worth closing or re-scoping. #129 (a logging completeness audit) is
  genuinely still open and useful, but several items its own body names have since closed via
  §62/§63/#131.
- **#75's citation is doing double duty inconsistently.** It correctly gatekeeps the
  `ME.Logging.Debug`/`EventLog`/`EventSource`/`TraceSource` exclusion (its actual filed scope). But
  a code comment in `di.core` also cites #75 as the reason `TryAddEnumerable` is deferred — #75's
  own text never mentions `TryAddEnumerable`. That cross-reference looks stale or copy-pasted;
  retarget it to a dedicated issue or correct it to whatever issue was actually meant.

---

## Per-family findings

### Primitives

| Reference member                                                                                                                                                                                    | Status                                      | Class        | Evidence                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| `IChangeToken`, `ChangeToken.onChange` (collapsed to one signature), `CompositeChangeToken`, `CancellationChangeToken` (backed by `AbortSignal` instead of the reference's cancellation-token type) | ported, with documented signature collapses | `[recorded]` | §0/§58; `CompositeChangeToken` closed #77 via #153                       |
| `StringValues`, `StringSegment`, `StringSegmentComparer`, `StringTokenizer`, the string-builder append helper for segments                                                                          | missing                                     | `[recorded]` | issue #42 (closed, YAGNI — deferred pending config or http needing them) |

**Zero silent gaps** — the single leaf package `ME.Primitives` is fully represented by
`libraries/primitives`, and every divergence found traces to a citation. One point worth owner
awareness rather than action: the port's `CompositeChangeToken` additionally fires its internal
latch on poll-detected change, a documented enhancement (§58) beyond the reference's polling being
silent to registered callbacks — a behavioral _addition_, not a gap.

### Options

| Reference package             | Port                    | Status                                                                                                                                                           |
| ----------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ME.Options`                  | `options`               | ported                                                                                                                                                           |
| `ME.Options.ConfigExtensions` | `options.augmentations` | ported                                                                                                                                                           |
| `ME.Options.DataAnnotations`  | _(none)_                | `[recorded, thin]` — §4.2/§4.5 name a future `options.data-annotations` as the validation-richness escape hatch, but no dedicated issue scopes it as a work item |

| Reference member                                                                                                                                                | Status                                                 | Class                    | Evidence                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `IOptions<T>`/`IOptionsSnapshot<T>` → `IOptions<T>`; `IOptionsMonitor<T>.Get(name)` has **no analog at all** (named options are distinct registrations instead) | collapsed                                              | `[recorded]` intentional | §4.2 — the single biggest behavioral surface change for anyone porting reference code against named options |
| `IOptionsMonitorCache<T>`/`OptionsCache<T>`                                                                                                                     | missing (no manual `.TryRemove`/`.Clear` escape hatch) | `[recorded]`             | §4.5                                                                                                        |
| `IConfigureNamedOptions<T>`, `NamedValidateOptionsFilter<T>`                                                                                                    | missing                                                | `[recorded]`             | §4.2/§4.5 — moot once named options collapse to distinct registrations                                      |
| `OptionsManager<T>`/`UnnamedOptionsManager<T>` (concrete DI-facing manager classes)                                                                             | missing counterpart under that name                    | `[silent]`, UNVERIFIED   | likely subsumed by `assemble-options.ts`, not confirmed                                                     |
| `IAsyncValidateOptions<T>`, `IAsyncStartupValidator` (only the **sync** `IStartupValidator`/`validateOnStart` path is ported, §55)                              | missing                                                | `[recorded]`             | §76 — validation is sync-only by design; sync `IStartupValidator` stays IN                                  |
| `OptionsValidatorAttribute`/`ValidateObjectMembersAttribute`/`ValidateEnumeratedItemsAttribute` (compile-time source-gen validator surface)                     | missing                                                | `[recorded]`             | §76/§4.4 — no TS analog for source generation; future `options.data-annotations` satellite                  |
| `OptionsWrapper<T>`                                                                                                                                             | missing                                                | `[silent]`, low impact   | trivial static-`IOptions` test helper                                                                       |
| `ValidateOptionsResult`/`ValidateOptionsResultBuilder`                                                                                                          | ported, drops the DataAnnotations-specific overloads   | `[recorded]`             | decisions.md line 2240                                                                                      |
| `OptionsBuilder<T>` and its extensions (Configure/PostConfigure/Validate/ValidateOnStart)                                                                       | collapsed onto the DI manifest                         | `[recorded]`             | `options.augmentations/options-builder-augmentations.ts`                                                    |
| `OptionsFactory<T>` as a DI-swappable `IOptionsFactory<T>` seam                                                                                                 | concrete class, no interface/token                     | `[recorded]`             | §76 — YAGNI, no consumer needs factory substitution                                                         |
| config-bind reimplements a structural merge instead of reusing `config`'s bind primitive                                                                        | ported, architecturally divergent (deep-merge compose) | `[recorded]`             | §76 — compose-not-clobber is an addition beyond reflective `Bind`; issue #70                                |

Issue #128 ("options: alignment pass — audit + close type-set/reachability gaps") landed §76:
the public type-set already corresponds to the reference's, the sole reachability gap
(bare-form `postConfigure` through the manifest surface) is now covered end-to-end, and the
previously `[silent]` divergences above (sync-only validation, `OptionsFactory` not a DI seam,
deep-merge config bind) are recorded.

### Diagnostics

| Reference package                                      | Port               | Status                                                                                        |
| ------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------- |
| `ME.Diagnostics.Abstractions`                          | `diagnostics.core` | ported                                                                                        |
| `ME.Diagnostics`                                       | `diagnostics`      | ported                                                                                        |
| `ME.Diagnostics.HealthChecks`                          | —                  | not in scope — lives outside the sparse reference checkout and outside the graph doc entirely |
| Resource-monitoring / exception-summarization packages | —                  | `[recorded]` §17 — YAGNI, no concrete consumer                                                |

**No silent gaps.** Every missing member — the listener/subscription runtime (no meter/instrument/
activity-source analog: `Initialize`/`InstrumentPublished`/`MeasurementsCompleted`, the typed
measurement handlers, `ActivityListenerBuilder`'s delegate params collapsed to `unknown`), the
console/debug listener family, and the `AddListener(provider, action)` tracing overload — traces to
§17 (issue #74) or its follow-ons §61/§66. This is the most self-documented family in the audit;
even the one borderline item (the tracing overload isn't named explicitly in §17's prose, only in
an inline source comment) is covered by the general listener-runtime deferral, not left dangling.
One open, explicitly-tracked follow-up: `CompositeChangeToken` duplication between
`options.augmentations` and `diagnostics` hasn't yet been promoted to `primitives` the way §58 did
for `fileproviders.composite` — flagged in §17, not silent, just not yet done.

### Dependency injection (di.core / di)

Both reference packages (`ME.DependencyInjection.Abstractions` → `di.core`,
`ME.DependencyInjection` → `di`) exist; no missing packages.

| Reference member                                                                                                                                                                                                                                                                                                                                                    | Status                                                                    | Class                              | Evidence                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IServiceProvider`/`IResolver`/`IScopeFactory`/`IRequiredResolver`/`IServiceQuery`, `ServiceCollectionDescriptorExtensions` (`TryAdd*`, `Replace`, `RemoveAll`), `ActivatorUtilities` core verbs, `EmptyServiceProvider`, `ISupportRequiredService`→`IRequiredResolver`, `IServiceProviderIsService`→`IServiceQuery`, `IServiceProviderFactory<T>`, `ObjectFactory` | ported                                                                    | —                                  | full parity; §10/§27/§23/§56/§24                                                                                                                          |
| `TryAddEnumerable`                                                                                                                                                                                                                                                                                                                                                  | missing                                                                   | `[recorded, mistargeted citation]` | in-file comment cites #75 — see [Record-keeping debt](#record-keeping-debt)                                                                               |
| `[ActivatorUtilitiesConstructor]` (preferred-constructor marking)                                                                                                                                                                                                                                                                                                   | not ported                                                                | `[recorded]`                       | §56                                                                                                                                                       |
| `ActivatorUtilities.CreateInstance<T>()`/`GetServiceOrCreateInstance<T>()` generic-`T` overloads                                                                                                                                                                                                                                                                    | missing                                                                   | `[silent]`, low                    | non-generic core is documented; the generic sugar isn't called out either way                                                                             |
| **Entire keyed-service surface** (`IKeyedServiceProvider`, `ServiceKeyAttribute`, `ServiceKeyLookupMode`, `FromKeyedServicesAttribute`, `AddKeyed*`, `TryAddKeyed*`/`RemoveAllKeyed`, `GetKeyedService*`, `IServiceProviderIsKeyedService`)                                                                                                                         | missing                                                                   | `[silent]`                         | see [Alarm §1](#alarm--silent-gaps) — recorded exclusion exists only for `ActivatorUtilities`'s own parameter-matching (§56), not the rest of the surface |
| `IServiceScope`/`IServiceScopeFactory`/`AsyncServiceScope` (two-object shape)                                                                                                                                                                                                                                                                                       | collapsed into `IServiceProvider`                                         | `[recorded]`                       | §10                                                                                                                                                       |
| `IServiceCollection` / `ServiceCollectionServiceExtensions` (lifetime-verb ladder)                                                                                                                                                                                                                                                                                  | collapsed into `add(...).as(scope)`                                       | `[recorded]`                       | §11, §28, §56                                                                                                                                             |
| `DefaultServiceProviderFactory` (as a bare-metal named class)                                                                                                                                                                                                                                                                                                       | not directly ported                                                       | `[recorded]`                       | superseded functionally by hosting's `useDefaultServiceProvider` (§67)                                                                                    |
| Internal call-site resolution engine (compiled/dynamic/IL-emit engines, call-site chains, expression-tree building)                                                                                                                                                                                                                                                 | not ported — replaced by an original scope-frame + producer-record engine | `[recorded]`                       | §9/§11/§12 — explicit from-scratch reimplementation, not part of the public-surface mirror contract                                                       |
| Internal event-tracing/diagnostics tooling for the resolution engine                                                                                                                                                                                                                                                                                                | not ported                                                                | `[recorded, implicitly]`           | internal-only, no public surface; out of the API-mirror scope by the family's own framing                                                                 |

### Hosting

| Reference package            | Port           | Status                                                                                                      |
| ---------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| Hosting.Abstractions         | `hosting.core` | ported                                                                                                      |
| Hosting                      | `hosting`      | ported                                                                                                      |
| `ME.Hosting.Systemd`         | —              | not ported — `[silent-adjacent]`; see [Record-keeping debt](#record-keeping-debt)                           |
| `ME.Hosting.WindowsServices` | —              | not ported — `[silent-adjacent]`; same, low materiality (no Windows-service consumer anywhere in the graph) |

| Reference member                                                                                                                                                                                                    | Status                                                      | Class                           | Evidence                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `IHost`, `IHostedService`/`IHostedLifecycleService`, `IHostBuilder`, `IHostApplicationBuilder`, `IHostEnvironment`/env extensions, `Environments`, `IHostApplicationLifetime`, `HostBuilderContext`, `HostDefaults` | ported at full parity                                       | —                               | matches reference member-for-member                                                                              |
| `IHostBuilder`'s no-context convenience wrappers for the three core-interface members                                                                                                                               | intentionally omitted                                       | `[recorded]`                    | §67 — a TS arity constraint, not an omission                                                                     |
| `EnvironmentName`, `IHostingEnvironment`, `IApplicationLifetime` (all marked obsolete forwards in the reference)                                                                                                    | missing                                                     | `[silent]`, trivially justified | porting deprecated-in-the-reference APIs would be pure YAGNI                                                     |
| `HostAbortedException`→`HostAbortedError`                                                                                                                                                                           | ported, collapsed 3-constructor → `(message?, innerError?)` | `[recorded]`                    | §67                                                                                                              |
| `HostBuilder`, `HostApplicationBuilder` (incl. `.asHostBuilder()`), `Host` static factory, `HostOptions`, `BackgroundService`, `ConsoleLifetime`/`ApplicationLifetime`/`HostingEnvironment`                         | ported at full parity                                       | —                               | §67, §68                                                                                                         |
| `AddHostedService<T>()` + factory overload                                                                                                                                                                          | ported both                                                 | `[recorded]`                    | §67                                                                                                              |
| `UseDefaultServiceProvider`'s context-taking overload                                                                                                                                                               | missing                                                     | `[recorded]`                    | §68 — explicit residual-open-item, revisit only if a consumer needs the context                                  |
| Pluggable container-factory adapter plumbing                                                                                                                                                                        | not separately ported                                       | `[recorded]`                    | §24/§67 — single-container model has no factory seam; `HostBuilderAdapter` + a `WeakMap` side channel substitute |

`hosting.browser` has no reference counterpart at all — a deliberate browser-hosting addition,
recorded at §69, not part of this audit's gap surface.

### Configuration

| Reference package                  | Port                 | Status                                                                                                     |
| ---------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Configuration.Abstractions         | `config.core`        | ported                                                                                                     |
| Configuration                      | `config`             | ported                                                                                                     |
| Configuration.Json                 | `config.json`        | ported                                                                                                     |
| Configuration.EnvironmentVariables | `config.env`         | ported                                                                                                     |
| Configuration.CommandLine          | `config.commandline` | ported                                                                                                     |
| Configuration.FileExtensions       | —                    | `[silent]` — see [Alarm §6](#alarm--silent-gaps)                                                           |
| Configuration.Ini                  | —                    | `[in-flight]`                                                                                              |
| Configuration.Xml                  | —                    | `[in-flight]`                                                                                              |
| Configuration.Binder               | —                    | `[recorded]` owner-excluded; `ConfigurationKeyNameAttribute`/`ConfigurationIgnoreAttribute` tracked at #87 |
| Configuration.UserSecrets          | —                    | `[recorded]` owner-excluded                                                                                |
| KeyPerFile                         | —                    | `[recorded]` non-goal, absent from the checkout entirely                                                   |

| Reference member                                                                                                                                                                     | Status                                                                                                   | Class                         | Evidence                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| `IConfig`/`IConfigBuilder`/`IConfigManager`/`IConfigProvider`/`IConfigRoot`/`IConfigSection`/`IConfigSource`, `ConfigurationPath`, `ConfigDebugViewContext`, chained-config wrapping | ported at full parity                                                                                    | —                             |                                                                           |
| `ConfigExtensions.Add<TSource>`                                                                                                                                                      | missing                                                                                                  | `[recorded]`                  | #83                                                                       |
| `ConfigurationKeyNameAttribute`/`ConfigurationIgnoreAttribute`                                                                                                                       | missing                                                                                                  | `[recorded]`                  | #87 (Binder-family, owner-excluded)                                       |
| `ConfigManager` implementing a disposal contract (cascading to providers)                                                                                                            | missing                                                                                                  | `[recorded]`                  | #81 — a real resource-leak risk once a scoped/torn-down manager is needed |
| Copy-on-write reference-counted provider list                                                                                                                                        | not ported                                                                                               | `[recorded]`                  | §52; `ConfigManager.ts` header comment                                    |
| `IConfigBuilder.Properties`/`Sources` as fully mutable collections (insert/remove/index-set triggering rebuild)                                                                      | narrowed to append-only                                                                                  | `[recorded]`                  | #82                                                                       |
| `ConfigProvider`'s backing store as a reassignable dictionary with a null/empty-string distinction                                                                                   | `data` is read-only, coerces null → `""`                                                                 | `[recorded]`                  | #86 — will block a faithful Ini/Xml port's reassignment idiom             |
| A `TryGetValue`-style section helper                                                                                                                                                 | missing                                                                                                  | `[recorded]`                  | #84                                                                       |
| `AddJsonFile`'s file-provider and reload-on-change overloads                                                                                                                         | only path+optional ported                                                                                | `[in-flight]`                 | depends on the file-provider/`FileExtensions` work, #180                  |
| JSON parser's root-type strictness (reference throws on non-object root)                                                                                                             | port also accepts a top-level array                                                                      | `[silent]`                    | see [Alarm §5](#alarm--silent-gaps)                                       |
| Duplicate-sibling-key throw                                                                                                                                                          | unreachable by construction (`JSON.parse` folds duplicate keys)                                          | ported, documented divergence | not a gap                                                                 |
| `config.env`'s connection-string prefix special-casing                                                                                                                               | entirely missing                                                                                         | `[silent]`                    | see [Alarm §4](#alarm--silent-gaps)                                       |
| `AddEnvironmentVariables` overloads, `DefaultTransformation`/`ColonAndDotTransformation`                                                                                             | ported                                                                                                   | —                             |                                                                           |
| `AddCommandLine` overloads, switch-mapping parse semantics                                                                                                                           | ported, with a documented fail-loud rewrite vs. the reference's silent-ignore on unmapped/missing values | ported, documented divergence |                                                                           |

### File providers

| Reference package               | Port                      | Status                                                                                                                   |
| ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ME.FileProviders.Abstractions` | `fileproviders.core`      | ported, 100% member parity                                                                                               |
| `ME.FileProviders.Composite`    | `fileproviders.composite` | ported, 100% member parity                                                                                               |
| `ME.FileProviders.Physical`     | `fileproviders.physical`  | **landed** (#184) — was `[in-flight]` at audit time                                                                      |
| `ME.FileSystemGlobbing`         | —                         | `[recorded]` §20 — not ported, pulled in only as a Physical-provider dependency, tracked as a rider on the physical port |
| `ME.FileProviders.Embedded`     | —                         | absent from the reference checkout entirely; see [Record-keeping debt](#record-keeping-debt)                             |

No member-level gaps found in either shipped package (`IFileProvider`/`IFileInfo`/
`IDirectoryContents`, the null-object types, `CompositeFileProvider`/`CompositeDirectoryContents`
including cross-provider `watch` via `CompositeChangeToken`, closed at §58/#153 — closing #77).
Physical + globbing were audited only at the package level per the assignment framing (branch
existed, not yet merged at snapshot time) — now landed; a fresh member-level pass over
`fileproviders.physical` is the natural next step if one hasn't happened since.

### Caching

| Reference package                           | Port             | Status                                                                                                                                                |
| ------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ME.Caching.Abstractions`                   | `caching.core`   | ported                                                                                                                                                |
| `ME.Caching.Memory`                         | `caching.memory` | ported                                                                                                                                                |
| Hybrid concrete tiered-cache implementation | —                | no reference project exists in the checkout at all (abstractions-only upstream); the abstractions-only port is already at reference parity, not a gap |

| Reference member                                                                                                                                                                                                                              | Status                                       | Class        | Evidence                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------ | ------------------------------------------------------------------- |
| `IMemoryCache`, `ICacheEntry`, `CacheExtensions`, `MemoryCacheEntryExtensions`, `IDistributedCache` (many-implementers, no interface merge by design), `DistributedCacheExtensions`/`DistributedCacheEntryExtensions`, `Hybrid/` abstractions | ported at full member parity                 | —            | §28/§38/§42/§48/§49/§60                                             |
| `MemoryCache`'s span-keyed `TryGetValue` alt-lookup overloads                                                                                                                                                                                 | not ported                                   | `[silent]`   | see [Alarm §10](#alarm--silent-gaps)                                |
| `IBufferDistributedCache`                                                                                                                                                                                                                     | not ported                                   | `[recorded]` | §60 — its purpose is a pooled-buffer vocabulary with no analog here |
| Meter/observable-counter metrics hooks on `MemoryCache`                                                                                                                                                                                       | not ported                                   | `[recorded]` | §17 — no meter/instrument analog exists anywhere in the port        |
| `addMemoryCache`/`addDistributedMemoryCache`                                                                                                                                                                                                  | ported through a real `IOptions<T>` pipeline | —            | §65                                                                 |

Issue #76 ("caching: import ME.Caching") is stale-but-open — see
[Record-keeping debt](#record-keeping-debt).

### Logging

| Reference package                                    | Port                     | Status                                                                                                     |
| ---------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Logging.Abstractions                                 | `logging.core`           | ported                                                                                                     |
| Logging (impl)                                       | `logging`                | ported                                                                                                     |
| Logging.Configuration                                | `logging.config`         | ported, full parity (§54)                                                                                  |
| Logging.Console                                      | `logging.console`        | ported, full parity (§53)                                                                                  |
| Logging.Debug / EventLog / EventSource / TraceSource | —                        | `[recorded]` #75 excludes; #91 tracks re-adding Debug/EventSource once hosting's `configureDefaults` grows |
| _(no reference counterpart)_                         | `logging.browserconsole` | port-only addition, §69 — deliberate browser-hosting piece                                                 |

| Reference member                                                                                                                                                                                                                                                                                                | Status                                                     | Class        | Evidence                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `ILogger`/`ILoggerFactory`/`ILoggerProvider`/`ILoggingBuilder`/`IExternalScopeProvider`, `EventId`, `LogLevel`, `LogEntry<TState>`, provider-alias marking (decorator-free), `IBufferedLogger`/`BufferedLogRecord`, `LoggerMessage.define`/`defineScope`, structured formatted-values, `ILogger<T>`/`Logger<T>` | ported at full parity                                      | —            | §62/§63                                                                                   |
| The compile-time source-gen half of `LoggerMessage` (the attribute-driven input)                                                                                                                                                                                                                                | not ported                                                 | `[recorded]` | §63 — stays out of scope, no TS analog                                                    |
| `NullLogger<T>` (generic form)                                                                                                                                                                                                                                                                                  | not a gap — phantom-param `ILogger<T>` already subsumes it | `[recorded]` | `decisions.md` §77, `docs/libraries/logging.md` §2; see [Alarm §9](#alarm--silent-gaps)   |
| `Logger`/`LoggerFactory` fan-out, `LoggerFilterOptions`/rule selection actually consulted at log time, external scope provider                                                                                                                                                                                  | ported                                                     | —            | §62                                                                                       |
| `SetMinimumLevel`/`AddProvider`/`ClearProviders`                                                                                                                                                                                                                                                                | ported, all real (no stubs)                                | —            | §62                                                                                       |
| `LoggingBuilderExtensions.Configure(Action<LoggerFactoryOptions>)`, `ActivityTrackingOptions`                                                                                                                                                                                                                   | missing                                                    | `[silent]`   | no citation beyond an in-source comment; low practical impact (no Activity analog exists) |
| Registered providers being consumed by the `LoggerFactory` that `addLogging()` builds                                                                                                                                                                                                                           | ported, no gap — verified no bug                           | `[verified]` | §62; verified — see [Alarm §3](#alarm--silent-gaps); stale in-source comment corrected    |
| `logging.config` (`ILoggerProviderConfig(Factory)`, `LoggerProviderConfigureOptions`, `LoggerProviderOptionsChangeTokenSource`, `LoggerFilterConfigureOptions`, `AddConfiguration`)                                                                                                                             | ported, no gaps found                                      | —            | §54                                                                                       |
| `logging.console` (formatters, ANSI colors, background-queue processor vs. the reference's dedicated writer thread)                                                                                                                                                                                             | ported, full parity                                        | —            | §53                                                                                       |

Issue #129 (a logging completeness audit) is genuinely open and still useful; #75 is
stale-but-still-correctly-scoped for the Debug/EventLog/EventSource/TraceSource exclusion — see
[Record-keeping debt](#record-keeping-debt) for both.

---

## Confirmed non-goals

Re-confirmed by the audit as properly recorded — not raised again here as gaps:

- The diagnostics **listener/subscription runtime** (no meter/instrument/activity-source analog) —
  §17, issue #74.
- **Binder** attribute-driven configuration binding and **user-secrets** support — owner-excluded.
- **`StringValues`/`StringSegment`** and their supporting types — issue #42 (closed, YAGNI, deferred
  pending config or http needing them).
- **`LoggerMessage`'s compile-time source-gen half** (the attribute-driven input path) — §63, no TS
  analog for source generation.
