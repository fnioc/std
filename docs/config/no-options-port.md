> ⚠️ **SUPERSEDED (see [`../decisions.md`](../decisions.md) §4).** This documented the original decision *not* to port ME.Options. That decision has been **reversed**: we are defining our own `@rhombus-std/options` family. The analysis below is retained for its accurate breakdown of what MEO does, but its conclusion ("we are not porting MEO") no longer holds — the load-bearing reason it missed is that DI deals in *services, not DTOs*, and (per the corrected resolution semantics) the port does not give per-scope config freshness for free.

---

> Imported from `fnioc/config` during the `@rhombus-std` consolidation; package names and `packages/*` paths updated to the monorepo layout, and the live-reload issue reference updated to its transferred number (#6).

---

# Decision: we are not porting MEO

Status: decided. Revisit only if a real, concrete use case surfaces that
the mapping below doesn't cover.

> Acronym key used throughout: MEC = the upstream configuration library,
> MEO = the upstream options layer, MEO.CfgExt = its configuration-extensions
> satellite, MEO.DataAnn = its DataAnnotations satellite, MECB = the
> upstream configuration binder.

## TL;DR

`MEO` is not a configuration feature — it's a dependency-injection
convenience layer built on top of `MEC`. Every capability it adds exists to
amortize the upstream runtime's reflection and integrate typed config into
a DI container's object lifetimes. `@rhombus-std/config` has neither: types
are erased at runtime in TypeScript, and the port is deliberately DI-free.
Once those two premises are gone, Options' reason to exist goes with them.
The one genuinely general-purpose capability it wraps — live reload —
isn't even an Options concept; it belongs to `IConfiguration` itself, and
it's already tracked as a config-side feature (issue #6).

We are extending `@rhombus-std/config` with the two config-shaped pieces that
actually cover Options' real use cases — live reload (issue #6) and a
post-configure hook — instead of porting Options.

## What Options actually is (verified against the upstream reference repo)

Reading through the upstream reference repo's `MEO` source and its
configuration-binding satellite package confirms the shape:

- **`services.Configure<TOptions>(config)` is reflection-based binding,
  end to end.** The call chain is `Configure<T>(config)` →
  `Configure<T>(name, config)` → `Configure<T>(name, config,
  configureBinder)`, which registers a
  `NamedConfigureFromConfigurationOptions<TOptions>` whose `Configure`
  body is literally `config.Bind(options, configureBinder)`. `Bind` lives
  in `MECB` and is decorated with `[RequiresDynamicCode]` /
  `[RequiresUnreferencedCode]` — its own doc comments say binding
  "requires generating dynamic code at runtime, for example instantiating
  generic types" and that "the trimmer cannot statically analyze the
  object's type." It uses `Activator.CreateInstance` and
  `Type.GetProperties()` to hydrate a POCO. This is exactly the cost
  Options' accessor types exist to pay once and cache.
- **The three accessor types are three different DI lifetimes over that
  same reflective bind, nothing else.** `AddOptions()` registers:
  - `IOptions<T>` → `UnnamedOptionsManager<T>`, **singleton** — bound
    once, cached for the app's lifetime.
  - `IOptionsSnapshot<T>` → `OptionsManager<T>`, **scoped** — re-bound
    once per DI scope (a request in the reference web stack, typically), and the one
    that supports `Get(name)` for named options.
  - `IOptionsMonitor<T>` → `OptionsMonitor<T>`, **singleton** — cached via
    `OptionsCache<T>.GetOrAdd`, but invalidated and recomputed whenever
    its change token fires, with an `OnChange(Action<TOptions, string?>)`
    subscription API.
  - All three ultimately go through `IOptionsFactory<T>.Create(name)`,
    which runs `_setups` (`Configure`) → `_postConfigures`
    (`PostConfigure`) → `_validations` (`IValidateOptions<T>`), collecting
    every validation failure into one `OptionsValidationException` before
    returning (or throwing).
- **Live reload is `IConfiguration`'s feature, not Options'.**
  `OptionsMonitor<T>`'s constructor wires each
  `IOptionsChangeTokenSource<T>` via `ChangeToken.OnChange(source.GetChangeToken,
  InvokeChanged, source.Name)`. The concrete source,
  `ConfigurationChangeTokenSource<T>`, implements `GetChangeToken()` as:

  ```
  public IChangeToken GetChangeToken() => _config.GetReloadToken();
  ```

  That's it — the "live" in "live options" is `IConfiguration.GetReloadToken()`.
  `IOptionsMonitor<T>` only adds: catch the token firing, re-run the same
  reflective bind, and notify subscribers.
- **Named options** are `Get(string? name)` on `IOptionsSnapshot<T>` /
  `IOptionsMonitor<T>`, where `name == null` maps to `Options.DefaultName`
  (`""`). There's no separate binding mechanism for named vs. default —
  it's the same `Configure(name, ...)` registration keyed by string, and
  `IOptionsFactory<T>.Create(name)` just threads that key through.
- **Validation** is `IValidateOptions<T>.Validate(name, options) →
  ValidateOptionsResult`, run by the factory after every `Configure` and
  `PostConfigure` for that name, with all failures aggregated into one
  exception. `MEO.DataAnn`'s `DataAnnotationValidateOptions` is one
  built-in implementation: reflection over `[Required]`-style attributes
  via `Validator.TryValidateObject`, with `[ValidateObjectMembers]` /
  `[ValidateEnumeratedItems]` driving recursive validation of nested
  properties and collections. `ValidateOnStart` (`OptionsBuilderExtensions`
  / `IStartupValidator`) is a thin convenience that forces eager
  resolution of every registered options type at host startup instead of
  lazily on first access — same validation path, different trigger point.
- **`IPostConfigureOptions<T>.PostConfigure(name, options)`** is
  documented to run after all `IConfigureOptions<T>` for that name have
  applied — confirmed by the factory's ordering (`_setups` fully, then
  `_postConfigures`). It's a "run this after binding" hook, nothing more.
- **The `MECB` source generator** (`ConfigurationBindingGenerator`)
  physically lives inside the package itself (`MECB/gen/`), not in `MEO`.
  It's a Roslyn incremental generator that emits static, reflection-free
  binding code as a trim/Native-AOT-safe substitute for
  `ConfigurationBinder.Bind`'s runtime reflection. Its existence and
  location confirm it: compile-time binding is a _Configuration_-binder
  concern, not an Options concern.

Every one of these was checked directly against source in the upstream
reference repo, not assumed from memory — see the file list in the
Sources section below.

## Why none of it needs a TypeScript port

Two premises hold up the whole Options design, and both are absent here:

1. **Reflection amortization.** The upstream runtime's reflection
   (`Activator.CreateInstance`, `Type.GetProperties`) is comparatively
   expensive and something you want to pay once and cache — hence
   `IOptions<T>` as a memoized singleton. TypeScript types are erased at
   runtime; there is no reflective bind to amortize.
   `bindConfig<T>(config, schema, opts)` (`libraries/config/src/bind.ts`)
   walks an explicit, compile-time-checked `SchemaFor<T>` against
   `IConfiguration` — cheap by construction, with nothing worth caching
   behind an accessor type.
2. **DI-container lifetime integration.** `IOptions`/`IOptionsSnapshot`/
   `IOptionsMonitor` are three answers to "what should this look like when
   resolved from a container at singleton / scoped / monitored lifetime."
   `@rhombus-std/config` has no container to integrate with — it's
   constructor-injectable, not DI-framework-bound, by design. There is no
   scope for `IOptionsSnapshot` to be _scoped to_.

Once those two are gone, each remaining Options capability reduces to
something either already shipped or already a _config_ concern:

| Options capability                                                 | Upstream mechanism (verified)                                                                                                                                                                | Why it doesn't need an Options-shaped port here                                                                                                                                                                                                                                                                             | Covered by                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typed binding (`Configure<T>(config)`)                             | `config.Bind(options, configureBinder)` → `ConfigurationBinder`, reflection-based (`Activator.CreateInstance`, `Type.GetProperties`)                                                         | No runtime reflection over erased TS types; binding is already explicit and cheap                                                                                                                                                                                                                                           | `bindConfig<T>()` — shipped, `libraries/config/src/bind.ts`                                                                                                                                                                                                                                                                |
| `IOptions<T>` (singleton, computed once)                           | `UnnamedOptionsManager<T>` registered singleton in `AddOptions()`                                                                                                                            | Nothing to amortize; no container to register a singleton in                                                                                                                                                                                                                                                                | Call `bindConfig()` once at startup, hold the result                                                                                                                                                                                                                                                                      |
| `IOptionsSnapshot<T>` (scoped, named)                              | `OptionsManager<T>` registered scoped; `Get(name)`                                                                                                                                           | "Scoped" is a DI-container lifetime from the reference web stack; no equivalent scope exists in a DI-free library                                                                                                                                                                                                                          | N/A                                                                                                                                                                                                                                                                                                                       |
| `IOptionsMonitor<T>` + `OnChange`                                  | `OptionsMonitor<T>`, singleton; change token sourced from `ConfigurationChangeTokenSource.GetChangeToken() => _config.GetReloadToken()`; re-binds + notifies on fire                         | The live part is 100% `IConfiguration`'s own reload token; Options only adds a typed re-bind-and-notify wrapper around it                                                                                                                                                                                                   | Issue [#6](https://github.com/fnioc/std/issues/6) (live-reload / change tokens) — `getReloadToken`/`IChangeToken` are already reserved (commented out) on `IConfiguration`/`IConfigurationProvider` in `libraries/config.core/src/interfaces.ts`; a thin re-bind-on-change helper can sit next to `bindConfig` once that lands |
| Named options (`Get(name)`, default `""`)                          | Same `Configure(name, ...)` registration keyed by string, threaded through `IOptionsFactory<T>.Create(name)`                                                                                 | Multiple named instances of one shape is just "bind against a different section"                                                                                                                                                                                                                                            | Already works: two independent `bindConfig<DatabaseConfig>()` calls against `"Database:Primary"` / `"Database:Replica"` — `examples/config.examples.basic/src/main.ts`                                                                                                                                                                    |
| Validation (`IValidateOptions<T>`, MEO.DataAnn, `ValidateOnStart`) | Factory runs `_setups` → `_postConfigures` → `_validations`, aggregates every failure into one `OptionsValidationException`; MEO.DataAnn variant reflects over `[Required]`-style attributes | `bindConfig` already aggregates every coercion/structural problem into one `ConfigBindError`; there's no MEO.DataAnn equivalent to reflect over in TS                                                                                                                                                                       | Structural validation shipped today (`bind.ts`); richer semantic/business-rule validation is a possible future `bindConfig` extension, not an Options port                                                                                                                                                                |
| `IPostConfigureOptions<T>.PostConfigure`                           | Runs strictly after all `Configure` calls for a name (confirmed by factory ordering)                                                                                                         | "Run a callback on the bound object after binding" is a `bindConfig` feature, not a DI concept                                                                                                                                                                                                                              | Parked TODO item: post-configure hook on `bindConfig`                                                                                                                                                                                                                                                                     |
| MECB source generator                                              | `ConfigurationBindingGenerator`, physically shipped inside `MECB/gen/` — emits static reflection-free binding for trim/AOT                                                                   | Confirms, by its own package location, that compile-time binding was always a Configuration-binder concern, not an Options one. `bindConfig` is already reflection-free by construction (explicit `SchemaFor<T>`); a future transformer would be about schema-authoring ergonomics, not eliminating reflection we never had | Parked: any future `schemaFor<T>` transformer is a Configuration-binder-shaped idea, tracked separately from this decision                                                                                                                                                                                                |

## What we're doing instead

Extend `@rhombus-std/config`, not port Options:

1. **Live reload / change tokens — issue [#6](https://github.com/fnioc/std/issues/6).**
   `IConfiguration.getReloadToken()` and the matching provider-level hook
   are already reserved in the type surface (commented out in
   `libraries/config.core/src/interfaces.ts`), waiting on a design. This is the
   one piece of Options that's worth having in spirit — but it belongs on
   `IConfiguration`, exactly where the upstream runtime puts it, with
   `bindConfig` (or a thin wrapper around it) re-binding when the token
   fires.
2. **Post-configure hook.** A small "run this after the bind" callback
   option on `bindConfig`, matching what `IPostConfigureOptions<T>` does
   without any of the DI machinery around it. Already parked in
   `docs/TODO.md`, no design yet.

Named options and validation need no new work: named options already fall
out of section-scoped `bindConfig` calls, and structural validation
already exists via `ConfigBindError`'s aggregation.

## Sources checked

All directly read from the upstream reference repo (`main` branch) for
this decision, not recalled from memory:

- `MEO/src/IOptions.cs`
- `MEO/src/IOptionsSnapshot.cs`
- `MEO/src/IOptionsMonitor.cs`
- `MEO/src/OptionsMonitor.cs`
- `MEO/src/OptionsFactory.cs`
- `MEO/src/OptionsServiceCollectionExtensions.cs`
  (`AddOptions()` registrations and lifetimes)
- `MEO/src/IValidateOptions.cs`
- `MEO/src/IPostConfigureOptions.cs`
- `MEO.CfgExt/src/OptionsConfigurationServiceCollectionExtensions.cs`
- `MEO.CfgExt/src/NamedConfigureFromConfigurationOptions.cs`
- `MEO.CfgExt/src/ConfigurationChangeTokenSource.cs`
- `MEO.DataAnn/src/DataAnnotationValidateOptions.cs`
- `MECB/src/ConfigurationBinder.cs`
- `MECB/gen/*` (existence/location of `ConfigurationBindingGenerator`)

And from this repo:

- `libraries/config/src/bind.ts` — `bindConfig`, `ConfigBindError`
- `libraries/config.core/src/interfaces.ts` — commented `getReloadToken()` /
  `IChangeToken` reservations
- `examples/config.examples.basic/src/main.ts` — `Database:Primary` / `Database:Replica`
  two-instance binding
