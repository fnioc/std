# Design decisions & requirements

Running record of load-bearing decisions for the `@rhombus-std` monorepo. **Append
here as decisions land — don't leave them only in conversation.** Each entry: the
decision, why, and status (issue/PR where relevant).

---

## 0. Mirror the ME dependency structure exactly, then collapse — governing

Replicate ME's package + dependency structure **exactly** — package-for-package,
edge-for-edge — and only **collapse** a distinction later, after the fact, once it's shown
unjustified in a TS / no-reflection / no-shared-framework context. **Do not pre-collapse.**

**Strict applies to the dependency graph** (package boundaries + edges) — that is non-negotiable.
The **API surface _within_ a package may deviate** where our scope system or TS/BUN justifies it
(e.g. §4.2 collapses IOptions+IOptionsSnapshot). Mirror faithfully on the first pass — **including
where it feels un-idiomatic in TS/BUN** — and collapse only after the fact.

Authoritative graph: [`reference/me-extensions-dependencies.md`](reference/me-extensions-dependencies.md).

Consequences already visible:

- **`@rhombus-std/primitives` is required** — the universal leaf (`IChangeToken`,
  `StringValues`). The live-reload / change-token mechanism (#6) belongs there, not in
  config/options.
- Target family set mirrors ME: Primitives, DependencyInjection(+Abstractions),
  Options(+ConfigurationExtensions), Configuration(+Abstractions/Binder/providers),
  Logging(+Abstractions/…), Diagnostics(+Abstractions), FileProviders(+…), Caching(+…),
  Hosting(+Abstractions), Http. Build incrementally; the structure is the target.
- **Extension methods → side-effect augmentations (first-pass directive).** Wherever ME defines
  an extension method (`AddOptions<T>` in `OptionsServiceCollectionExtensions`, `AddJsonFile` in a
  `*ConfigurationBuilderExtensions`, `AddConsole` in a `*LoggingBuilderExtensions`, …), create a
  **side-effect declaration-merging augmentation** in the **same mirrored package**, targeting our
  **mirror of the same type** it extends — **fluent, not free functions**. Config providers already
  do this (`declare module` on the `configuration-builder` subpath). For Options: `addOptions` /
  `configure` augment the DI builder from `@rhombus-std/options` (mirrors `OptionsServiceCollectionExtensions`
  in MEO); the config-source `configure(IConfiguration)` augments from `options.augmentations`
  (mirrors `OptionsConfigurationServiceCollectionExtensions`). This settles the earlier
  core-vs-satellite / fluent-vs-function question.
- Options accessor collapse (IOptions+IOptionsSnapshot → one `Options<T>`) is scope-justified — see §4.2.

---

## 1. DI is interface-first (MEDI parity) — #5, #2 · PR #27 (merged)

> **Superseded in part by §9.** §1 (and the package descriptions) framed `di.core`
> as a **types-only** abstractions substrate. §9 reverses that: `di.core` now ships
> the concrete registration builder `ServiceManifestClass` at runtime, mirroring the
> reference DI Abstractions package that carries the concrete `ServiceCollection`.
> The interface-first rule below is unchanged — public signatures still use the
> `ServiceManifest` / `ServiceProvider` interfaces.

Consumers program against **interfaces**, mirroring MEDI where you hold
`IServiceProvider`, never the concrete `ServiceProvider`.

- The public provider is the `ServiceProvider` **interface** (in `di.core`); the
  concrete impl is `ServiceProviderClass`. `build()` / `createScope()` return the
  interface.
- The abstraction interfaces `Resolver`, `ScopeFactory`, `ResolveScope`, `Lifetime`
  and the provider interface live in **`di.core`** (the MEDI.Abstractions analog),
  re-exported from `di` for back-compat.
- The transformer declaration-merges directly onto the `di.core` interfaces
  (`Resolver` / `AddBuilder` / `ServiceManifestBase`) — no empty carrier interfaces
  (they fail the same assignability check).
- **`di.core` is now a published dependency of `di`** (no longer inlined), required
  so the augmentation attaches to one shared `@rhombus-std/di.core` module identity —
  and correct per MEDI, where Abstractions is a published package the impl depends on.
- Transformer-active typecheck configs (`di.tests.integration` lint, the with-transformer
  example) consume di's **built `.d.ts`**, not source — matches real npm usage
  (consumers never compile di's source) and is what makes interface-first + core-only
  augmentation co-exist.

## 2. The transformer must never reference the di RUNTIME (hard invariant)

`@rhombus-std/di.transformer` may depend on `@rhombus-std/di.core` (**types /
abstractions**) only — **never** `@rhombus-std/di`. Asserted in `grammar.ts` ("the
transformer does not depend on di"); #2 moved the augmentation onto `di.core` to
satisfy it. Same rule for any config/options authoring transformer: it references
config **abstractions / binder**, emits registration calls into the user's code, and
never imports di.

## 3. Resolution semantics (load-bearing invariant)

A token resolves from the scope it is **registered** to, not the scope `resolve` is
called from. A resolve from scope `S` ancestor-walks up the chain to the frame that
owns that registration's lifetime; the instance lives / caches there. **Freshness is a
property of the registration lifetime, not the resolution site.** (Corrects an earlier
mistaken "resolve in a fresh scope = fresh value" claim.)

## 4. We ARE defining our own Options — reverses `config/no-options-port.md`

The original "no Options" decision leaned on premises that don't survive scrutiny.
Reasons to build it, premise-independent:

- **DI deals in services, not DTOs.** Registering a raw config DTO is a category smell;
  `Options<T>` is the config-as-service seam.
- Per §3, the port does **not** give per-scope config freshness for free — you must
  register at the scope you want, and there's no clean seam for it today.
- The scope system is **open-ended**, so — unlike MEO, which auto-registers
  `IOptions` / `IOptionsSnapshot` at fixed lifetimes — the developer must **explicitly
  register** Options at their chosen scope.

### 4.1 Package layout (mirror MEO's, incl. the dependency layering)

| reference                            | ours                                  | depends on                                                                               |
| ------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ME.Options` (MEO)                   | `@rhombus-std/options` — a 4th family | `@rhombus-std/di.core` (MEDI.Abstractions)                                               |
| `ME.Options.ConfigurationExtensions` | `@rhombus-std/options.augmentations`  | `options` + `@rhombus-std/config.core` (MEC.Abstractions) + config's `bindConfig` binder |

- **`options` core:** pure `Options<T>` (`{ readonly value: T; subscribe?(cb): Unsubscribable }`)
  - monitor/snapshot semantics. **Config-unaware** — knows only the DI abstractions,
    exactly like MEO → MEDI.Abstractions.
- **`options.augmentations`:** ALL the side-effect `declare module` augments live here —
  augments `di.core` (adds `addOptions<T>()` to the authoring surface) **and** config
  (section → `Options<T>` binding). Mirrors `Options.ConfigurationExtensions`, and it is
  the _extensions_ package — not core — that references the config abstractions.

### 4.2 Accessor model — collapse IOptions+IOptionsSnapshot (scope-justified); keep the monitor

> **Adopted** (per the strict-graph / free-API rule in §0): the singleton-vs-scoped accessor
> split is a fixed-lifetime reference-DI artifact; our open-ended scopes + registration-time lifetime
>
> - ancestor-walk (§3) erase it, so `IOptions` + `IOptionsSnapshot` collapse to **one `Options<T>`**
>   (lifetime chosen at registration). The **reactive `IOptionsMonitor` is orthogonal**
>   (change-notification, not lifetime) and stays a distinct capability, tied to `IChangeToken` / #6.
>   Package boundaries + deps remain exact ME (§4.1).

- **One** `Options<T>` type. `IOptions` vs `IOptionsSnapshot` is not two types — it is the
  **registration lifetime** (ancestor-walk, §3).
- `IOptionsMonitor` = the `subscribe?` capability, present only when the source is
  reload-capable (= issue #6).
- **Named options** = distinct registrations (tokens / sections), not a `.Get(name)` API.
- **Validation / post-configure** = at bind time (`bindConfig` aggregates into one
  `ConfigBindError`); a future `options.data-annotations` if richer validation is wanted.

### 4.3 Dependency invariants

- **di ⊥ config** — neither imports the other. The bridge lives only in
  `options.augmentations`.
- `options` → `di.core` only (config-unaware).
- Any `addOptions<T>` transformer → config binder only, **never di** (§2).

### 4.4 Naming (decided)

- Core: **`@rhombus-std/options`** (not `config.options`) — MEO is its own family.
- Bridge: **`@rhombus-std/options.augmentations`**.
- Future satellites: `options.configuration` (a stricter config-bridge split, if we want
  1:1 fidelity with `Options.ConfigurationExtensions`), `options.data-annotations`
  (validation).

### 4.5 Pipeline — build the full `OptionsFactory` shape (adopted, #41)

> **Adopted** (per §0's mirror-first rule): build the full MEO setup/validate pipeline in
> `@rhombus-std/options`. On `create<T>()`: make base → run configure steps → run
> post-configure steps → run validate checks → return. All slots do meaningful TS work and
> share one run-a-list mechanism, so the full shape is cheap.

**Supersedes** the "**Validation / post-configure = at bind time**" bullet of §4.2: config-bind
is a _pipeline participant_, not a replacement for the pipeline. In reference DI, config-bind
is itself a configure step (`NamedConfigureFromConfigurationOptions : IConfigureOptions`,
verified in source), so `bindConfig` is _one_ configure source among several — code defaults,
overrides, config bind — not a collapse of the whole configure/validate chain. §4.2's
collapse of the _accessor_ (`Options<T>`) is untouched; only its pipeline bullet is reversed.

Shape (one public type per kebab-case file, mirroring MEO's one-type-per-file layout):

- **`ConfigureOptions<T>`** — `configure(options)`. Composes the value from its sources; runs
  in registration order. The config-bind-as-a-configure-step wiring is #40's job, in
  `options.augmentations` — `options` core stays config-unaware (§4.1/§4.3).
- **`PostConfigureOptions<T>`** — `postConfigure(options)`. A guaranteed-last pass, after every
  configure step: the library/framework gets the final word before validation.
- **`ValidateOptions<T>`** → **`ValidateOptionsResult`** (`succeeded` / `skipped` / `failed`,
  with failure messages). Semantic rules beyond a binder's structural checks.
- **`OptionsFactory<T>`** — holds the step lists and runs the pipeline in `create()`. The base
  instance is injected as a `makeBase` function (TS has no reflective `Activator` analog).
- **`OptionsValidationError`** — aggregates the failures from every validate step into the one
  thrown error (`message` = failures joined by `"; "`).

Departures from the reference, both design-forced:

- **No name parameter on any step, and no name on `create()`.** Named options are distinct
  registrations here (§4.2), so a factory serves exactly one registration — there is no
  `IConfigureNamedOptions` branch to mirror.
- **No `OptionsCache<T>`.** Instance caching is a registration-lifetime concern in this design
  (§3): the container decides how long a resolved `Options<T>` lives, so a separate per-factory
  cache type has no place here.

YAGNI cut (per the #41 signoff): build the slots + factory; ship **no** concrete configurers or
validators until a consumer asks for one.

## 5. MEDI.Abstractions parity backlog (filed)

- **#22** [High] expose the registration surface as an interface (`IServiceCollection` parity).
- **#23** [Med] `isService` / `canResolve` query (`IServiceProviderIsService`).
- **#24** [Med] distinct scope boundary + make `Scope` internal (`IServiceScope`).
- **#25** [Low] non-throwing `tryResolve` (`GetService` vs `GetRequiredService`).

## 6. Open / not yet decided

- **Live-reload / monitoring (#6)** sub-decisions — _leaning_: type-driven opt-in;
  dependency-free structural observable (no rxjs); lazy / source-emits (C2) over a
  background file-watch (C1). **Not finalized.** Surfaces as the `Options<T>.subscribe?`
  capability (§4.2).
- Whether to split the config-bridge into `options.configuration` now vs. later.
- Explicit walk-through of the §2 transformer invariant with the team (pending; #27
  satisfies it for `di.transformer`).

## 7. White-box test-export pattern — sibling `tests/<lib>.test` packages, `internal/*` seam — #38

Each library's co-located tests move out into a sibling `tests/<lib>.test` package;
libraries ship `src/` only (no `test/` folder alongside `src/`).

- **White-box seam.** A library whose tests need to reach into `src/` (not just the
  public surface) adds an `internal/*` subpath to its **DEV** `exports`:

  ```jsonc
  "exports": {
    ".": { /* … */ },
    "./internal/*": {
      "source": "./src/*.ts",
      "bun": "./src/*.ts",
      "types": "./src/*.ts"
    }
  }
  ```

  `internal/` is a **virtual namespace** — there is no `internal/` folder on disk, the
  subpath pattern maps straight onto `src/*`. A white-box test imports
  `@rhombus-std/<lib>/internal/<module>` instead of a relative `../src/<module>` path.

  Benefits:
  - **Insulates tests from `src/` layout changes.** Moving a file under `src/` needs one
    explicit override entry (or a nested `"./internal/foo/*"` pattern that shadows the
    base wildcard — most-specific match wins) in the library's `package.json`; the test
    package's imports don't change.
  - **One greppable key to scrub** at publish time (`internal/*`), rather than hunting
    down relative `../src` imports across every test package.

- **Scrub with no new tooling.** Every package already ships a `publishConfig.exports`
  override that exposes only `dist`. Because `exports` is **encapsulating**, simply
  **omitting** `internal/*` from that publish override makes it non-importable by
  consumers — even though the `src/` files still ship inside the tarball. This is
  **pnpm-only**: `pnpm publish` (and `pnpm pack`) honor `publishConfig.exports`; other
  package managers don't rewrite `exports` at publish time. **pnpm must be the publish
  tool.** CI backstop: run `publint` against the packed tarball to catch any drift
  between dev and publish `exports`.

- **Black-box tests don't need `internal/*`.** A test package that only exercises a
  library's public surface (e.g. `di`'s) depends on the library as a plain
  `workspace:*` devDependency and imports it the normal way — no virtual subpath
  needed.

## 8. Live-reload (#6) settled — change-token model, no OS file-watching in v0

Settles the §6 open item: config's reactive shape mirrors MECA's `IChangeToken` /
`ConfigurationReloadToken` model exactly, using `primitives`' existing
`IChangeToken` + `ChangeToken.onChange` (not an `EventTarget`/`Observable` surface —
that's deferred, see below).

- **Dependency edge:** `config.core` (and `config`) take a workspace dependency on
  `primitives`, matching the reference graph (`reference/me-extensions-dependencies.md`)
  where `Configuration.Abstractions` → `Primitives`. `config.core`'s `IConfiguration`
  and `IConfigurationProvider` interfaces both gain `getReloadToken(): IChangeToken`.
- **Mechanism:** a `ConfigurationReloadToken` (this repo's `AbortController`-backed
  `IChangeToken`, living in `config` — not `primitives`, since it's a config-specific
  concept in the reference too) is single-fire: `onReload()` fires it, and the owner
  swaps in a fresh instance so the next change is observable too.
  - Each provider owns one; `ConfigurationProvider.onReload()` (protected) fires
    it — concrete providers call this once their `load()` has actually refreshed
    data. The base `load()` no-op never fires it (a provider with no reload
    capability, e.g. Memory, never does).
  - The root owns its own token, composed from every provider's via
    `ChangeToken.onChange` (subscribed once per provider at construction, after
    that provider's initial `load()`), AND fires directly at the end of its own
    `reload()`.
  - A section has no reload state of its own — `getReloadToken()` delegates to its
    root.
- **Scope guard — no OS file-watching in v0.** A provider's token fires only on an
  explicit `root.reload()` or a provider reporting its own data refresh (mirroring
  the reference's `FileConfigurationProvider.OnReload()` call after `Load()`) —
  nothing here polls a filesystem or wires `chokidar`/`fs.watch`. That capability
  belongs to a future file-providers family.
- **Immutability preserved.** Nothing here mutates an already-resolved value —
  `Options.watch`'s `getValue` re-reads on every access and on every fire; the token
  is purely a "something changed, re-read" signal, never a payload.
- **Seam proven end-to-end:** `config`'s `getReloadToken()` feeds `options`'
  `Options.watch(getValue, produceToken)` directly, with zero config-specific glue
  in `options` — the #40 integration point.
- **Deferred to #50:** a JS-native reactive surface (`EventTarget`/`Observable`) as
  an alternative or additional subscription shape. The callback-based `IChangeToken`
  model above is v0's ONLY reactive surface.

## 9. The registration builder lives in `di.core`; `build()` is a `di` extension — #36, #22

Mirrors the reference DI split where the **abstractions** package ships the concrete
registration collection (`ServiceCollection`) and the **runtime** package supplies the
provider-building entry as an extension — not a method on the collection. This
supersedes §1's "`di.core` is types-only" framing (the original rule was _stricter_
than the reference, which ships a concrete collection in its abstractions).

- **The concrete builder `ServiceManifestClass` moves into `di.core`.** It collects
  registrations (`add` / `addFactory` / `addValue`) and seals them (`seal()` → an
  immutable `SealedManifest` snapshot). `di.core` therefore ships **runtime** now (the
  builder, the slot/token helpers, and the registration-time errors `DiError` +
  `OpenTokenRegistrationError`). The resolution engine (`ServiceProviderClass`, scopes)
  and the resolution-time errors stay in `di`.
- **`build()` is split.** The **sealing** half is the collection's own concern
  (`di.core`). The **engine-constructing** half — turning the sealed snapshot into a
  `ServiceProvider` — is a `di` extension: importing `@rhombus-std/di`
  **prototype-patches** `build()` onto `ServiceManifestClass` at load time
  (`this.seal()` → `new ServiceProviderClass(...)`). `di.core`'s own `build()` is a stub
  that throws "requires the `@rhombus-std/di` runtime". This is the same prototype-patch
  mechanism a cross-package fluent-authoring augmentation uses (see §0); `di` uses it for
  its own `build()`.
- **Runtime identity is load-bearing.** `di` keeps `@rhombus-std/di.core` **external** in
  its JS bundle (not inlined), so the `ServiceManifestClass` `di` patches and the one
  cross-package augmentations patch are the **same object**. A private inlined copy would
  fork the identity and break the patch — the same reason config keeps providers external
  (§0) and the reason di.core stays external in the rolled `.d.ts` (§1).
- **Authoring guidance flips to augmentations.** `di.core`'s `authoring.ts` now documents
  the preferred cross-package fluent shape as an **extension-method augmentation**
  (`declare module` onto the interface + prototype-patch the class), matching the §0
  directive and how `config` adds `addJsonFile` to `ConfigurationBuilder`. A plain free
  function still works for callers who prefer it.
- **Registration surface is an interface (#22).** `ServiceManifest` is the public
  authoring **interface** (`di.core`), bound to the concrete provider `build()` returns;
  `ServiceManifestClass` (the ME `IServiceCollection`-vs-`ServiceCollection` analog)
  implements it. All public signatures accept/return the interface; the class stays
  exported so augmentations can patch its prototype. The constructible `ServiceManifest`
  **value** + its ctor type live in `di` (alongside the `build()` patch).

## 10. Scope is the provider (deliberate MEDI divergence); public surface is interface-only; the injectable provider is scope-generic-free — #24

The reference DI models a scope as a **two-object** pattern: `IServiceScope : IDisposable`
owns an `IServiceProvider`, and an `IServiceScopeFactory.CreateScope()` mints the pair. We
**collapse that**: our scoped provider **is** the disposal boundary. `createScope(name)`
returns a fresh `ServiceProvider` wired to a new scope frame (cache + dispose-list, parented
to the current frame); registrations are shared tree-wide, only the frame is new. No
separate `IServiceScope` wrapper exists. We mirror the reference's scope **semantics** (a
disposable boundary that bounds, caches, and cleans up, opened by `createScope`), not its
two-object **shape** — consistent with our other deliberate collapses (uniform scope tags,
the `Options<T>` accessor collapse §4.2).

Two rules fall out, both held to and audited across `di` + `di.core`:

- **The public surface is interface-only — no concrete class ever leaks to a consumer.**
  `build()`, `createScope()`, the resolve/tryResolve returns, and the scope factory are all
  typed as the `di.core` interfaces (`ServiceProvider`, `Resolver`, `ScopeFactory`), never
  the concrete `ServiceProviderClass` / `ServiceManifestClass`. The internal `Scope` frame
  (a pure cache + disposal + parent node) is **no longer exported** from `di`'s barrel — it
  is an implementation type, and it never appears in any public signature (all references to
  it are `#`-private on the impl class).
- **The consumer-injectable provider is scope-generic-free.** The surface a consumer injects
  (especially via hosting) is the **non-generic `Resolver`** — `resolve` / `resolveAsync` /
  `resolveFactory` / `tryResolve` / `isService`, all scope-agnostic — the `IServiceProvider`
  analog. Injected code cannot name the scope-tag union `S` (it has no idea which tags the
  application declared), so the resolution surface must not carry it. The `<S>` generic lives
  **only** on `ScopeFactory<S>` (`createScope`), the scope-**opening** surface that setup /
  hosting code holds — mirroring the reference's separate `IServiceScopeFactory`.
  `ServiceProvider<S>` composes both (`Resolver` + `ScopeFactory<S>` + disposal), so the
  application holds the full surface while an injected dependency sees only `Resolver`.

## 11. One producer record; the provider is an intrinsic resolvable type — #49

Two coupled simplifications to the resolution core.

- **One producer shape.** The three registration kinds (`class` / `value` / `factory`)
  collapse to a single record `{ produce, signatures, scope, name, arity }` built at
  registration time: a ctor wraps to `(...a) => new Ctor(...a)`, a value to `() => value`, a
  factory is its own producer. The resolver spine calls `produce(...args)` uniformly — the
  `.kind` switch in `#instantiate` / `#buildPartitioned` and the `value` early-return in
  `#resolve` all disappear. `name` and `arity` are carried EXPLICITLY because the ctor wrapper
  reports `""` / `0` for its own `.name` / `.length`: the missing-metadata signal keys off the
  stored `arity` (a rest-param wrapper zeroes `.length`), and diagnostics off `name`. A value
  folds onto the transient path (scope `undefined`), preserving async-as-values — a value that
  IS a `Promise` is returned raw, never awaited. This is an internal simplification (the
  reference DI keeps three descriptor kinds but realizes them uniformly), not ME-dictated.

- **The provider is an intrinsic resolvable type; `ScopeRef` is retired.** A factory (or ctor)
  that wants the live provider declares a `Resolver`-typed parameter. The transformer emits its
  token like any other param (normal derivation → `RESOLVER_TOKEN`, the package-qualified
  `Resolver` token), and the engine intercepts that token in `#resolve` / `#isResolvable` /
  `isService`, handing back the live provider VIEW (the scope-generic-free `Resolver` surface,
  per §10) relative to the resolving frame. "I want the provider" is plain DI. This subsumes
  and RETIRES the `ScopeRef` slot marker (`{ scope: true }`) — a dedicated slot kind is no
  longer needed once the provider resolves like any other token. The deprecated `ResolveScope`
  token is also recognized, so an existing `ResolveScope`-typed param keeps working.

  Fallout: the signature-less-factory escape hatch (auto-supplying the provider as the sole
  argument) is removed — with the kinds collapsed there is no way to tell a provider-less
  factory from a zero-arg ctor, and auto-supplying an undeclared argument was always nonsense.
  A signature-less factory now runs with no injected args. **Breaking:** the registration ABI
  is one `Registration` record (`ClassRegistration` / `FactoryRegistration` /
  `ValueRegistration` removed), and `ScopeRef` / `isScopeRef` are gone.

## 12. Collection resolution — `Array<T>` / `Iterable<T>` over accumulated registrations — #48

MEDI's `IEnumerable<T>` resolution, over the single-producer core (§11). Three coupled pieces.

- **Registration accumulates; bare-T is last-wins.** Each token maps to a LIST of registrations
  in registration order (§9's map is already `Map<Token, Registration[]>`). Re-registering a
  token APPENDS rather than overwriting; bare-T resolution returns the LAST entry, so existing
  callers are unaffected. A single `.add(...).as(scope)` chain remains ONE registration: `.as()`
  REPLACES the transient base it just appended with the scoped copy in place, rather than leaving
  a shadow entry — harmless for last-wins, but the aggregation below would otherwise double-count
  it.

- **Two-step collection lookup.** Resolving `Array<T>` (the token the transformer derives for both
  `T[]` and `Array<T>`) or `Iterable<T>`: (1) if a binding is registered against the WRAPPER token
  itself (`Array<pkg:IFoo>` — an as-requested escape hatch), it short-circuits and resolves
  normally; (2) else AGGREGATE every registration of `T` in registration order, wrapped as
  requested. The aggregate's LAST element is the bare-T (last-wins) winner — the same instance a
  bare `resolve<T>()` returns — mirroring the reference enumerable semantics. Each element resolves
  per its OWN registration's lifetime/caching; the scope cache is keyed by the `Registration`
  object (not the token) so the N registrations of one token cache independently. An aggregate of an
  UNREGISTERED `T` is EMPTY (whereas a bare unregistered `T` still throws). `isService` /
  `tryResolve` report a collection token as always known — an empty collection is a valid result.

- **The wrapper-token string convention.** The manual (plugin-less) path registers or resolves the
  plain closed-generic form `Array<elementToken>` / `Iterable<elementToken>` — e.g.
  `add("Array<pkg:IFoo>", …)` for an as-requested binding, or `resolve<T>("Iterable<pkg:IFoo>")`.
  The transformer derives the same string: it recognizes `T[]`, `Array<T>`, and `Iterable<T>` in
  tokenless calls and parameter types and emits `Array<elem>` / `Iterable<elem>` — keeping only the
  element type argument (TypeScript models `Iterable<T>` as `Iterable<T, TReturn, TNext>`; the
  `TReturn` / `TNext` defaults are dropped so the derived token matches the runtime's one-arg
  convention).

## 13. Per-type-file split — `config.core/interfaces.ts` + bundled-type audit — #46

Mirrors MECA's one-type-per-file layout for `config.core`'s `IConfiguration*` family, and
audits every other file flagged for bundling multiple public types against its reference
source directory. Rename fold-in: `DeepRecord` → `ConfigObject` (leaves stay `string`).

**`config.core/src/interfaces.ts` split** — all seven `IConfiguration*` interfaces get
their own file (`configuration.ts`, `configuration-builder.ts`, `configuration-manager.ts`,
`configuration-root.ts`, `configuration-section.ts`, `configuration-source.ts`,
`configuration-provider.ts`), matching MECA's `IConfiguration.cs` / `IConfigurationBuilder.cs`
/ `IConfigurationManager.cs` / `IConfigurationRoot.cs` / `IConfigurationSection.cs` /
`IConfigurationSource.cs` / `IConfigurationProvider.cs` one-to-one — `IConfigurationManager`
stays in config.core because MECA ships it in Abstractions, not the concrete engine.
`ConfigObject` / `IndexedSection` / `ITryGetResult` (no MECA per-file equivalent) land in a
shared `types.ts`. `index.ts` re-exports the full surface unchanged; every doc comment
converts from XML-style (`/// <summary>`) to TSDoc (`/** */`) in the same pass.

**Bundled-type audit verdicts** (per-file, judged against the reference source directory
where one applies; cohesion where it doesn't):

- `di/src/types.ts` — **keep.** A predecessor restructuring (di.core carries the ABI, di
  re-exports it) already reduced this to a thin re-export barrel; it no longer bundles
  distinct type definitions of its own.
- `di/src/tokens.ts` — **moot.** Already relocated to `di.core/src/tokens.ts` by a
  predecessor PR; not a bundling candidate at its current location (single-concern token
  grammar).
- `di/src/errors.ts`, `di.core/src/errors.ts` — **keep grouped.** The DI error taxonomy has
  no reference-DI file-per-exception-type layout to mirror (reference DI throws generic
  exceptions inline); the classes here share one root (`DiError`) and are small enough that
  one file per class would fragment a single cohesive taxonomy for no reader benefit.
- `di.core/src/tokens.ts` — **keep grouped.** The closed-generic token grammar
  (`closeToken`/`parseToken`/`isOpenToken`/`substituteToken`/`substituteSignatures`) is
  port-original — reference DI has no open-generic hole/token-string concept — and the
  functions are tightly coupled around one shared grammar; cohesion favors one file.
- `di.core/src/types.ts` (16 exports / 286L, the issue's flagged file) — **split.** No
  reference-source file mirrors this ABI (the slot/token/hole grammar is port-original), so
  judged on cohesion. The file's own section dividers already marked three distinct
  concerns: split into `types.ts` (the slot/token ABI: `DepTarget`, `Token`, `FactoryRef`,
  `Union`, `LiteralRef`, `TypeArgRef`, `DepSlot`, `DepRecord`, `ParsedToken`), `brands.ts`
  (the transformer-facing compile-time brands: `Inject`, `Hole`, `$`, `Typeof`), and
  `overloads.ts` (the overload-extraction utilities: `OverloadedParameters`,
  `OverloadedConstructorParameters` and their private recursion helpers).
- `di.transformer/src/deps.ts`, `di.transformer/src/tokens.ts` — **keep grouped.**
  Transformer-internal extraction/derivation logic operating over `ts.Type`/AST; no
  reference-source directory applies (port-original), and the exported functions are
  tightly interdependent (shared context types, mutual helper calls) rather than
  independently-reachable public API a consumer picks from piece by piece. Splitting would
  fragment one extraction algorithm across files without a clear boundary.
- `config/src/schema.ts` — **keep grouped.** Small (68L), single-concept module (the
  runtime schema DSL + its `Infer` type-level image); no reference-source equivalent
  (reference config binding is reflection-based, not a schema DSL), and too cohesive to
  split further.

## 14. `options.augmentations` — the config → Options bridge, realized — #40

Realizes §4.1's `options.augmentations` (MEO's `Options.ConfigurationExtensions` analog). Two
fluent methods augment `di.core`'s registration builder (declaration merge onto
`ServiceManifestBase` — the interface a consumer holds — AND onto `ServiceManifestClass` so the
class still satisfies its own `implements`, plus a `ServiceManifestClass.prototype` patch — the §9
mechanism, with config.json's `addJsonFile` as the in-repo template). The double interface-merge is
what a NEW method name needs: di.transformer only adds OVERLOADS of existing methods, so it merges
onto the interface alone; a brand-new name would leave the implementing class short without the
class-side merge. The bridge code lives ONLY here; di and config stay mutually unaware (§4.3).

- **`addOptions<T>(token, makeBase)`** registers the `Options<T>` ASSEMBLY at `token` — a factory
  (its `Resolver` injected via `RESOLVER_TOKEN`) that, at resolve time, pulls every pipeline step
  and change-token source for `token` out of the container as collections (§12's `Array<slot>`
  aggregation — the steps "travel through the container"), runs the §4.5 `OptionsFactory`, and
  returns the value. It returns the `.as(scope)` continuation, so lifetime is chosen at the
  registration site (§4.2: explicit registration, no fixed lifetimes). Slot tokens are derived
  deterministically from the options token (`…/configure/<token>`, `…/change-token-source/<token>`,
  …) so the appending side and the reading side agree without shared state.

- **`configure(token, section)`** mirrors ME's `Configure<TOptions>(IConfiguration)`: it appends a
  config-bind **configure step** (ME's `NamedConfigureFromConfigurationOptions`) AND a **change-token
  source** returning `section.getReloadToken()` (ME's `ConfigurationChangeTokenSource`). When any
  source is present the assembly delivers a REACTIVE `Options<T>` (`Options.watch`) whose `value`
  re-runs the pipeline per read and whose `subscribe` fires on every reload (#6); with none it is a
  static `Options.of` snapshot.

Design-forced departures from the reference:

- **Structural bind, not reflective.** ME's step calls `ConfigurationBinder.Bind(config, options)`,
  a reflective property populate. TS has no reflective binder, so the bind DEEP-MERGES the section's
  key/value subtree onto the value. All config leaves are strings (config carries no type
  information), so richer coercion is a schema / data-annotations concern deferred to a later
  satellite (§4.4). Deep (not a top-level assign) so two `configure` calls compose rather than
  clobber overlapping nested keys.

- **`CompositeChangeToken` is local.** `Options.watch` takes one producer, but a value may watch
  several sources (two `configure` calls). The sources compose through a minimal composite token
  kept internal to this package — primitives ships the change-token trio (#35) but not the
  composite; porting it into primitives is YAGNI until a second consumer needs it.

- **Split into `addOptions` + `configure`, not one call.** ME's `Configure` calls `AddOptions`
  internally at a fixed lifetime. Here lifetime is not fixed (§4.2), so registering the assembly
  (with its chosen scope) and adding a config source are distinct steps.

## 15. `addOptions<T>` — explicit wrap verb + the `di.transformer.options` satellite — #34

`addOptions<T>` registers an `Options<T>` at `token` that WRAPS the `T` resolved from another
token. Two halves land here, and one deliberate naming deviation is recorded so it is not later
"corrected."

### The explicit verb is the complete, transformer-free form

The primary, complete form is the explicit token verb `options.augmentations` adds:

```ts
addOptions(token, tToken); // register Options<T> wrapping the T resolved from tToken
```

which internally is just `addFactory(token, (t) => Options.of(t), [[tToken]])` — so **di gains no
new primitive.** It coexists as an OVERLOAD with §14's config-pipeline
`addOptions<T>(token, makeBase)`, disambiguated by the second argument's TYPE at runtime: a `Token`
(string) → the #34 wrap; a `() => T` base factory → the §4.5 assembly pipeline. Both deliver an
`Options<T>` at `token`; they differ only in where `T` comes from.

### Factoring B — options is config-independent (MEO-faithful)

`addOptions<T>` wraps an **already-bound `T`**; it binds **no config.** MEO's Options core carries no
Configuration dependency — config binding is a separate package (`Options.ConfigurationExtensions`),
here §14's `configure(token, section)`. So the wrap verb has nothing to _bind_; it only fills in the
element token. Anything connecting config → Options belongs to §14's bridge, not here.

### The sugar `addOptions<T>()` lowers to the explicit verb

The type-driven `addOptions<T>()` is pure sugar (a §2 authored form — it never runs) that lowers to
`addOptions(token(Options<T>), token(T))`, deriving the wrapper and element tokens through
`@rhombus-std/di.transformer`'s OWN machinery: `token(T)` is the plain element token any
`resolve<T>()` / `add<T>()` derives, and `token(Options<T>)` is the closed-generic composition
`<Options-base><` + `token(T)` + `>` — the identical `base<arg>` form `deriveToken` produces for a
written `Options<T>` (§12), assembled for a wrapper the author never spelled out. The `Options` base
is DERIVED (located in the program, run through `baseTokenForSymbol`), not hard-coded, so the two
sides — the sugar's emitted wrapper and a consumer's `resolve<Options<T>>()` — always agree.

To keep the satellite's tokens **byte-identical** to the main transformer's, di.transformer now
exports `createTokenContext(program)` (the shared `TokenContext` builder) and `baseTokenForSymbol`;
both the main transformer and the satellite build their context through the one factory. A mismatch
would leave the sugar's `tToken` unresolvable against the token `add<T>()` registered `T` at.

### Naming deviation: `di.transformer.options`, NOT `options.transformer`

The transformer is pure token-lowering — di's _kind_ of transform (type → token) — it emits di
registrations, and it has **zero value without di.** So it lives as a `di.transformer` **satellite**
(`di.transformer.options`) that IMPORTS di.transformer's token derivation, deliberately deviating
from the `<family>.transformer` convention. The asymmetry is the point: `config.transformer` stays
its OWN standalone package **because** its schema-derivation is usable with no di at all
(di-independent), whereas an options lowering that emits no di registrations would be nothing. The
§2 invariant still holds — the satellite imports di.transformer's compile-time machinery, never the
`@rhombus-std/di` runtime.

## 16. The example set — a four-package interop matrix — #30

The six per-family example projects (`di.examples.*`, `config.examples.*`) are replaced by ONE
integrated example set: four packages plus a type-only contracts package, exercising the whole v0
surface in concert rather than in per-family islands.

- **`examples.contracts`** — PURE TYPES (`IGreeting`, `ServerOptions`, `GreetingPolicy`,
  `IHealthCheck`, `IBanner`, `IServerReport`). No runtime code, so every `import type` erases and no
  package carries a runtime dependency on it. Both dialects derive/hand-write tokens from these
  package-public types, so the token a manual author writes is exactly the one the transformer
  derives — the agreement the interop turns on.
- **`examples.lib.with-transformer`** — a dependency library authored in the tokenless dialect and
  shipped as its BUILD. Its `exports` resolve to `dist` under EVERY condition (`bun`/`types`
  included): its `makeServerReport` factory resolves the container tokenlessly (`resolve<IGreeting[]>()`,
  `resolve<Options<ServerOptions>>()`, `tryResolve`/`isService`), and `tspc` lowers those calls during
  the build. Raw source is meaningless — a `source`/`bun` → `src` entry would silently bypass the
  lowering and the un-tokened `resolve()` calls would throw. Consumers get lowered JS + a clean d.ts
  and never run the transformer.
- **`examples.lib.without-transformer`** — the same producer role in the MANUAL dialect (explicit
  tokens + plain-data signatures via `addCasualServices(services)`). It gets a build for consistency
  and real consumption, but ordinary source-libs conditions are fine — nothing needs lowering.
- **`examples.app.{with,without}-transformer`** — two composition roots running the IDENTICAL
  scenario (bar a header line), one tokenless (tspc, both di transformers) and one manual (plain tsc).
  Each wires config → a reactive `Options<ServerOptions>` through the full configure/post-configure/
  validate pipeline, registers BOTH libraries into one container, resolves the `IGreeting` collection
  aggregating both, reaches an async banner with `resolveAsync`, delivers a config-independent policy
  through `addOptions<T>()`, and fires a live options update on config reload. The `expected.txt`
  output-diff e2e runs in the root gate.

### Registration lowering is top-level-only — so libraries register differently by dialect

`di.transformer` lowers `add`/`addValue`/`addFactory` registration calls ONLY at a module's TOP-LEVEL
statements (resolution calls — `resolve`/`resolveAsync`/`tryResolve`/`isService` — lower anywhere,
including nested in a factory body). A composition root IS top-level, so the tokenless apps register
tokenlessly there. A reusable library registration FUNCTION, however, has its `add<I>()` calls inside
a function body, where they would NOT lower. Consequently:

- the **manual** library exposes a real `addCasualServices(services)` registration function — its
  explicit forms need no lowering and compose freely into a callable;
- the **tokenless** library instead exports impl classes + a tokenless-authored _factory_
  (`makeServerReport`, whose `resolve<T>()` calls DO lower in-body), and the app performs the
  top-level registration. Its build is still load-bearing precisely because of those in-body resolves.

This asymmetry is a faithful property of the transformer's design (the PRD's "library author compiles
once and publishes lowered JS" is the top-level self-registration / published-factory shape), not a
workaround — and it is what the interop matrix demonstrates: each dialect both produces services the
other consumes, and the built tokenless library's lowered factory resolves correctly inside the
manual app because their tokens agree.

## 17. `diagnostics` family scaffolded — abstractions + config-reactive builders, listener runtime deferred — #74

`diagnostics.core` ships `IMetricsBuilder`/`ITracingBuilder`, the `InstrumentRule`/`TracingRule`
rule model (eager single-wildcard validation), the `MeterScope`/`ActivitySourceScopes` flag enums,
and `MetricsOptions`/`TracingOptions` — mirroring the reference `ME.Diagnostics.Abstractions`
edge-for-edge (`di.core` + `options`, no `config` dependency at this layer). `diagnostics` supplies
concrete `MetricsBuilder`/`TracingBuilder`, the config-binding pipeline (`MetricsConfigureOptions`/
`TracingConfigureOptions` parsing the `EnabledMetrics`/`EnabledGlobalMetrics`/`EnabledLocalMetrics`

- listener-scoped + `Default`-synonym schema against a shared tree-walker), and `addMetrics`/
  `addTracing`.

**Extension-method placement.** `enableMetrics`/`disableMetrics`/`enableMetricsRule`/
`addMetricsListener`/etc. are plain functions over `IMetricsBuilder` living in `diagnostics.core`
— the family owns that interface, so no augmentation is needed (matches §14's "explicit form is
primary" convention, generalized: augmentation is for extending an interface owned by ANOTHER
package). `addMetrics`/`addTracing`, by contrast, extend `di.core`'s `ServiceManifestClass`, which
`diagnostics` does not own — those use the exact `declare module` + prototype-patch idiom `config.json`
established for `addJsonFile` (§14), with the same `"sideEffects": true` package.json shape.

**ME-graph fidelity.** `diagnostics.core` → `di.core` + `options`; `diagnostics` → `diagnostics.core`

- `config` + `options` + `options.augmentations` + `primitives`, with `di.core` as a peer dependency
  patched by the augmentation (the §9 peer-dep idiom `options.augmentations` established). The
  assembled `Options<MetricsOptions>`/`Options<TracingOptions>` is wired through
  `ConfigurationChangeTokenSource` so it is reload-reactive when a config source is present, and a
  static `Options.of` snapshot otherwise — the same `addOptions`/`configure` split §14 designed.

**Explicit deferrals:**

- **Metrics/tracing listener + subscription runtime — no consumer, no analog.** The reference's
  `Meter`/`Instrument`/`MeasurementCallback`/`Activity`/`ActivitySource` types have nothing this
  repo can port against yet. `IMetricsListener` is reduced to its rule-matching `name`;
  `ActivityListenerBuilder`'s `Sample`/`SampleUsingParentId`/`ActivityStarted`/`ActivityStopped`/
  `ExceptionRecorder` delegate params collapse to `unknown`. `addMetrics`/`addTracing` register no
  `DefaultMeterFactory`/`MetricsSubscriptionManager`/`DefaultActivitySourceFactory`/
  `MetricListenerConfigurationFactory` startup wiring, since there is no listener to activate.
  Revisit when a diagnostics runtime (or an OpenTelemetry-style bridge) is on the table.
- **Console/debug metrics listener family** (`ConsoleMetrics`, `DebugConsoleMetricListener`,
  `AddConsole`) — depends on the deferred listener runtime above.
- **`ME.Http.Diagnostics`, `ME.Diagnostics.ResourceMonitoring`, `ME.Diagnostics.ExceptionSummarization`
  — not built.** YAGNI: no concrete consumer.
- **`CompositeChangeToken` duplication.** `diagnostics` needs the same composite-token merge
  `options.augmentations` already built locally for §14's multi-`configure` case. `options.augmentations`'
  copy already anticipated a "second consumer" promotion into `primitives`; `diagnostics` is now
  that second consumer — promoting one `CompositeChangeToken` into `primitives` and deleting both
  local copies is an open follow-up, not done this pass.
- **`addMetrics`/`addTracing` are not idempotent** — `di.core` has no `TryAdd`/has surface, so a
  second call re-registers the identical assembly factory (benign under last-wins bare-token
  resolution, but pollutes `Array<token>` collection aggregation, §12). Mirrors the same gap in
  `options.augmentations`' `addOptions`; guard both together if a `TryAdd` primitive lands on
  `ServiceManifestBase`.

## 18. `logging` family scaffolded — composite `Logger`/`LoggerFactory` + config-bound filter rules, sinks deferred — #75

`logging.core` ships `ILogger`/`ILoggerFactory`/`ILoggerProvider` (extends `Disposable`)/
`ILoggingBuilder` (typed against `di.core`'s `ServiceManifest`), `LogLevel` (`Trace=0`..`None=6`,
reused verbatim from `hosting.core`'s prior stand-in — see the graph note below),
`EventId`/`EventIdLike`, `FormattedLogValues` + a single-pass `{hole}`/`{{ }}` `formatMessage`
renderer, and the `log`/`logTrace`/`logDebug`/`logInformation`/`logWarning`/`logError`/
`logCritical` convenience wrappers — mirroring `ME.Logging.Abstractions` → `di.core` only (the pin
in `docs/reference/me-extensions-dependencies.md`). `logging` supplies the concrete `Logger`
(composite fan-out over a live-by-reference sink array), `LoggerFactory` (per-category caching,
back-filling existing composites when a provider is added), `NullLogger`/`NullLoggerFactory`/
`NullLoggerProvider`, `LoggerFilterOptions`/`LoggerFilterRule`, and `addLogging`. `logging.configuration`
adds config-tree → `LoggerFilterOptions` binding (`bindLoggerFilterOptions`/`parseLogLevel`: global
`LogLevel` + per-provider `<provider>:LogLevel`, `Default` mapping to the undefined category) and
`addConfiguration`.

**Extension-method placement.** The `log*` wrappers are plain functions over `ILogger`/
`ILoggingBuilder` in `logging.core` — family-owned interface, no augmentation. `addLogging` extends
`di.core`'s `ServiceManifestClass`, which `logging` doesn't own, so it uses the `addJsonFile`
augmentation idiom (§14) — `declare module` + prototype patch, `"sideEffects": true`. Uses `add`
(append, last-wins) rather than a `TryAdd`-style guard, since `di.core` has no add-if-absent surface.

**ME-graph fidelity.** `logging.core` → `di.core`; `logging` → `logging.core` (`di.core` as peer,
patched by `addLogging`); `logging.configuration` → `logging` + `logging.core` + `config` +
`config.core` + `di.core` + `options` — edge-for-edge with the reference.

**`hosting.core`'s logging stand-in retired.** `hosting.core` previously carried its own local
`ILogger`/`ILoggerFactory`/`LogLevel` as placeholders (there was no logging family to depend on
yet). The integration pass deleted `hosting.core/src/logging/logger.ts` and `logger-factory.ts`,
re-exported the real types from `logging.core` in `hosting.core/src/index.ts`, and added
`@rhombus-std/logging.core` to `hosting.core`'s dependencies — realizing the
`Logging.Abstractions → DependencyInjection.Abstractions` pin now that a real `logging.core`
exists to depend on, rather than leaving a permanent fork.

**Explicit deferrals:**

- **No concrete sinks this pass.** `ME.Logging.Console`, `.Debug`, `.EventLog`, `.EventSource`,
  `.TraceSource` are all excluded per direct instruction (issue #75). `ILoggerProvider`/
  `ILoggerFactory` ship so a consumer can supply their own provider; what a provider set should
  look like here is still an open design question, likely an adaptation rather than a straight
  port.
- **`setMinimumLevel` stubbed (throws).** The reference registers an `IConfigureOptions<LoggerFilterOptions>`
  via `IServiceCollection.Configure` — an options-DI-builder surface `options` deliberately defers
  — plus it needs the (also deferred) filter-consumption layer below.
- **`clearProviders` stubbed (throws).** `di.core` registrations are append-only/last-wins with no
  remove-all surface, so `RemoveAll<ILoggerProvider>()` has no mechanical port.
- **`LoggerFactory.create(configure)` static stubbed (throws).** The reference builds a full DI
  container and resolves `ILoggerFactory` from it; that needs the `di` RUNTIME, but the graph edge
  is `logging → di.core` only. Instance construction and `manifest.addLogging(...)` work for real.
- **`addLogging` omits** the reference's `AddOptions()` call, the open `ILogger<TCategory> →
  Logger<TCategory>` registration (needs runtime type-name reflection TS lacks), and the default
  `IConfigureOptions<LoggerFilterOptions>` (needs the deferred options-DI integration).
- **Filter-rule SELECTION is not applied.** The composite `Logger` does not apply per-
  `(provider, category)` `LoggerFilterRule` selection — each sink's own `isEnabled` gates it
  (correct for a no-filter setup). `LoggerFilterOptions`/`Rule` are real data holders; their
  consumption is deferred with the options-monitor DI integration. Cross-sink `AggregateException`
  aggregation is also omitted — a throwing sink propagates.
- **`addFilter` ports only the two unambiguous overloads** (`(category, level)` rule, and raw
  `(provider, category, level) => bool` filter); the wider provider-scoped `<T>`/per-category
  function-filter overload matrix is deferred sugar adding no new capability.
- **`logging.configuration`'s `addConfiguration` binds EAGERLY**, at call time, and registers a
  resolvable value — real behavior minus reload reactivity. The reference registers a LAZY
  `IConfigureOptions<LoggerFilterOptions>` + an `IOptionsChangeTokenSource` (needs the deferred
  options-monitor DI integration). The no-arg `AddConfiguration()` overload and the
  `ILoggerProviderConfigurationFactory`/`LoggerProviderConfigurationExtensions` provider-oriented
  services are deferred alongside the provider work (issue #75).
- **`FormattedLogValues` renders strings only** — full structured name/value key extraction (for a
  structured sink) is deferred, exposed via the raw `message`/`args` fields until then.
- **`LoggerExtensions` EventId-carrying overloads dropped** — a bare integer event id vs. a message
  string is ambiguous at runtime with no overload dispatch; callers needing an explicit event id
  call `logger.log(level, EventId.from(n), ...)` directly.

## 19. `caching` family scaffolded — real `MemoryCache` runtime, statistics/linked-entries deferred — #76

`caching.core` ships `IMemoryCache`/`ICacheEntry`, `CacheItemPriority`/`EvictionReason`,
`PostEvictionCallbackRegistration`/`PostEvictionDelegate`, and the `CacheExtensions`/
`CacheEntryExtensions` convenience functions (`get`/`tryGetValue`/`set`/`getOrCreate`/
`getOrCreateAsync`/`setPriority`/`addExpirationToken`/`setAbsoluteExpiration`/
`setSlidingExpiration`/`registerPostEvictionCallback` — the family owns `ICacheEntry`/
`IMemoryCache`, so these are plain functions, no augmentation) — mirroring `ME.Caching.Abstractions`
→ `primitives`. `caching.memory` ships a genuinely working `MemoryCache`: a `Map`-backed store,
absolute + sliding + change-token expiration (enforced lazily on access and by an inline
frequency-gated scan — no background thread in a single-threaded runtime), size-limit accounting
with priority-then-LRU compaction run synchronously on an overflowing insert, and eviction
callbacks fired on remove/replace/expire/capacity. Verified end-to-end with a standalone smoke test
(14/14 assertions) and a path-mapped `tsc` check against real sibling sources (own-package types
clean); the workspace-root install/build/typecheck is the integration pass, not this smoke check.

**Extension-method placement.** `caching.memory` adds `setEntryOptions`/`setWithOptions`/
`getOrCreateWithOptions`/`getOrCreateAsyncWithOptions` — the `MemoryCacheEntryOptions`-consuming
overloads of the `caching.core` extension functions — because `MemoryCacheEntryOptions` itself
lives in `caching.memory`, diverging from the reference (where it sits in `ME.Caching.Abstractions`
alongside the rest). Revisiting whether `MemoryCacheEntryOptions` should move to `caching.core` to
keep the extension surface unified is an open follow-up. `addMemoryCache` extends `di.core`'s
`ServiceManifestClass`, which `caching` doesn't own, so it uses the `addJsonFile` augmentation
idiom (§14), with `caching.memory`'s `package.json` carrying `"sideEffects": true`.

**ME-graph fidelity.** `caching.core` → `primitives`; `caching.memory` → `caching.core` +
`logging.core` + `options` + `primitives`, with `di.core` as a peer dependency patched by
`addMemoryCache` — edge-for-edge, including the `logging.core` edge the reference's
`MemoryCache(ILogger, ...)` constructor implies (see `docs/reference/me-extensions-dependencies.md`).

**Explicit deferrals:**

- **`addMemoryCache` is not idempotent and does no DI-pipeline wiring.** `di.core` has no `TryAdd`,
  so a second call re-registers (whereas the reference keeps the first registration via `TryAdd`).
  No `IOptions` pipeline and no `ILoggerFactory` injection are wired — the setup callback runs
  EAGERLY at registration time and `MemoryCache` is built with a private null-logger fallback
  (`logging.core` does not yet export a `NullLogger`/`NullLoggerFactory` — provider work is issue
  #75 scope; swap in the real one once it exists).
- **Statistics/metrics surface not ported** — `GetCurrentStatistics`, `MemoryCacheStatistics`, the
  observable-counter metrics, and `MemoryCacheOptions.TrackStatistics`/`Name`. No consumer.
- **Linked-entry tracking not ported** — the `AsyncLocal` parent/child propagation and
  `MemoryCacheOptions.TrackLinkedCacheEntries` (kept as a field, always `false`); `CacheEntry`
  commit is unconditional.
- **Background scheduling replaced with synchronous inline equivalents** — single-threaded JS has
  no analog for the reference's Task-scheduled expiration scan or background-thread overcapacity
  compaction; behavior is preserved via inline, frequency-gated checks triggered by subsequent
  operations, with no independent periodic timer.
- **Span-key `TryGetValue` overloads and `GetCurrentStatistics`** on `IMemoryCache` not ported —
  perf/diagnostic surface, no consumer.
- **`MemoryCacheOptions.CompactOnMemoryPressure` dropped entirely** — the reference marks it
  `Obsolete(error: true)`.

## 20. `fileproviders` family scaffolded — composite provider real, physical provider and glob matching held — #77

> **Partly superseded by §73.** The physical provider has since landed
> (`fileproviders.physical`); only `FileSystemGlobbing` remains deferred, and
> `CompositeFileProvider.watch`'s throw was unstubbed by §58. Read §73/§58 for
> the current behavioral contract before relying on the text below.

`fileproviders.core` ships `IFileProvider`/`IFileInfo`/`IDirectoryContents`, `NotFoundFileInfo`/
`NotFoundDirectoryContents`, `NullChangeToken`, and `NullFileProvider` — mirroring
`ME.FileProviders.Abstractions` → `Primitives`, realized as `fileproviders.core` → `primitives`.
`fileproviders.composite` ships `CompositeFileProvider`/`CompositeDirectoryContents`, fanning a
request out across 0..N inner providers — the 0- and 1-provider cases are fully functional —
→ `fileproviders.core` + `primitives`.

**Explicit deferrals (both held for the same reason: no design yet, not YAGNI-forever):**

- **No disk-backed provider.** `ME.FileProviders.Physical` is deliberately deferred — not even a
  stub package was created. What a physical (or non-disk) file provider means for this repo is an
  open design question to resolve separately.
- **`ME.FileSystemGlobbing` not ported.** Upstream it is pulled in only by `ME.FileProviders.Physical`;
  since Physical is deferred it has no consumer yet (YAGNI). Port it only if/when a disk-backed
  provider that needs glob matching is designed.
- **`CompositeFileProvider.watch` over 2+ change-emitting providers is a hosting-style stub
  (throws).** Merging N inner `IChangeToken`s needs a `CompositeChangeToken` — upstream that type
  lives in `ME.Primitives`, and `primitives` does not port it yet (no consumer needed it until
  now). Where it should live — promoted into `primitives` as its natural home, vs. a private local
  port in `fileproviders.composite` — is a `primitives`-family design call, out of scope for this
  pass and tracked against issue #77. (§17's `diagnostics` section above independently hit the same
  gap via `options.augmentations`' local `CompositeChangeToken` copy — three packages now want this
  one primitive.)

## 21. Skipped MECA abstraction APIs ported into `config`, not `config.core` — #79

The original config port skipped several public MECA APIs. This pass ports them: the convenience
helpers (`ConfigurationExtensions`, `ConfigurationRootExtensions`) and the concrete
`ConfigurationManager`. All land in `@rhombus-std/config`, not `config.core`, for the same reason
— they are runtime values, and `config.core` ships none.

The helpers are free functions (mirroring `compareConfigurationKeys`, not extension methods):
`getConnectionString`, `exists`, `getRequiredSection`, `asEnumerable` in
`configuration-extensions.ts`, and `getDebugView` + the `ConfigurationDebugViewContext` type in
`configuration-root-extensions.ts`.

- **Placed in `@rhombus-std/config`, not `config.core`.** These are runtime functions over the
  core interfaces, and `config.core` ships zero runtime values (§9-adjacent invariant). `config`
  already re-exports `config.core`, so its surface stays a superset — consumers import the helpers
  from `config` alongside the interfaces.
- **`asEnumerable`'s section-vs-root test is `instanceof`, not path-based.** The port's
  `ConfigurationRoot` exposes an empty `path` yet is NOT an `IConfigurationSection`, so the
  reference's `is IConfigurationSection` check maps to `instanceof ConfigurationSection` — the
  enumeration root is only yielded, and only contributes a `makePathsRelative` prefix, when it is a
  genuine section. Every node reached via `getChildren()` is a section by contract.
- **`getDebugView` provider labels are `String(provider)`.** The port's providers do not override
  `toString`, so labels are currently the default object tag rather than a friendly name —
  acceptable until a provider identity is designed.
- **`Add<TSource>(configureSource)` deliberately not ported** (candidate intentional deviation).
  The generic factory-add depends on `new TSource()` with a `new()` constraint, which has no
  faithful TS analog, and there is no consumer.
- **`exists` is now canonical.** `coerce.ts` previously carried a private `sectionExists` copy of
  the has-a-value-or-any-child test; it now imports and calls the public `exists`, removing the
  duplicate (the deferred-usage cycle between `coerce.ts` and `configuration-extensions.ts` is
  safe — neither is used at module-eval time). The `diagnostics` package's independent copy is a
  separate cross-package consolidation, out of scope here.
- **`ConfigurationManager`** — the concrete `IConfigurationManager`, a mutable build-as-you-add
  object that is simultaneously an `IConfigurationBuilder` and an `IConfigurationRoot`. It holds
  **one persistent `ConfigurationRoot`**; every `IConfiguration` method delegates to it, so there
  is no separate build-then-read phase. `add()` is **incremental**: it builds+loads ONLY the new
  source's provider and appends it to the persistent root (via `ConfigurationRoot.adoptProvider`,
  the documented intra-package composition seam mirroring the reference `AddSource`) — the existing
  providers are never rebuilt or reloaded. This is a **correctness** requirement, not just
  efficiency (#80): a provider's `set()` state lives in the provider instance, so the earlier
  whole-list rebuild silently discarded any prior `manager.set()` on the next `add()`. The
  reference's copy-on-write `ReferenceCountedProviders` manager is not ported — no concurrent-reader
  story in a single-threaded runtime. It owns a **stable** reload token subscribed once to the
  root's (self-swapping) token, so a subscriber registered before a later `add()` still fires — the
  reference gets this free by implementing `IConfigurationRoot` on a never-swapped identity. Lives
  in `config` beside `ConfigurationBuilder`/`-Root`, mirroring the reference layout (Configuration
  package, not Hosting).

## 22. Dual-export every extension — standalone function AND prototype method — #96

> **Superseded by §28 (#115), now landed.** The `ExtensionSet`/`defineExtensions`/`applyExtensions`,
> one-free-function-per-method shape documented below is retained for history — #115 migrated the
> code to §28's object-literal-per-ME-class form (`AugmentationSet`/`applyAugmentations`, named
> consts, `primitives/src/augmentations.ts`). The cross-package
> `.core`-interface/downstream-concrete install rule and the deferrals list at the end of this
> section are unaffected and still hold; only the authoring shape and the `primitives` symbol names
> changed.

Every "extension method" in the workspace is now available in BOTH forms: a standalone
receiver-first free function AND a prototype/instance method. The method form (`builder.addX(...)`)
stays the primary path; the standalone form (`addX(builder, ...)`) is a fallback / testing surface
— importable, tree-shakeable, callable without triggering the global prototype-patch side effect.
This collapses the two prior ad-hoc conventions (foreign-class targets were prototype-patch-only;
package-owned-interface targets were free-function-only) into one, and **reverses** the
free-function-only decision that §14/§18-era code stated in-line at `add-configuration.ts` and
`diagnostics/src/index.ts`.

- **Chosen shape: author one receiver-first function, install a forwarding thunk (issue #96
  option B, over A).** A single free function per method plus one install line. The `declare module`
  merge supplies the no-receiver method signature; the free function supplies the receiver-first
  signature. Option A (a `this`-typed method literal spread onto the prototype) was rejected: its
  standalone form is `obj.method.call(inst, …)` — a `.call` ritual where a direct `obj.method(inst)`
  silently misbinds `this`, and a rarely-exercised fallback is the worst place to hide a silent
  footgun. B's `addX(receiver, …)` has no such failure mode and matches the reference model (an
  extension method compiles to a static method with the receiver as its first parameter).

- **Shared infra lives in `primitives`.** `ExtensionSet<R>` (an object literal of receiver-first
  functions), `defineExtensions<R>()` (a curried identity validator that pins the receiver type —
  `satisfies` can't carry a strict receiver-_present_ check, since assignability lets a 0-arg member
  through; the 0-arg omission is intentionally unguarded, a self-evident mistake), and
  `applyExtensions(Ctor, set)` (a dumb installer mounting each function as a `this`-forwarding,
  return-preserving method — no validation, only lib authors call it). It sits in `primitives`, the
  universal zero-dependency leaf, because **di ⊥ config (§4.3) disqualifies `di.core`**: the
  config-provider packages would then need a config→di edge just to reach the installer. primitives
  is the only package every family already depends on.

- **Cross-package rule (`.core` interface / downstream concrete).** When the receiver interface
  lives in a `.core` package but the only concrete receiver class lives downstream, BOTH the
  declaration merge onto the interface AND the runtime install onto the concrete class live in the
  **downstream** package that owns the class — so a `.core`-only consumer never gets a method type
  with no runtime behind it. Applied: `diagnostics` owns the install for the metrics/tracing builder
  extensions (interfaces in `diagnostics.core`); `caching.memory` for the IMemoryCache/ICacheEntry
  wrappers (interfaces in `caching.core`); `logging.configuration` for `addConfiguration`
  (interface in `logging.core`, concrete `LoggingBuilder` in `logging`). Because the concrete class
  `implements` its interface and source-libs recompile the class, augmenting the interface also
  requires a class-side merge onto the concrete class (via the owning package's `internal/*` subpath
  where the class lives upstream).

- **Runtime-identity note.** `applyExtensions(Ctor, …)` patches `Ctor.prototype`, so the same
  external-identity requirement as the pre-existing hand-rolled patches holds: the packages keep the
  patched class (`ServiceManifestClass`, `ConfigurationBuilder`, and the downstream concretes)
  external in their bundles (§9), so the prototype patched is the one the consumer resolves.

- **Deferrals (issue #96, tracked as follow-up).** _Resolved in §29 (#105)._ Extensions whose
  receiver is a concrete _options-bag_ class rather than a builder/cache interface were initially NOT
  given the method form — `addFilter` (LoggerFilterOptions), and the options-targeted rule mutators
  `enableMetricsRule`/`disableMetricsRule` (MetricsOptions) and
  `enableTracingRule`/`disableTracingRule` (TracingOptions). §29 lands the method form and renames the
  rule mutators to `enableMetrics`/`disableMetrics`/`enableTracing`/`disableTracing` (dropping the
  `Rule` suffix) to match ME. `tryGetValue` is deliberately standalone-only in perpetuity:
  `IMemoryCache` already declares a `tryGetValue` member, so a method merge would both clash and, at
  runtime, overwrite the real implementation the extension wraps.

## 23. `hosting` brought to full reference parity — the whole Generic Host, NO stubs inside hosting — #44

Where §17–§20 scaffolded a family's abstractions and left a real chunk of the runtime deferred,
`hosting` lands **complete**: every reference Generic Host type has a working port, and nothing
inside the `hosting`/`hosting.core` packages themselves throws "not implemented."

`hosting.core` ships full abstraction parity: `IHost`, `IHostedService`, `IHostedLifecycleService`,
`BackgroundService`, `IHostApplicationLifetime`, `IHostLifetime`, `IHostBuilder`,
`HostBuilderContext`, `IHostEnvironment`, `IHostApplicationBuilder`, `Environments`, `HostDefaults`,
`HostAbortedException`, the host/environment extension helpers (`run`/`runAsync`/`stopWithTimeout`/
`waitForShutdownAsync`/`startHost`, `isDevelopment`/`isEnvironment`/`isProduction`/`isStaging`), and
the `addHostedService` augmentation. `hosting` ships the full runtime: the classic `HostBuilder` and
the modern `HostApplicationBuilder`, the static `Host` factory, the internal host lifecycle,
`ApplicationLifetime`, `ConsoleLifetime`, `HostingEnvironment`, `HostOptions`, and
`HostingHostBuilderExtensions` (`configureDefaults`, `useConsoleLifetime`, `useContentRoot`,
`useEnvironment`, …). The example apps were reworked to the canonical Generic Host shape:
`Host.createApplicationBuilder()` → register the interop-matrix libraries plus one hosted worker
implementing `IHostedLifecycleService` that logs its ordered lifecycle callbacks (`starting` →
`start` → `started` → `applicationStarted` → `stopping` → `applicationStopping` → `stop` →
`stopped` → `applicationStopped`, 9 steps) through an injected `ILogger` → `runAsync`; the worker
calls `stopApplication()` on itself once its scenario finishes, so both apps terminate
deterministically with no reliance on signals.

**Graph edges match the reference exactly (§0).** `hosting.core` → `config.core` + `di.core` +
`diagnostics.core` + `fileproviders.core` + `logging.core` — the reference's
`Hosting.Abstractions → {Configuration,DependencyInjection,Diagnostics,FileProviders,Logging}.Abstractions`
pin, edge-for-edge. `hosting` → the concrete `config`/`di`/`diagnostics`/`logging` packages +
`options` + `options.augmentations` + a **new** `logging.console` package.

**No-stubs-in-hosting rule (direct instruction).** A type the host needed but that had no existing
home was added to its **home package**, never faked inside `hosting`:

- **`ConfigurationManager`** lives in `config` — the config-completion PR (#79) landed it there as
  its permanent, reference-faithful home. `hosting` consumes `config`'s `ConfigurationManager`
  (`new ConfigurationManager()` in each builder). This branch briefly carried a local copy while #79
  was in flight; that bridge was dropped when the branch rebased onto #79.
- **A minimal, genuinely working console sink** landed in a **new `logging.console` package**
  (`ConsoleLogger` + `ConsoleLoggerProvider`, writing the simple console format to stdout against
  `logging.core`'s `ILogger`/`ILoggerProvider`) — mirroring the reference's own `Logging.Console`
  package and realizing the `Hosting → Logging.Console` edge faithfully instead of inventing
  something hosting-local.

Every other gap a consumer might hit is a scaffold **elsewhere** that already throws
not-implemented and is tracked by its own filed issue (§18's `setMinimumLevel`/`clearProviders`,
§20's physical file provider, …) — `hosting` composes those packages honestly rather than papering
over the gap itself.

**Deferred / worked around (each tracked):**

- **`contentRootFileProvider` is a `NullFileProvider`.** The physical, disk-backed file provider is
  deferred at its source (§20/#77); `hosting` takes the same `NullFileProvider` default the
  reference environment would otherwise wrap a real physical provider around.
- **Only the console logging provider is registered by `configureDefaults`.** The reference also
  wires Debug/EventSource/(Windows) EventLog providers; those sink packages aren't ported yet
  (§18/#75), so `configureDefaults` registers `ConsoleLoggerProvider` alone.
- **`useServiceProviderFactory` and `configureContainer` are a no-op single-container shape.** This
  repo has one container type (`ServiceManifest`), so there's no `IServiceProviderFactory<TBuilder>`
  analog in `di.core` to swap in — `useServiceProviderFactory` is accepted and ignored, and
  `configureContainer`'s delegate runs against the one real `ServiceManifest` rather than a
  pluggable builder type.
- **`useDefaultServiceProvider` ignores `ServiceProviderOptions`.** `validateScopes`/
  `validateOnBuild` have no scope-validation surface to bind to in `di`/`di.core` yet; the option
  shape is accepted (for call-site compatibility) and no-ops.

**Runtime-identity reaffirmation (ties to §9).** `hosting.core` now emits real runtime —
`BackgroundService`, the `Environments`/`HostDefaults` const objects, and the `addHostedService`
prototype patch — not just types. It must therefore be **dist-referenced**, not src-referenced (the
Build-layout rule in `CLAUDE.md`), and its `Bun.build` keeps every `@rhombus-std/*`/
`@rhombus-toolkit/*` dependency **external**, matching `di.core`'s own build. Inlining would fork
`di.core`'s `ServiceManifestClass` identity: `hosting.core`'s `addHostedService` patch would land on
a private copy no consumer's container ever resolves against, exactly the failure mode §9 already
warned about for `di`. `hosting.core` is therefore a **runtime core** (like `di.core`), not a
d.ts-only src-referenced lib.

**DI-surface divergences, worked around deliberately:**

- **`IHost.services` is `di.core`'s non-generic `Resolver`**, not a `getService`-style surface — the
  host consumer resolves but never opens a new scope off the root handle (§10's scope-generic-free
  rule for injected code).
- **Resolving every hosted service uses the `Array<token>` collection convention (§12)**, not a
  `getServices<T>()`-shaped call — every `addHostedService` registration lands on one shared
  `HOSTED_SERVICE_TOKEN`, and the host resolves `Array<HOSTED_SERVICE_TOKEN>` to get the ordered
  set. Same trick for logging providers and `HostOptions` configure delegates.
- **`build()` is frameless (§9's `di` divergence carried through), so the host opens the singleton
  scope itself** before running hosted-service lifecycle — nothing is pre-opened by `ServiceManifest`
  itself.
- **Async-only methods drop the `Async` suffix.** JS has no synchronous variant worth keeping
  alongside an async one, so `IHost.start`/`.stop`, `IHostedService.start`/`.stop`, etc. are simply
  async — there is no parallel sync overload to disambiguate from.
- **Extension methods over a plain interface are named functions; only `addHostedService` is a true
  augmentation.** `IHostBuilder`/`IHostEnvironment` are interfaces `hosting`/`hosting.core` own
  outright, so their reference extension methods (`configureDefaults`, `useContentRoot`,
  `isDevelopment`, …) are plain functions taking the interface first — no augmentation needed
  (§17's placement rule, generalized). `addHostedService` is the one exception: it extends
  `di.core`'s `ServiceManifestClass`, which `hosting` doesn't own, so it uses the `addJsonFile`/
  `addOptions` augmentation idiom (§14) — `declare module` + prototype patch.

## 24. `ServiceProviderFactory` promoted into `di.core` — one provider-factory abstraction

The reference `IServiceProviderFactory<TContainerBuilder>` had no named home in `di.core`, so the
hosting builders each hand-rolled the same structural shape — a private `interface
ServiceProviderFactory` in `hosting`'s `HostBuilder`, plus three more inlined anonymously in
`HostApplicationBuilder.configureContainer`, `IHostBuilder.useServiceProviderFactory`, and
`IHostApplicationBuilder.configureContainer` (one of which carried a comment apologizing that
"di.core does not ship" the type). Four copies of one contract, free to drift.

- **The abstraction now lives in `di.core`** as a types-only `interface
  ServiceProviderFactory<TContainerBuilder>` (`service-provider-factory.ts`, one type per file per
  §13/§46), shape `{ createBuilder(services: ServiceManifest): TContainerBuilder;
  createServiceProvider(containerBuilder: TContainerBuilder): Resolver }` over the existing
  `ServiceManifest` / `Resolver` di.core types. Exported from the `di.core` barrel and re-exported
  from `di` alongside the rest of the provider surface.
- **All four hand-rolled copies are replaced** by the shared type, and the "di.core does not ship"
  apology comment is retired. ZERO behavior change — the single-container hosting model still
  accepts the factory and ignores it (§23's no-op `useServiceProviderFactory` / `configureContainer`).
- **`DefaultServiceProviderFactory` is deliberately NOT ported** — no consumer, and with one
  container type there is nothing for a default factory to build.

Refines §23's "no `IServiceProviderFactory<TBuilder>` analog in `di.core` to swap in" bullet: the
named analog now exists as a shared abstraction; only the runtime behavior (accept-and-ignore)
stays a no-op, unchanged.

## 25. Typed `resolveFactory<F>` overload — the reference `ObjectFactory` return analog

`Resolver.resolveFactory` returned bare `unknown`, so a no-transformer caller resolving a factory
by hand had to cast the result. The reference container's factory-building API hands back a typed
`ObjectFactory` delegate; we now mirror that return typing.

- A typed overload `resolveFactory<F>(type: Token, params?: readonly Token[]): F` is added BEFORE the
  existing `unknown` fallback on `Resolver` (`di.core/src/provider.ts`) — typed-first / dynamic-last,
  mirroring the `resolve<T>` / `resolve` overload ordering. `F` is the factory's own function type,
  supplied by the caller (`resolveFactory<(a: A) => T>(…)`).
- The impl (`ServiceProviderClass.resolveFactory`, `di/src/scope.ts`) gains the matching overload
  signatures; the runtime body is UNCHANGED — it still returns the built callable as `unknown`, so the
  typed overload is purely compile-time. The `#makeProviderView` view's `resolveFactory` stays covered
  by the view's existing `as Resolver & ScopeFactory<S>` cast.
- **No transformer change.** The transformer emits `resolveFactory("tok", […])`, which still binds to
  the `unknown` fallback — the typed form is a hand-authoring convenience only. Verified green against
  the `di.transformer` suite and the integration e2e.

## 26. Drop gratuitous non-reference types from the `di.core` barrel

The `di.core` barrel re-exported two types with no reference analog and no cross-package consumer:

- **`DepTarget`** (`Ctor | Func<never[], unknown>`) — an internal helper naming "a class or factory a
  dep signature can be extracted from." Grep-verified zero external references. Removed from the
  barrel; the type stays DEFINED in `types.ts` for internal use, just no longer publicly exported.
- **`SealedManifest`** — the immutable snapshot `ServiceManifestClass.seal()` returns. Removed from
  the barrel too. `seal()` stays public, and `rollup-plugin-dts` keeps the rolled `.d.ts` sound by
  INLINING `SealedManifest` as a local (non-exported) declaration that `seal()` still references — no
  tsc error, no rollup breakage. It is now internal-but-structurally-reachable through `seal()`'s
  return type, not a named public export.

`Producer` and `ParsedToken` stay exported (both have cross-package references). `di`'s re-export
barrels (`types.ts` / `index.ts`) never surfaced `DepTarget` or `SealedManifest`, so no `di`-side
change was needed.

## 27. Extract `RequiredResolver` + `ServiceQuery` capability interfaces from `Resolver`

`Resolver` was one flat interface bundling every resolution method. The reference DI splits two of
those out as named capability abstractions — `ISupportRequiredService` (the throwing
`GetRequiredService`) and `IServiceProviderIsService` (the `IsService` query). We now name the same
seams while keeping ONE bundled surface consumers program against.

- **Two new di.core interfaces** (`provider.ts`): `RequiredResolver { resolve<T>(token): T;
  resolve(token): unknown }` (the `ISupportRequiredService` analog) and `ServiceQuery {
  isService(token): boolean }` (the `IServiceProviderIsService` analog). `Resolver` now `extends
  RequiredResolver, ServiceQuery` and drops the inherited `resolve` / `isService` declarations from
  its own body — `resolveAsync`, `tryResolve`, `resolveFactory` stay on `Resolver`. Both new
  interfaces are exported from the di.core barrel and re-exported from `di`.
- **The transformer's tokenless overloads are RE-TARGETED** (`di.transformer/src/augment.ts`): the
  `declare module` merge now adds `resolve<T>()` / `resolve<F>()` onto `RequiredResolver`,
  `isService<T>()` onto `ServiceQuery`, and keeps `resolveAsync` / `tryResolve` on `Resolver`. Each
  tokenless overload MUST merge onto the same interface that declares its explicit-token form — an
  overload merged onto a DERIVED interface does not combine with a base interface's declaration of
  the same method into one overload set. `Resolver` (and `ServiceProvider`, which extends it) then
  inherits the full merged set.
- **Zero runtime change.** `ServiceProviderClass` still implements the composed `Resolver`, and the
  `#makeProviderView` object literal is untouched. Verified green across every package typecheck, the
  `di.transformer` suite (181 tests), the `di.tests.integration` e2e (53 tests), and both
  `examples.app` output-diff runs — overload resolution and transformer lowering are unaffected.

## 28. Augmentations: one named object literal per ME static class, `applyAugmentations`, `defineExtensions` dropped — supersedes §22 — #115

This shape landed in #115, replacing the §22 form (`ExtensionSet`/`defineExtensions`/
`applyExtensions`, one free function per method, `primitives/src/extensions.ts`). Every augmentation
site now follows the rule below.

- **Authoring form.** Every augmentation is now a single _named exported object literal_ that
  mirrors exactly ONE reference-stack ("ME") static extension class, checked with `satisfies
  AugmentationSet<R>` (the type lives in `primitives`, alongside its predecessor). The const's name
  IS that ME static class's name — `JsonConfigurationExtensions`, `ConfigurationExtensions`, etc. —
  and its members are that class's static methods, camelCased and receiver-first (receiver = the
  extended type, as the first parameter). Group by ME static class, not merely by receiver type or
  package: one receiver can be augmented by several ME classes, each its own object literal.
- **No floating free functions.** Top-level standalone `export function addX(receiver, …)` exports
  are gone. The standalone/functional call surface IS the object-literal member —
  `JsonConfigurationExtensions.addJsonFile(builder, …)`, reached by importing the const. Accepted
  trade-off: per-method tree-shaking of the standalone form is lost, since importing the const pulls
  in every member of that ME class's group — acceptable, because that surface is a fallback and the
  prototype method stays primary.
- **Installer: `applyAugmentations`.** `applyAugmentations<R extends new (...args: any[]) => any>
  (Ctor: R, augmentations: AugmentationSet<InstanceType<R>>)` mounts each member onto
  `Ctor.prototype` as a `this`-forwarding, return-preserving method — constructor-constrained, with
  the receiver type derived via `InstanceType<R>`, no casts.
- **`defineExtensions` is removed.** `satisfies AugmentationSet<R>` alone does the validation the
  curried identity function used to carry. Same accepted gap as before: `satisfies` lets a member
  declare zero args (still fine — a body that never touches its receiver is a self-evident mistake),
  and each member's receiver param is annotated explicitly rather than inferred.
- **Terminology: "augmentation," not "extension," in every term WE coined.** `AugmentationSet`
  (was `ExtensionSet`), `applyAugmentations` (was `applyExtensions`), the file
  `primitives/src/augmentations.ts` (was `extensions.ts`), the `.augmentations` package qualifier
  (unchanged — it already used the word), and all our own prose. **Exception:** the exported
  grouping const keeps its ME-mirror name verbatim even though that name contains the word
  "Extensions" (`JsonConfigurationExtensions`) — it's an ME proper noun, deliberately exempt from
  the rename.
- **Type:** `AugmentationSet<R> = Record<string, (receiver: R, ...args: any[]) => unknown>`.
- Everything else §22 settled is unchanged and still governs: the cross-package
  `.core`-interface/downstream-concrete install rule, the runtime-identity requirement on the
  patched `Ctor` (§9-style external-bundling), and the listed deferrals. Only the authoring shape
  and the `primitives` symbol/file names move.
- **One ME static class can span multiple receivers.** ME's `FilterLoggingBuilderExtensions`,
  `MetricsBuilderExtensions`, and `TracingBuilderExtensions` each carry overloads on TWO receivers —
  the builder interface AND a value object (`LoggerFilterOptions` / `MetricsOptions` /
  `TracingOptions`) — under the same method name, distinguished only by `this`. Since one object
  literal binds one receiver type (`satisfies AugmentationSet<R>`), such a class becomes TWO
  literals: the builder-receiver one keeps the ME class name (`MetricsBuilderExtensions`), the
  value-object one is named after its receiver (`MetricsOptionsExtensions`,
  `LoggerFilterOptionsExtensions`) because the ME class name is already taken. The members still
  match ME method-for-method; only the grouping const differs (resolved in §29).

## 29. Options-bag receivers get the method form — closes the §22/§28 deferral — #105

§22's deferral list held back the method (prototype-installed) form for the augmentation members
whose receiver is a plain **value object** rather than a builder/manifest interface: `addFilter`
(`LoggerFilterOptions`), and the rule mutators on `MetricsOptions`/`TracingOptions`. Their standalone
object-literal form already shipped; only the instance-method half was pending, so nothing was
broken — the surface was just asymmetric for these three receivers.

**Resolution — give them the method form.** Deciding axis: match the ME public API, which settles it
cleanly. ME ships **each of these as a public extension method whose `this` receiver IS the value
object** (`AddFilter(this LoggerFilterOptions, …)` in `FilterLoggingBuilderExtensions`;
`EnableMetrics`/`DisableMetrics(this MetricsOptions, …)` in `MetricsBuilderExtensions`;
`EnableTracing`/`DisableTracing(this TracingOptions, …)` in `TracingBuilderExtensions`), each sitting
beside the builder overload of the same name. So this was never a philosophical "should we patch a
bare options bag" call — ME's surface answers yes. Each value-object literal is prototype-installed
onto its concrete class exactly like every other dual-export augmentation, via the cross-package rule
(§28): the install lives wherever the concrete class does — **in `diagnostics.core`** for
`MetricsOptions`/`TracingOptions` (both class and literal are in-package;
`diagnostics.core/src/options-augmentations.ts`) and **in `logging`** for `LoggerFilterOptions`
(`logging/src/filter-augmentations.ts`). `diagnostics.core` gains `"sideEffects": true` for the new
install import, matching `logging`/`diagnostics`.

**Rename: drop the `Rule` suffix.** ME names the value-object overloads identically to the builder
overloads — `EnableMetrics`/`DisableMetrics`/`EnableTracing`/`DisableTracing` — distinguished only by
receiver. The repo's `enableMetricsRule`/`disableMetricsRule`/`enableTracingRule`/`disableTracingRule`
carried a `Rule` suffix that existed only to avoid a top-level `export function` name-collision with
the builder-receiver overloads. §28 removes floating free functions, so the two overloads are now
members of two different object literals and no longer collide → renamed to
`enableMetrics`/`disableMetrics`/`enableTracing`/`disableTracing`, matching ME exactly. (`addFilter`
already matched — ME's is `AddFilter` on both receivers.)

**Still standalone-only, permanently:** `tryGetValue` (`IMemoryCache`) — a method form would clash
with `IMemoryCache`'s own `tryGetValue` member and, at runtime, overwrite the implementation the
augmentation wraps (unchanged from §22).

## 30. `colonAndDotVariableNameTransformation` — a second env variable-name transform

The default env transform only ever produces `:` delimiters. ME ships a second stock
transform beside the default one for names that also want a `.` delimiter; the port had no
equivalent.

- **`colonAndDotVariableNameTransformation`** (`config.env/environment-variables-configuration-source.ts`)
  replaces every `___` with `.`, then every remaining `__` with `:`. The `___` pass MUST run
  first — reversing the order would consume two of every three underscores in a `___` run as a
  `:`, leaving a stray `_` where a `.` belonged. Both passes are ordinary non-overlapping
  left-to-right `replaceAll` scans; a run of underscores is always consumed greedily from the
  left, so a run of four is one triple plus a literal trailing underscore (`._`), never two
  colons — verified equivalent to ME's own character-by-character scan for any run length, not
  just the common cases.
- Exported alongside `defaultVariableNameTransformation` from the package barrel; usable
  directly as a source's `variableNameTransformation` option, no wiring needed.
- **Housekeeping folded in here:** this pass also scrubbed three comments in `config.core`/`config`
  that named the reference runtime directly instead of using the repo's ME shorthand (naming-taboo
  hygiene, no behavior change).

## 31. Env prefix is normalized through `variableNameTransformation` before matching

`EnvironmentVariablesConfigurationProvider` matched `source.prefix` against already-transformed
variable names but never ran the prefix itself through the same transform. ME transforms the
prefix once (in its constructor); a caller porting an ME-style prefix spelled in the raw,
pre-transform form (e.g. `Logging__`) silently matched nothing here — an empty config with no
error.

- **Fix:** `load()` now computes `variableNameTransformation(prefix)` once per call and matches
  against that, instead of the raw `prefix` field (`config.env/environment-variables-configuration-provider.ts`).
  Recomputed per `load()`, not cached at construction, because the source's `prefix` and
  `variableNameTransformation` fields are both mutable (§9-adjacent — matches this file's existing
  "the source is live, not frozen" test coverage).
  Computing it once per `load()`, before the per-variable loop, keeps the change O(1) extra work
  rather than O(variables).
- **Strict superset, not a breaking change:** the transformation is idempotent on an
  already-delimited prefix (there is nothing left in `Logging:` for the transform to touch), so
  both `Logging__` and `Logging:` now match identically.

## 32. `ConfigurationManager` seeds a default memory source in its constructor

A fresh `ConfigurationManager` had zero sources, so `set()` before any `add()` threw "no
configuration sources are registered". ME's constructor seeds one empty memory source for
exactly this reason — there is nowhere to write before a real source exists otherwise.

- **Fix:** the constructor now calls `this.add(new MemoryConfigurationSource())`
  (`config/configuration-manager.ts`) — through the NORMAL `add()` path, so the seeded source
  shows up in `sources` and `providers` like any other, mirroring how ME seeds it through its own
  `Sources.Add`. It is the first (lowest-precedence) source registered, so it never shadows
  anything added afterward, and — being empty — it contributes zero keys to any read.
- No consumer (including `hosting`'s two `ConfigurationManager` construction sites) inspects
  `sources.length` or otherwise distinguishes a zero- from a one-seeded-source manager, so this
  is a pure behavior gain with no observed regression surface.

## 33. Friendly provider labels — `ConfigurationProvider#toString`

`getDebugView` (§21) rendered every provider as `String(provider)`, which — since no provider
overrode `toString` — was always the default `[object Object]` tag. §21 flagged this as
"acceptable until a provider identity is designed." ME renders the provider's type name (and its
file provider adds path + optional flag); this closes that gap.

- **`ConfigurationProvider#toString`** (`config/configuration-provider.ts`) defaults to
  `this.constructor.name` (e.g. `MemoryConfigurationProvider`). Relies on unminified `dist` output,
  true today (`scripts/build-package.ts` does not minify); a hardcoded per-class override is the
  documented fallback if minification ever lands.
- **`JsonConfigurationProvider` overrides it** to add path and required/optional flag —
  `JsonConfigurationProvider for '<path>' (Required|Optional)` — matching the reference file
  provider's own label format exactly.
- Supersedes §21's "getDebugView provider labels are `String(provider)`" bullet: that gap is now
  closed for the base case, with per-provider refinement available to any future provider that
  wants one (env/commandline/memory keep the base class-name default — no consumer asked for more).

## 34. Bare `key=value` argv tokens are honored

ME's argv parser accepts a bare (no leading dash) `Key=Value` token as config, split at the
first `=`; the port silently dropped every bare token as a positional — a real format gap that
also sat oddly next to this source's otherwise fail-loud stance on malformed input.

- **Fix:** a bare token containing `=` is now split at the FIRST `=` into key/value and honored;
  a bare token with no `=` remains a positional and stays silently ignored, consistent with the
  existing post-`--` ignore (`config.commandline/command-line-configuration-provider.ts`).
- **Pre-existing behavior, now explicitly pinned as a regression baseline before this change
  landed:** the suite already had test coverage for the four deliberate parser behaviors this
  sits next to and that are NOT documented anywhere else — `--` end-of-options termination,
  valueless-boolean-flag inference (`--Verbose --Port 8080`), the negative-number value heuristic
  (`--Offset -5`), and `/switch`-to-`--switch` normalization scoped to switch position only. All
  four stayed green, untouched, through this change.

## 35. Provider augmentations install onto `ConfigurationManager`, not just `ConfigurationBuilder`

Every `add*` augmentation (`addInMemoryCollection`, `addJsonFile`, `addEnvironmentVariables`,
`addCommandLine`) installed only onto `ConfigurationBuilder`'s prototype. ME's extension methods
target `IConfigurationBuilder`, and `ConfigurationManager` implements that same shape — so
`manager.addJsonFile(...)` (the natural `builder.configuration.addJsonFile(...)` idiom inside a
hosting-style builder) was structurally impossible here, a reachability gap with no ME
counterpart.

- **New `"./configuration-manager"` export subpath** on `@rhombus-std/config`
  (`libraries/config/package.json`), mirroring the existing `"./configuration-builder"` subpath
  and for the identical reason: a provider package must `declare module` onto the class's
  DECLARING module, never the barrel, or a second augmenter produces a phantom-duplicate class
  type (§28's install rule). `ConfigurationManager` has no generic parameter, so there is no
  TS2428 arity concern the way there is for `ConfigurationBuilder<T>`.
- **Each augmentation's receiver type is widened from `ConfigurationBuilder<T>` to a generic
  bound** — `<TBuilder extends { add(source: IConfigurationSource): TBuilder }>` — rather than
  the receiver being pinned to the concrete builder class. Both `ConfigurationBuilder<T>` and
  `ConfigurationManager` satisfy that shape, so ONE object literal satisfies `AugmentationSet` for
  both classes via two separate `applyAugmentations` calls, while still preserving each
  receiver's own concrete return type through the fluent chain (`ConfigurationBuilder<T>` keeps
  `T`; `ConfigurationManager` stays `ConfigurationManager`) — confirmed by a standalone
  compilation check before landing, not just by the widened type happening to compile once.
  Routing the receiver through the interface type instead (the alternative that needs no generic)
  was rejected: `IConfigurationBuilder.add()`'s `this`-return collapses to the interface itself at
  that call site, which would have lost `ConfigurationBuilder<T>`'s type-preserving chain — the
  exact typed-build ergonomics the generic `ConfigurationBuilder<T>` design exists to keep.
- Landed per provider package: `config` (memory), `config.json`, `config.env`,
  `config.commandline` — each gets its own `declare module ".../configuration-manager"` block and
  a second `applyAugmentations(ConfigurationManager, ...)` call, following §28's pattern exactly.

## 36. Repo-wide §28 completion: hosting converted, audit disposition — closes #115

#120 established §28 and converted the first batch (config providers, diagnostics/logging builders,
caching, options.augmentations, logging.configuration); #121 gave the options value objects the
method form (§29). #115 finishes the repo-wide application: hosting was the last family still on the
pre-§28 free-function shape, and a full audit confirms no other augmentation site remains.

- **hosting / hosting.core (supersedes #109).** Every previously-standalone `export function` is now
  an object literal per its ME static class, with the method form installed:
  `HostingAbstractionsHostExtensions` (IHost: `run`/`runAsync`/`waitForShutdownAsync`/
  `stopWithTimeout`), `HostingAbstractionsHostBuilderExtensions` (IHostBuilder: `startHost`),
  `HostEnvironmentEnvExtensions` (IHostEnvironment: `isEnvironment`/`isDevelopment`/`isStaging`/
  `isProduction`), `ServiceCollectionHostedServiceExtensions` (`addHostedService`, moved off its
  hand-rolled `.prototype` assignment onto `applyAugmentations`), and the runtime
  `HostingHostBuilderExtensions` (IHostBuilder: `configureDefaults`/`useEnvironment`/`useContentRoot`/
  `configureHostOptions`/`configureLogging`/`configureMetrics`/`useDefaultServiceProvider`/
  `useConsoleLifetime`/`runConsoleAsync`). The IHost/IHostBuilder/IHostEnvironment receiver
  interfaces live in `hosting.core`, but their only concrete classes (`Host`/`HostBuilder`/
  `HostingEnvironment`) live in `hosting`, so per the cross-package rule the `declare module` merge
  AND the `applyAugmentations` install both live downstream in `hosting` (`./host-augmentations`),
  against the `internal/*` concretes — keeping them external (§9). `hosting.core` gains a
  `@rhombus-std/primitives` dependency for `AugmentationSet`/`applyAugmentations`. The examples now
  call the fluent `host.runAsync()` in place of the old free `runAsync(host)`.
- **Audit disposition — no other stragglers.** A repo-wide `export function` sweep confirms every
  remaining top-level receiver-first export is _not_ a dual-export augmentation. Deliberately-excluded
  (unchanged from §28): `config`'s transformer-coupled `withType`. Left as free-functions-only by an
  earlier documented design decision (a receiver-first port of an ME extension class that this repo
  chose NOT to dual-export): `logging.core`'s `LoggerExtensions` `log*` wrappers, and `config`'s
  `ConfigurationExtensions`/`ConfigurationRootExtensions` (`getConnectionString`/`exists`/
  `getRequiredSection`/`asEnumerable`/`getDebugView`). These carry no prototype-method form on any
  concrete class — `ILogger`/`IConfiguration` have several impls and no single downstream concrete
  to patch — so §28 (which governs how dual-export augmentations are _authored_, not which ports
  become augmentations) does not reach them. (§42 retires the "two-overload public signatures …
  would flatten" clause this entry originally also cited — overloading no longer forces a member
  standalone.) Everything else the sweep surfaced is an ordinary helper, token factory, or
  transformer internal.

## 37. Chained configuration source — closes the `hosting` half of #126's deferral

#126 closed the `ConfigurationManager` reachability gap for the `add*` provider augmentations
(§35) but explicitly deferred `hosting` as a separate follow-up: a chained-configuration source
didn't exist yet, so `hosting`'s host→app configuration fold was a one-shot `flattenConfiguration`
snapshot into a `MemoryConfigurationSource`, not a live composition. This ports the reference's
chaining building block and switches `hosting` onto it.

- **`ChainedConfigurationSource`/`ChainedConfigurationProvider`** (`config/src/chained/`) — wraps an
  already-built `IConfiguration` as a source. Bundled directly into `@rhombus-std/config` (like
  Memory), not a separate provider package — a chained source composes the classes it lives beside,
  not an optional add-on. `ChainedConfigurationProvider` implements `IConfigurationProvider`
  directly rather than extending the abstract `ConfigurationProvider` base: it holds no key/value
  store of its own, so the base's case-insensitive dictionary would go unused — every read/write/
  reload-token/child-key call delegates straight through to the wrapped configuration instead.
  - `tryGet` treats an empty-string value as a miss, matching the reference's `IsNullOrEmpty` check
    on the wrapped configuration's indexer read.
  - `load()`'s first call is a no-op (the wrapped configuration is assumed already built/loaded —
    treating construction as a load would raise a spurious reload notification); a LATER call
    reloads the wrapped configuration's own providers, when it is itself a root.
  - The "is this a root" test is duck-typed (checks for a `reload` member), not
    `instanceof ConfigurationRoot` — a chained `ConfigurationManager` is also a root by the
    reference's own `IConfigurationRoot` contract, and `instanceof` would miss it silently
    (regression-covered).
  - `toString()` is added on this class specifically, defaulting to `this.constructor.name` — the
    same fallback `ConfigurationProvider#toString` (§33) provides its subclasses — since
    implementing the interface directly forfeits that inherited default; without it, `getDebugView`
    would render this provider as `[object Object]`.
- **`addConfiguration` augmentation** (`config/src/chained/index.ts`) — mirrors the reference
  `ChainedBuilderExtensions.AddConfiguration`, collapsing its two overloads into one method with
  `shouldDisposeConfiguration = false`. Installed on BOTH `ConfigurationBuilder` and
  `ConfigurationManager` from the start, following §35's dual-install pattern directly — no
  `ConfigurationBuilder`-only interim to fix later.
- **`hosting`'s host→app configuration fold is now live, not snapshotted.** `HostBuilder.build()`'s
  step 4 replaces `appConfigBuilder.add(new MemoryConfigurationSource({ initialData:
  [...flattenConfiguration(hostConfiguration)] }))` with `appConfigBuilder.addConfiguration(hostConfiguration)`.
  `flattenConfiguration` (`host-composition.ts`) is deleted along with its only call site. Observable
  behavior is unchanged for every current host-config source (env vars, args, in-memory overrides —
  all non-reload-capable today): flattening-then-reconstructing and delegating-to-the-live-tree
  produce identical read and child-enumeration results for those. The difference only surfaces for a
  future reload-capable host source, which now actually propagates into the application
  configuration — something a snapshot could never do.
- **`HostApplicationBuilder`'s constructor gets the M2 payoff directly.** Its two inline
  `this.#configuration.add(new XSource(...))` calls (environment variables; the settings-override
  memory source) were never routed through a shared `IConfigurationBuilder`-typed helper, so they
  become `this.#configuration.addEnvironmentVariables(...)` / `.addInMemoryCollection(...)` —
  `this.#configuration` is concretely a `ConfigurationManager` at those call sites.
- **`default-configuration.ts`'s shared helpers stay on the raw `.add(new Source(...))` form,
  deliberately.** `applyDefaultHostConfiguration`/`applyDefaultAppConfiguration`/
  `addCommandLineConfig`/`setDefaultContentRoot` are reused by BOTH builders, but the classic
  `HostBuilder`'s `configureHostConfiguration`/`configureAppConfiguration` (`IHostBuilder`, mirroring
  the reference `Action<IConfigurationBuilder>`) hand these functions a plain
  `IConfigurationBuilder`-typed value — a declaration-merged prototype method isn't visible through
  an interface type, only through the concrete class it was merged onto. Narrowing these functions'
  parameter type would break that call path; duplicating them per-builder to get sugar on the modern
  side only was rejected (two sources of truth for zero behavior change). This is the one place the
  M2 payoff doesn't reach, and it's a real ME-parity boundary (the delegate signature), not an
  oversight.

## 38. The augmentation registry: OPEN receivers install via token + event bus — supersedes §28's install mechanics

§28 fixed the _authoring_ shape (one named object literal per ME static extension class,
`satisfies AugmentationSet<R>`, receiver-first members, the const IS the standalone surface) but
left the _install_ mechanics direct: every extender called `applyAugmentations(ConcreteClass, Set)`
itself, which required the extender to import the concrete class. That coupling had a confirmed
casualty: `hosting`'s independent `MetricsBuilder` never received `enableMetrics` — diagnostics'
direct install couldn't reach a concrete class it had never heard of. The registry decouples the
two sides. §28's authoring shape is unchanged; only the install path for OPEN receivers moves.

- **OPEN vs CLOSED receivers.** A receiver interface extended by downstream packages
  (`ServiceManifest`, `IConfigurationBuilder`, `ILoggingBuilder`, `IMetricsBuilder`,
  `ITracingBuilder`, `IHost`, `IHostBuilder`, `IHostEnvironment`) is OPEN: extenders register
  against a token, concrete classes subscribe by decorator. A receiver whose interface AND all
  augmentations live in one family (`IMemoryCache`/`ICacheEntry`, `MetricsOptions`/
  `TracingOptions`, `LoggerFilterOptions`, the promoted `IConfiguration`/`IConfigurationRoot`
  consts) is CLOSED and keeps §28's direct `applyAugmentations` — no token, no registry.
  CLOSED receivers with MANY implementers (`IConfiguration`/`IConfigurationRoot` — wrappers and
  fakes are handed to e.g. `ChainedConfigurationProvider`) get NO interface-side merge: it would
  force phantom members (typed but only installed on our concrete prototypes) onto every
  implementer, the same several-impls reasoning that kept `ILogger`'s `log*` wrappers
  standalone-only (§36). Their fluent form is typed per concrete class; interface-typed values
  use the standalone member.
- **The mechanism** (`primitives/src/augmentation-registry.ts`): a module-level
  `Map<Token, bag>` plus a DOM-standard `EventTarget` bus. `registerAugmentations(token, set)`
  merges `set` into the token's bag — **throwing on member-name collision** (the bag namespace is
  flat per token; loud failure beats silent clobber, and install order is deliberately
  unordered) — then dispatches an `Event(token)`. `augment(token)` is a TC39 standard class
  decorator: it subscribes a listener that (re)installs the token's full bag onto the class
  prototype (the same this-forwarding thunks `applyAugmentations` mounts) and pulls once
  immediately. Listeners stay subscribed forever, so a LATER `registerAugmentations` reaches every
  already-decorated class — import order stops mattering. No Proxy, no observable; re-install is an
  idempotent `Object.assign`. `Token` itself is hoisted from di.core to primitives (di.core
  re-exports it), since config-family tokens can't depend on di.core (di ⊥ config).
- **Token constants**, one per OPEN receiver, named `<RECEIVER>_AUGMENTATION_TOKEN` with
  nameof-format values (`"<package>:<TypeName>"`), each owned by the `.core` package that owns the
  receiver interface. One token can decorate several classes (`ConfigurationBuilder` AND
  `ConfigurationManager`; diagnostics' AND hosting's `MetricsBuilder` — fixing the orphaned-builder
  bug for good, regression-covered in `tests/augmentations.test`).
- **Self-registration moves consts' interface merges into `.core` (retires §28's
  "merge lives downstream" rule for OPEN receivers).** Because the registry decouples install from
  the concrete class, a const authored in a `.core` package now registers its own runtime there,
  and its interface-side `declare module` merge moves in beside it. Class-side merges (needed so a
  src-compiled concrete class still satisfies `implements` once the interface grows members) stay
  downstream next to each class; they are retired per-lib as libs convert to dist builds (#68).
- **Merge-identity rule (hard-won):** every interface-side merge for one interface must target the
  interface's DECLARING module — same resolved file, any specifier. Mixing a package-barrel
  augmentation (`declare module "@rhombus-std/diagnostics.core"`) with a declaring-module one
  (`declare module "./metrics-builder"`) makes TS treat the accumulated `this`-returning members as
  having unrelated this-types, and the concrete classes stop satisfying `implements`. Downstream
  packages therefore merge via the `internal/*` subpath (e.g.
  `"@rhombus-std/diagnostics.core/internal/metrics-builder"`), which resolves to the same source
  file as the owning package's relative merge.
- **Runtime-identity invariant (§9 extension):** every bundling package keeps
  `@rhombus-std/primitives` EXTERNAL — an inlined copy forks the registry's Map + bus and the
  whole mechanism silently splits. Same for `@rhombus-std/config.core`, which loses its pure-types
  status: the `CONFIGURATION_BUILDER_AUGMENTATION_TOKEN` const is its one runtime export, so it now
  ships a real `dist/index.js`.
- **New ME surface landed with the migration:** di.core's `ServiceCollectionDescriptorExtensions`
  (`removeAll`; `tryAddEnumerable` deferred — the normalized `Registration` collapses
  implementation identity into an opaque `produce` closure, so the (serviceType, implementationType)
  dedup key isn't recoverable; tracked against #75), which unstubs logging's `clearProviders`;
  di's `build()` prototype patch re-homed as `ServiceCollectionContainerBuilderExtensions`;
  options' `postConfigure` + `validate` (the ME analog of `validate` is the unported
  `OptionsBuilder.Validate` instance method — the verb collapses onto the manifest, flagged
  deviation); `ChainedBuilderExtensions` re-shaped onto the registry (§37 content unchanged);
  logging.console's `ConsoleLoggerExtensions.addConsole` (consumed by hosting's default services).
- **The `configure` flat-namespace deviation:** ME puts delegate-`Configure` in
  `OptionsServiceCollectionExtensions`, but the collision-throw forbids a second `configure`
  member on the manifest token, so `OptionsConfigurationServiceCollectionExtensions.configure`
  absorbs the delegate overload by argument type (`IConfiguration | (opts) => void`) — the same
  disambiguation precedent as `addOptions`.
- **Caching ME-name fidelity:** `MemoryCacheEntryOptions` moves to caching.core (where ME's
  Abstractions has it); the invented `MemoryCacheExtensions`/`MemoryCacheEntryExtensions` consts
  are deleted, their members folded into `CacheExtensions` (`setWithOptions`/`getOrCreate*WithOptions`)
  and `CacheEntryExtensions` (`setEntryOptions` renamed `setOptions`, per ME). The freed
  `MemoryCacheEntryExtensions` name is reserved for ME's genuine fluent-options-builder class —
  deferred, YAGNI.
- **`primitives.transformer` extraction:** `nameof`/token-derivation (`nameof.ts`, `tokens.ts`,
  `grammar.ts`, `context.ts`) move from di.transformer into the new
  `@rhombus-std/primitives.transformer` (tokens are a primitives concept now); di.transformer
  depends on it and re-exports its full prior surface, so no consumer breaks. The new package also
  ships a minimal standalone transformer that rewrites only `nameof<T>()`, so di-free packages can
  mint tokens with sugar.
- **Options layout divergence (recorded):** `addOptions` stays in `options.augmentations` (§14's
  placement) rather than mirroring ME's in-package `OptionsServiceCollectionExtensions` home —
  the di ⊥ config bridge rationale is unchanged by the registry.

## 39. `primitives` owns the `AbortSignal`/`AbortController` typings

Library code across `hosting`, `hosting.core`, and `config` names the global `AbortSignal`/
`AbortController` types, but a library `tsconfig.json` carries no `types` array — those names
resolve today only because `@types/node` happens to be pulled in transitively. That leaks a
consumer-side requirement (lib.dom, `@types/node`, or bun-types, just to have `AbortSignal` in
scope) into the published rolled `.d.ts`. `primitives` — the zero-dep leaf every library already
depends on — now owns structural `AbortSignal`/`AbortController`/`AbortControllerConstructor`
interfaces (`libraries/primitives/src/abort.ts`) and a typed re-export of the constructor; every
library-side use switches to importing them. Every bundling package already keeps `primitives`
external (§38), so the import survives unresolved into the rolled `.d.ts` — a published consumer
sees our own types, not a platform-lib requirement.

- **Forced by a platform gap, not an ME port.** The reference gets its cancellation vocabulary
  (`CancellationToken`/`CancellationTokenSource`) from its base class library — every consumer of
  the reference implicitly has it. TypeScript has no equivalent always-present base; naming a
  global type is opt-in per program via `types`/`lib`. `AbortSignal`/`AbortController` have no ME
  analog to mirror — this is a TS-side gap primitives is the natural, and only, place to close,
  being the one package every family already depends on for exactly this kind of infrastructure.
- **Deliberately NOT `declare global`.** Augmenting the ambient `AbortSignal`/`AbortController`
  globals would collide with `@types/node`'s own declarations the moment both are in scope (most
  consumer programs). Owned, independently-named interfaces sidestep the collision entirely.
- **No runtime fallback.** The value export IS `globalThis.AbortController` — native since Node 15
  and native in bun/deno/browsers. Shipping a polyfill implementation would be pure YAGNI; nothing
  in this repo runs anywhere that global is absent.
- **The mutual-assignability keystone.** The interfaces are typed for MUTUAL assignability with
  both the lib.dom and `@types/node` variants. Members this repo actually calls (`aborted`,
  `reason`, `throwIfAborted`, the `"abort"` add/removeEventListener pair with `{ once }`,
  `abort(reason?)`, `signal`) are typed precisely; the `EventTarget` plumbing never touched here
  (`onabort`, `dispatchEvent`) is present-but-loose (`any`) so our signals stay assignable TO
  platform APIs (e.g. passing `applicationLifetime.applicationStopping` to
  `fetch(url, { signal })`) while platform signals stay assignable to our params. Tests and
  examples (which do carry bun/node types) are left on the platform globals unchanged — a platform
  instance is structurally assignable to our params either way.

## 40. Augmentation tokens are derived inline — `nameof<Interface>()` at every use site, no token consts

§38 minted one exported `<RECEIVER>_AUGMENTATION_TOKEN` const per OPEN receiver. Those consts are
gone: every `registerAugmentations(...)` / `@augment(...)` site now derives its token INLINE with
`nameof<Receiver>()` — the receiver interface itself is the token
(`nameof<ServiceManifest>()` → `"@rhombus-std/di.core:ServiceManifest"`,
`nameof<IConfigurationBuilder>()`, `nameof<ILoggingBuilder>()`, `nameof<IHost>()`, …). The
literal is byte-identical to what the consts hardcoded, so the wire format is unchanged; only the
spelling moves from a shared const to the type reference at each site. A no-transformer consumer
(the primary surface, per the repo rule) writes the literal string directly — the format stays
`"<declaring-package>:<TypeName>"`.

- **Every `nameof` caller is a transformer-consumer, and lowering must reach the SHIPPED JS.**
  `Bun.build` never runs ts-patch transformers, so each library that calls `nameof<T>()` gains a
  `tsconfig.build.json` (root config + `plugins: [{ transform: "@rhombus-std/primitives.transformer",
  import: "transform" }]`, `outDir: .tspc-out`) and a lowering stage in its publish build
  (`buildPackage`'s `tspcProject` option, or the equivalent inline stage in hosting's custom
  builds): `tspc` emits transformer-lowered per-file JS, and `bun build` bundles THAT emit.
  Un-lowered `nameof<T>()` throws at runtime by design — a loud failure, never a silent
  wrong-token.
- **The `bun` conditions flip to lowered artifacts.** The `.` export's `bun` condition moves to
  `./dist/index.js` and `internal/*`'s to `./dist/internal/*.js` — the retained per-file stage
  emit (`renameSync(.tspc-out → dist/internal)`), publish-excluded via `"!dist/internal"` in
  `files`. This keeps the white-box surface EXECUTABLE under bun: sibling test packages that
  import `internal/*` run the same lowered JS a published consumer gets, instead of raw src whose
  module-load-time `nameof` would throw. `@rhombus-std/config`'s `./configuration-builder` /
  `./configuration-manager` subpaths point at their `dist/internal` per-file emits, and
  `./with-type-augment` at its chunk-split `dist/with-type-augment.js` (chunk-splitting keeps the
  `ConfigurationBuilder` identity shared with the barrel).
- **One process must not load a registering module through BOTH the bundle and the per-file
  surface** — `registerAugmentations` throws on a duplicate member per token (§38), which is
  exactly the guard that catches it. White-box tests therefore reach the package under test
  through `internal/*` only (its cross-package imports resolve to the other packages' bundles,
  which is fine — the registry is token-keyed and copy-tolerant by design).
- **`deriveToken` normalizes defaults-only alias instantiations to the BARE alias.** The checker
  records `aliasTypeArguments` for a bare reference to a defaulted-generic alias
  (`type ServiceManifest<S extends string = "singleton">`) inconsistently — a same-file reference
  arrived closed (`…:ServiceManifest<"singleton">`) while an imported reference arrived bare —
  so di.core's own `@augment` and everyone's `registerAugmentations` silently disagreed. Since a
  fully-defaulted instantiation IS the bare alias (identical type ⇒ identical token), the alias
  branch of `genericTypeArguments` now drops arguments that are reference-equal to the declared
  parameter defaults. Explicit non-default arguments still tokenize closed.
- **Newly-converted packages:** `di.core` (both `@augment(nameof<ServiceManifest>())` and the
  `removeAll` registration; `augmentation-tokens.ts` deleted, the const's index export gone),
  `di`, `options.augmentations`, `logging.configuration`, `logging.console` (the last two had
  dodged the Proof phase with file-local literal consts). `config.core` returns to PURE-TYPES
  status — the token const was its only runtime export, so `emitJs: false` + `assertNoJs` again.
- **Install defects fixed in the same pass:** logging.core's floating `ILogger` wrappers become a
  real `LoggerExtensions` set (file renamed `logger-augmentations.ts`) registered against
  `nameof<ILogger>()`, with `Logger`/`NullLogger` decorated `@augment(nameof<ILogger>())`;
  class-side `LoggerExtensionMethods` typing only — NO `ILogger` interface merge (§36), and the
  wrapper `log` is excluded from the prototype install (it would shadow the primitive and
  self-recurse — caching's `tryGetValue` precedent). caching's `CacheExtensions` /
  `CacheEntryExtensions` move from caching.memory's direct downstream `applyAugmentations` to the
  registry in caching.core (`nameof<IMemoryCache>()` / `nameof<ICacheEntry>()`, `tryGetValue`
  exclusion preserved), with `MemoryCache`/`CacheEntry` decorated in caching.memory.

## 41. `transforms/` — the Go/`ttsc` engine as a dual-track port of the four transformers

The four authoring-time transformers (`primitives.transformer` nameof/token-derivation core,
`di.transformer` registration lowering, `di.transformer.options` `addOptions<T>()`,
`config.transformer` `withType<T>()`) are ported to Go, compiled and run as `ttsc`
(`typescript-go`) plugin sidecars. The Go sources live in a NEW ROOT module `transforms/`
(`go.mod` `module github.com/fnioc/std/transforms`, one `cmd/` per plugin, shared logic under
`internal/`). This is a **second implementation**, not a replacement — the TS/ts-patch sources
and their test packages stay and keep passing verbatim.

- **Dual-track policy — the two engines have distinct jobs.** ts-patch/TS5 stays the
  **lint/typecheck gate** for transformer-consumers (the `tsc`/`tspc --noEmit` and eslint passes,
  the `built`-condition src-referencing story of the Build-layout section — all unchanged). The
  Go/`ttsc` path is the **build/emit engine**: it is what actually lowers `nameof<T>()` /
  `add<T>()` / `addOptions<T>()` / `withType<T>()` into the shipped JS. The two must produce
  **semantically equivalent lowering** — token strings byte-identical — and that equivalence is
  the load-bearing invariant, not the code shape.
- **Descriptor wiring mirrors the canonical `ttsc` recipe.** Each transformer package keeps its
  untouched ts-patch entry on the `.` export (`transform`), and gains a parallel `./ttsc` subpath
  pointing at a thin `ttsc.mjs` descriptor plus a `"ttsc": { "plugin": { "transform":
  "@rhombus-std/<pkg>/ttsc" } }` marker in its `package.json`. The descriptor is a JS shim whose
  only job is `path.resolve(context.dirname, "..", "..", "transforms", "cmd", "ttsc-<name>")` —
  it hands `ttsc` the ABSOLUTE PATH to the Go plugin source shipped in the monorepo, and `ttsc`
  compiles+runs it as a native sidecar with the local Go toolchain. `ttsc` / `typescript@^7` /
  `@ttsc/unplugin` are worktree-local bun devDeps; the isolated linker keeps the existing
  `typescript@5.9.3` packages untouched.
- **One native backend per pass → the aggregate host.** `ttsc` runs a single native plugin per
  source-to-source pass and hard-errors on two. A consumer needing both the registration transform
  AND its `addOptions` satellite (the app example) therefore cannot list two `/ttsc` plugins;
  it wires ONE aggregate — `transforms/cmd/ttsc-di-app`, exposed as
  `@rhombus-std/di.transformer.options/ttsc-app` — that composes both stages back-to-back over one
  loaded program. The satellite's transform is extracted to `internal/dioptionstransform` so the
  aggregate and the standalone `cmd/ttsc-di-options` share it; the call shapes are disjoint and
  order-independent, so tokens are identical to the two standalone sidecars.
- **The alias-symbol shim.** The checker records the type ALIAS a reference was spelled through in
  an unexported `alias` field; the `ttsc` shim surfaces it only as audit metadata, never as an
  accessor. `internal/tokens/alias.go` reads it via a layout-mirrored, offset-checked
  `unsafe.Pointer` cast (`aliasOf`) guarded by a checksum against the sanctioned `Type.Symbol()`
  accessor — fail-safe to "no alias" on struct drift. This is the sole route to alias symbol +
  type-arguments, needed for defaulted-generic normalization (§40) and Date/Map exclusion in the
  config schema walk.
- **The `ttsc`/Go path is an in-bundle transform, not a file-emitting compiler.** `ttsc -p` emits
  a stdout JSON envelope of lowered TS, not files, so the build engine runs the Go plugin(s) as a
  `@ttsc/unplugin/bun` onLoad source transform inside a `Bun.build` call (`ttscBunPlugin` /
  `ttscProject` in `scripts/build-package.ts`, parallel to `tspcProject`; a package sets one XOR
  the other). The toolchain is pinned in-process by `ttscEnv`: `GOTOOLCHAIN=local`,
  `TTSC_GO_BINARY` from `mise which go`, and `GOTMPDIR` redirected onto the disk-backed
  `node_modules/.cache/ttsc-gobuild` (a cold `typescript-go` compile overruns a size-capped tmpfs
  `/tmp`). `go` comes from mise ONLY (`mise.toml` pin), never system-wide. The committed
  `transforms/go.work` is machine-specific (absolute `node_modules` paths pinning the shims) and
  **gitignored** — `ttsc` materializes its own scratch workspace, so `go.mod` carries no `replace`.
- **Shared plugin-cache economics.** The compiled sidecar for each distinct plugin is cached at
  **repo-root** `node_modules/.cache/ttsc` (~25 MB/binary), NOT per-package — so the isolated
  linker does not force a cold rebuild per consumer. Cost is ~5 min cold, paid once per distinct
  plugin; warm emit is ~3-4 s. CI (`.github/workflows/ci.yml`) provisions Go via `jdx/mise-action`
  and restores this cache keyed on the Go sources + `go.mod` + `bun.lock` (the `ttsc` version),
  with the `verify` job timeout raised to survive a cold-cache run.
- **`caching.core` is the pilot; full library-tier conversion is a measured follow-up.** Only
  `caching.core` (a `nameof`-only consumer) flips its emit to `ttscProject` this pass — its dist
  output is byte-identical to the tspc twin (retained as `tsconfig.build.json`). The remaining
  `nameof` consumers stay on `tspcProject`. A `ttsc` package produces no per-file `dist/internal`
  white-box surface (`Bun.build` bundles), so a `ttsc` consumer that needs `internal/*` (§40's
  executable white-box story) is part of that follow-up; `caching.core` has no such consumer.
- **The parity harnesses are the bridge-keeper.** `tests/{di.transformer,di.transformer.options,
  config.transformer}.ttsc.e2e` assert the Go path lowers the existing TS parity corpus to the
  same tokens; the app example's `expected.txt` byte-diff is the end-to-end di+di-options proof.
  These harnesses expose a `test:e2e` script (NOT `test`) and self-skip when `mise which go`
  fails, so they are deliberately OUT of the default `bun --filter '*' test` gate — the same
  Go-dependency reasoning that keeps the parity e2e off the required check. They are a
  Go-provisioned / local gate for now; wiring a dedicated Go CI job that runs
  `*.ttsc.e2e` is the natural next step and intentionally not in the pilot PR.

## 42. Augmentation-set members are defined inline in the object literal — overloaded members too — #139, #140

§28 fixed the augmentation authoring _shape_ (one named object literal per ME static class,
`satisfies AugmentationSet<R>`, receiver-first members) but left open HOW each member's body is
written: many were authored as a standalone `function` pulled into the literal by shorthand
(`const X = { foo, … }`). This entry settles that on the direct form.

- **Members are defined INLINE as object methods** (`const X = { foo(receiver, …) { … }, … }`),
  not as standalone functions referenced by shorthand — directness/readability. #139 converted
  the 13 remaining shorthand-authored sets.
- **Same-const sibling calls use `ConstName.member(receiver, …)`, never `this`:** the install
  thunk (`installSet`, `primitives/src/augmentations.ts`) invokes members as a plain
  `fn(receiver, …)` call, so `this` is undefined on the installed method path.
- **Overloaded members inline too** — the earlier "an object-literal method key can't carry
  multiple call signatures, so overloaded members stay standalone" rationale is RETIRED. Two
  techniques, both preserving `satisfies AugmentationSet<R>`:
  - **Invariant return type** → a union-of-tuples rest parameter, destructured in the body, e.g.
    `set<T>(cache, ...rest: [k, v] | [k, v, Date] | [k, v, number] | [k, v, IChangeToken]): T`.
    Model: `Host.createApplicationBuilder` (`libraries/hosting/src/host.ts`). #140 inlined `set`
    (`CacheExtensions`), `setAbsoluteExpiration` (`CacheEntryExtensions`), and `addFilter`
    (`LoggerFilterOptionsExtensions`) this way.
  - **Varying return type** → cast the single implementation to an overload-signature object
    type: `fn: function (...args: any[]) { … } as { (p: number): number; (p: string): string }`
    (a lambda form needs parentheses: `((...args) => …) as { … }`). Not needed anywhere yet —
    recorded for completeness.
  - The method-form `declare module` overloads are unchanged either way; only the object-literal
    member's authoring shape changes.
- **The ONLY remaining reason to keep a member standalone is cross-package export** — a member
  imported by another package as a plain function (the 7 `log*` wrappers in `logging.core`,
  imported by `hosting`/`caching.memory`). Overloading alone no longer forces it.

Behavior-neutral: the `declare module` merges, `registerAugmentations`/`applyAugmentations`
installs, and runtime bodies are unchanged; the full gate stayed green with no test edits.

## 43. Build args derive from the manifest; tsconfigs extend shared root fragments

The 26 per-package `build.ts` files and the near-identical tsconfig bodies they sat beside were
restatements of information the package manifests already carried. Both are consolidated; dist
output was verified byte-identical before/after (sha256 over every `libraries/*/dist` file).

- **One build entry point** — every `libraries/*` `build` script runs
  `bun ../../scripts/build-lib.ts`, which typechecks (`tsc --noEmit -p tsconfig.json`) and then
  derives the `buildPackage` arguments from `package.json`:
  - `external` = `dependencies ∪ peerDependencies` — the §9/§38 runtime-identity invariant
    expressed as a rule: every runtime workspace dep stays external; devDependencies inline
    (which is how `config` folds in its extensionless-ESM vendored dep).
  - `entrypoints`/`dtsConfigs` from the `exports` map: any subpath whose `import` condition is a
    non-index `dist/*.js` adds `src/<n>.ts` + `rollup.<n>.dts.mjs` (one rolled d.ts per JS
    entry, asserted).
  - lowering engine by twin-config existence: `tsconfig.build.json` → tspc, `tsconfig.ttsc.json`
    → ttsc (§40/§41).
- **`rhombusBuild`** — an optional manifest field for the four genuine deviations, each with a
  `//rhombusBuild` why-note beside it: `caching.core` `{lowering: "ttsc"}` (§41 pilot holds both
  twin configs), `config.core` `{typesOnly: true}` (no JS bundle, asserted), `di.transformer`
  `{inline: […]}` (dist-parity carve-out — its retired bespoke build inlined two declared
  dependencies; aligning it to the rule is a published-bytes change, tracked as a follow-up),
  `config.transformer` `{forbidImports: ["@rhombus-std/config"]}` (bundle must stay
  @rhombus-std-free; the derived-external form makes the assert load-bearing, since a real
  import now survives bundling and is caught). The other 22 packages carry no field.
- **`scripts/build-all.ts` unchanged** — tiering and per-tier `bun --filter <names> build` keep
  working because the per-package `build` script entry is preserved; per-package invocation
  (`bun --filter '<pkg>' build`, `cd libraries/<pkg> && bun run build`) keeps working too.
  Process isolation per package is load-bearing: the ttsc adapter mutates `process.env`
  (GOROOT/GOTMPDIR), which an in-process parallel tier would race.
- **tsconfig fragments** — `/tsconfig.lib.json` (the noEmit library typecheck profile) and
  `/tsconfig.tspc.json` (the tspc lowering stage: `noEmit: false` + the ts-patch `plugins`
  entry, hoistable because ts-patch resolves the transform specifier from the `-p` project dir,
  where it is a declared devDep). Leaf `tsconfig.json` = extends + `include` (which must stay
  leaf-side — relative include globs anchor to the declaring file); leaf `tsconfig.build.json` =
  `extends: ["./tsconfig.json", "../../tsconfig.tspc.json"]` + `rootDir`/`outDir` (path options
  stay leaf-side, and the emit stage needs `rootDir` so `.tspc-out/` mirrors `src/`).
  `customConditions: ["built"]` stays leaf-side in the two transformer packages (§1/§9). The 18
  `tsconfig.lint.json` files were functionally identical to their `tsconfig.json` (tests moved
  to sibling packages long ago) — deleted, `lint` scripts repointed.

## 44. Zero ambient platform types in libraries — §39 finished and machine-checked

§39 gave `primitives` owned `AbortSignal`/`AbortController` typings so the published d.ts never
leans on lib.dom/@types/node. But the rest of the platform surface still resolved by ACCIDENT:
no library tsconfig had a `types` array, so tsc auto-included every `node_modules/@types`
walking up from the package — root `@types/bun` → `bun-types` → `@types/node` — and the gate
compiled a looser program than a bare published consumer sees (the honest program showed
TS2591/TS2304 across the fleet). This entry closes the gap:

- **`primitives` owns the remaining platform typings**, same recipe as §39 (typed `globalThis`
  lookup, no `declare global`):
  - `process.ts` — `ProcessLike` (exactly the observed member set: `env`, `cwd`,
    `stdout.write`, signal `on`/`off`) + a typed `process` value re-export; consumers
    (config.env, config.json, hosting, logging.console) import it instead of naming the ambient
    global. One-way assignability (platform → ours) is sufficient and type-tested.
  - `timers.ts` — opaque `TimeoutHandle` (`unknown`; the platform return type differs per
    runtime and handles only round-trip through our own `clearTimeout`) + typed
    `setTimeout`/`clearTimeout` re-exports; consumers: hosting.core, hosting.
  - `streams.ts` — structural `ReadableStream<R>` for the one stream type in a PUBLIC signature
    (fileproviders.core's `IFileInfo.createReadStream`); precise members + loose plumbing + an
    optional phantom `__chunkType?: R` for variance. The load-bearing platform → ours direction
    is type-tested; full §39 MUTUAL assignability is impossible here because bun-types extends
    its variant with required consumer-convenience members (`text`/`json`/`bytes`/`blob`/
    `values`) that lib.dom's variant lacks — one structural type cannot both carry them (breaks
    the lib.dom implementer) and omit them (fails ours → full-bun-interface).
  - `abort.ts` routes its `globalThis` cast through `unknown` (under the bare program the
    direct cast is a TS2352) and additionally exports **`neverSignal`** — a singleton inert
    never-aborting signal, the port's analog of the reference stack's never-cancelled token.
  - The augmentation registry's notify bus types `EventTarget`/`Event` structurally
    module-private (nothing public names them, so they are not exported).
- **`node:fs`/`node:path` get per-package compile-scope `src/node-builtins.d.ts`** (config.json,
  hosting) declaring exactly the imported signatures. Nothing imports these files, so
  rollup-plugin-dts never ships them; under a consumer program that has @types/node they merge
  as extra overloads (inert). Tighter than putting ambient `declare module "node:*"` blocks in
  primitives, which would leak them into every consumer program.
- **Enforcement: `types: []` in `/tsconfig.lib.json`** — every library (and, via extends, every
  lowering-stage config) now compiles the bare program, so the tsc 5.9 gate and the honest view
  can never silently diverge again; the §39 guarantee is machine-checked instead of accidental.
  Tests/examples keep their bun/node types deliberately; repo tooling gets its own
  `scripts/tsconfig.json` with `types: ["bun"]` (it runs under bun and is never published).
- The four transformer packages' `ttsc.mjs` shims declare a `ttsc` devDependency so the JSDoc
  `import("ttsc")` types resolve under bun's isolated linker (previously only caching.core did).

## 45. `src/` mirrors the ME package folder layout; single-type files are named after their type

The port's `src/` trees had drifted from the reference stack's own directory shape (`Metrics/`,
`Tracing/`, `Internal/`, `Extensions/`, …) and from a consistent filename convention, both
accidents of incremental porting rather than a decision. Neither was load-bearing for behavior,
but both cost lookup time when cross-checking against the reference source, so this entry settles
them as a repo-wide rule, applied in one mechanical pass (165 files, all renames — no content
changes beyond import-path rewrites).

- **Directory mirror.** A file whose ME counterpart lives in a subdirectory moves into the
  matching subdirectory: `diagnostics`/`diagnostics.core` gained `Metrics/` and `Tracing/` (each
  with a nested `Configuration/` for the binding half), `hosting` gained `Internal/`, `di.core`
  gained `Extensions/`. A file with no clean single-subdirectory ME source stays at package root
  — `diagnostics.core`'s `options-augmentations.ts` augments types declared in BOTH `Metrics/`
  and `Tracing/`, so it has no single mirrored home short of splitting the file (not done: no
  behavioral reason to split it).
- **Single-type filename.** Every `src` file that declares exactly one exported type, class, or
  interface is renamed to that name (`configuration-builder.ts` → `IConfigurationBuilder.ts` in
  `config.core`, → `ConfigurationBuilder.ts` in `config`; `cache-entry.ts` → `ICacheEntry.ts`).
  Files with more than one exported declaration (augmentation sets, index barrels, files with a
  type + its companion value) are left as-is — the rule only fires where "the file's name" and
  "the type's name" have exactly one honest answer.
- **Verification, not judgement calls.** Every proposed rename was checked mechanically before
  landing: the new basename must be exported from the file, and no renamed file may export more
  than one named declaration. Six renames had a genuinely ambiguous target subdirectory (no single
  ME source file to key off); each was resolved by hand against the reference source rather than
  left unrenamed.
- **Public surface is unaffected.** Only `src/*.ts` filenames and their relative/subpath imports
  move — `@rhombus-std/*/internal/*` subpath specifiers (including `declare module` augmentation
  targets) and `package.json` `exports` targets are rewritten to match, but the PUBLIC subpath
  names themselves (`./configuration-builder`, `./configuration-manager`, …) are unchanged, since
  those are the published contract, not an internal file layout detail.

## 46. Repo-wide TS conventions: `Func`/`Ctor`, `assertNever`, and import consolidation

A house-style sweep across every library, landed as this branch's bulk of commits. None of these
change behavior — the full gate stayed green throughout, verified per-family commit — they
tighten idiom consistency now that `@rhombus-toolkit/func` and `@rhombus-toolkit/type-guards` are
a dependency of every `libraries/*` package (`dependencies`, not `devDependencies` — they land in
the derived build `external` set per §43, and every published consumer needs them at the type
level even where no runtime call survives bundling).

- **`Func<Args, Return>` replaces every bare lambda function TYPE** — `(x: Foo) => Bar` becomes
  `Func<[Foo], Bar>`; a zero-arg form is `Func<[], T>`; a rest-param callback is
  `Func<any[], T>`. This is a type-only change (`import type { Func } from "@rhombus-toolkit/func"`)
  — arrow VALUES/expressions are untouched, only the type position. `Ctor` from the same package
  covers constructor-type positions (di's `DepTarget = Ctor | Func<never[], unknown>`).
- **`assertNever` closes every exhaustive switch/if-else chain over a union** — a runtime import
  from `@rhombus-toolkit/type-guards`, placed in the `default:`/final `else` arm (`caching.memory`'s
  priority switch, `config`'s schema-coercion switch, `logging.console`'s level switch). Bodies
  gain explicit braces per switch-case (`useBraces: always`) where they didn't already have them,
  since a `default: assertNever(x)` arm needs its own block like every other case.
- **Import consolidation is barrel-preferring, single-line, and type+value-merged.** A file that
  imports several names from the same specifier — whether a cross-package barrel
  (`@rhombus-std/di.core`) or a same-package sibling (`./index.js`) — merges them into ONE
  `import { … }` statement, inlining `type` on the individual specifiers that are type-only
  (`import { closeToken, type DepSlot, isFactoryRef, … } from "@rhombus-std/di.core"`) rather than
  a separate `import type { … }` statement for the same specifier. Within a package, sibling
  modules import from the package's own `./index.js` barrel where possible (`CancellationChangeToken`
  now pulls `AbortSignal, IChangeToken` from `primitives`' `./index.js` instead of two separate
  deep imports).
  - **Circular-import carve-out.** A file does NOT import its own package's barrel when doing so
    would close an import cycle — the barrel re-exports the file itself, or a sibling the barrel
    pulls in ahead of it. `caching.memory`'s `cache-entry.ts` is the canonical instance: it
    declares `IMemoryCacheHost` as a same-file interface specifically so it never has to import
    `MemoryCache` (which imports `cache-entry.ts`), breaking the cycle at the type level rather
    than importing around it. `index.ts` files, by construction, can never import their own
    barrel and always import siblings directly.

## 47. Published-facing OPEN-receiver merges resolve through the owning package's barrel — refines §38's merge-identity rule

§38's merge-identity rule already forbids mixing a barrel specifier and a declaring-module (`internal/*`)
specifier for merges targeting the SAME interface, because TS then treats the `this`-returning
members as unrelated this-types and `implements` breaks. This entry narrows the rule further for a
downstream package authoring a NEW merge onto an OPEN receiver it doesn't own: that merge must
resolve through the receiver's PUBLIC barrel, never `internal/*` — because the publish-time scrub
(§7) makes `internal/*` genuinely unreachable for a published extender, not merely discouraged.
`di.core`'s `authoring.ts` documents this as the canonical recipe: its worked example imports
`registerAugmentations`/`AugmentationSet` from `@rhombus-std/primitives`'s bare specifier, never an
internal path, precisely because a downstream author has no other route once published. A parallel
sweep (branch `fix-publish-merge-specifiers`) is auditing every existing OPEN-receiver merge and
flipping any that still resolve through `internal/*` to the barrel; this entry records the RULE
the sweep enforces, not its per-file diff.

## 48. Many-implementers receivers get no interface-side merge — generalizes §36's `ILogger` precedent

§36 left `ILogger`/`IConfiguration` without a prototype-method form because they have "several
impls and no single downstream concrete to patch," but didn't generalize the shape beyond those two
CLOSED-package cases. The distributed-cache slice (#147) hit the identical situation with
`IDistributedCache` — memory today, remote providers by design, hand-written test fakes — and
resolved it the same way, this time through the §38 REGISTRY rather than a bare standalone
function: `DistributedCacheExtensions` registers against `nameof<IDistributedCache>()` with NO
interface-side `declare module` merge (a merge would force phantom members onto every implementer,
present and future); each concrete class (`MemoryDistributedCache`) is `@augment`-decorated and
separately typed via an exported `DistributedCacheExtensionMethods` interface, so the method form
exists per concrete class without touching the interface. The general rule: a many-implementers
receiver — an interface with multiple present/future/test-fake implementers and no single owning
concrete — gets registry install + per-class `@augment` + an exported `*ExtensionMethods` typing
interface, and NO interface-side merge, whether the receiver is a CLOSED package (`ILogger`) or the
newer registry-based OPEN shape (`IDistributedCache`).

## 49. `caching.core`: `MemoryCacheEntryExtensions` — the third value-object CLOSED-set — #144

Ports the fluent sugar on `MemoryCacheEntryOptions` (`setPriority`/`setSize`/`addExpirationToken`/
`setAbsoluteExpiration`/`setSlidingExpiration`/`registerPostEvictionCallback`), each returning the
bag for chaining. `MemoryCacheEntryOptions` is a concrete class living in the SAME package as the
const, so — like `MetricsOptions`/`TracingOptions` (§17) and `LoggerFilterOptions` before it — this
is the reverse-direction value-object case: CLOSED set, direct `applyAugmentations` + class-side
`declare module` merge beside the const, no registry. `MemoryCacheEntryExtensions` is caching's
third instance of this recipe. Overload collapses mirror `CacheEntryExtensions`: the two
`SetAbsoluteExpiration` overloads (relative/absolute) collapse via the §42 union-tuple-rest form;
the two `RegisterPostEvictionCallback` overloads collapse into an optional `state` parameter.
Validation lives in the bag's own setters rather than duplicating the reference's explicit guards.

## 50. `logging.core`: `LoggerFactoryExtensions.createLogger` and `beginScope` join the standalone-only-permanently list — #145, #160

`LoggerFactoryExtensions.createLogger(factory, type)` (category-from-type logger creation) and
`ILogger`'s templated `beginScope` convenience wrapper both share a name with a primitive their own
receiver already defines (`ILoggerFactory.createLogger`, `ILogger.beginScope`). A registry install
would `Object.assign` a thunk over the concrete implementation, and for `createLogger` the
string-delegation path would recurse into itself. Both join `tryGetValue` (§29) and the plain `log`
wrapper (§40) on the standalone-only-permanently list: no token, no `@augment`, no interface- or
class-side merge — the call surface is the const's own member (`LoggerFactoryExtensions.createLogger
(factory, MyService)`). Category derivation for `createLogger` collapses the reference's
namespace-qualified/generic-stripped/nested-dot type-name helper entirely to the constructor's bare
`name` (a TS constructor carries none of that data); the parameter type is `AbstractCtor` (first
repo use, admitting abstract constructors to match the reference's `Type`-accepting form).

## 51. `logging`: `FilterLoggingBuilderExtensions` — the `ILoggingBuilder` half of `addFilter` — #146

Completes the reference's split `FilterLoggingBuilderExtensions` class: the `LoggerFilterOptions`-
receiver half was already ported; this adds the separate `ILoggingBuilder`-receiver const (an OPEN
receiver, registered via the registry against `nameof<ILoggingBuilder>()`), honoring the recorded
single-receiver-per-const split rather than folding the two into one. The reference's private
`ConfigureFilter` helper is realized by routing each `addFilter` call through `options.augmentations`'
`configure` verb at a new `LOGGER_FILTER_OPTIONS_TOKEN` — the first consumer of an OPEN options-
pipeline slot for a type the registering package (`logging`) doesn't own, establishing
`logging → options.augmentations` as a load-bearing edge (mirrors the reference `Logging → Options`
edge). Overload shape mirrors the options half: the two unambiguous shapes ((category, level) and
the raw 3-arg boolean filter) via the §42 union-tuple-rest inlining; the wider provider-scoped `<T>`
matrix stays unported sugar. `logging.configuration`'s separately-named, eagerly-bound filter token
is flagged to converge onto this pipeline token once its own lazy-binding gap closes (closed in
§54).

## 52. `config`: `InternalConfigurationRootExtensions` — the internal-static-class recipe's first instance — #148

The reference keeps child enumeration in an INTERNAL static extension class
(`InternalConfigurationRootExtensions.GetChildrenImplementation`), but the port had folded it into a
public instance method on `ConfigurationRoot` — an accidental public API that also shadowed the
`getChildrenImplementation` key in index navigation. Extracted into the §28/§42 authoring shape (one
object-literal const, receiver-first, `satisfies AugmentationSet<IConfigurationRoot>`) but marked
INTERNAL like its reference: exported only for the owning package's own call sites, never
barrel-exported, never installed on a prototype. This is the recipe's first instance and the
pattern for any future reference-internal static class: the same authoring shape as a public
augmentation, but no barrel export and no install path at all. Two reference members stay
deliberately unmirrored — the copy-on-write reference-counted-providers branch (its guarded
copy-on-write provider list is itself unported, no concurrent-reader story in a single-threaded
runtime), and `TryGetConfiguration` (dead code here, since every section read already routes
through `ConfigurationRoot.get`'s private `#rawGet`).

## 53. `logging.console` reaches full reference parity — formatters, colors, background queue — #149

Revokes the "advanced console surface omitted" deferral. Ports the `ConsoleFormatter` abstraction
plus all three built-ins (`Simple`/`Json`/`Systemd`), the full `ConsoleLoggerOptions`/
`ConsoleFormatterOptions` model, and the background writer — adapted from the reference's dedicated
writer THREAD to a microtask-drained async queue (`ConsoleLoggerProcessor`), with the write-path
semantics (drop-counting, error routing, dispose-time flush) kept faithful; `Wait` mode admits
messages past its limit rather than blocking the single-threaded drain (documented on the enum, not
a silent gap). `ConsoleLoggerExtensions` grows its full member set (`addConsole`/`addSimpleConsole`/
`addJsonConsole`/`addSystemdConsole`/`addConsoleFormatter`).

Divergences: colors are ANSI escape sequences (this platform's native color mechanism, so the
reference's ANSI-to-legacy-console translation layer has nothing to translate to and isn't ported);
`addConsoleFormatter` takes a constructed formatter instance rather than a DI-constructed generic
type (no-transformer-first); registration wiring is direct construction with the DI-pipeline
semantics reproduced (one provider per manifest via a `WeakMap`, configure delegates accumulating
through an internal `ReloadableOptions`). Residual, blocked on sibling-package types: `LogEntry`/
`IBufferedLogger`/`ISupportExternalScope`'s marker, and the config-binding pipeline — all closed by
§54/§55/§63 below.

## 54. `logging.configuration` reaches full reference parity — lazy filter pipeline + provider-configuration plumbing — #151

Revokes both deferments the package's own header documented. The one-arg `addConfiguration` no
longer eagerly binds; it now registers the faithful lazy pipeline (an `addOptions` assembly, a
`LoggerFilterConfigureOptions` configure step reshaped from the old eager `bindLoggerFilterOptions`
walk, and a `ConfigurationChangeTokenSource`) — nothing reads configuration until the options
materialize, and a reload re-runs the parse. The provider-configuration surface
(`ILoggerProviderConfigurationFactory`/`ILoggerProviderConfiguration<T>` + concretes,
`LoggerProviderOptions.registerProviderOptions`) is ported file-for-file, with the reference's
open-generic registration realized as a real di open template closing per provider via `typeArg(1)`.
The no-arg `AddConfiguration()` and the one-arg form share one receiver and one member name; the
registry's flat per-token bag forbids a second member, so one member absorbs both by arity (§42
union-tuple-rest — the `options.augmentations` `configure` precedent).

Two changes landed OUTSIDE the package, both load-bearing: **`options.augmentations` exports its
pipeline slot-token grammar** (`configureStepToken` et al.) — in the reference these slots are OPEN
public service contracts (any package may register an `IConfigureOptions<T>`/
`IOptionsChangeTokenSource<T>` for a type it doesn't own), which is exactly what this package's
`registerProviderOptions` does, so keeping the derivation helpers module-private would have forced
either a parallel diagnostics-style pipeline or string-grammar duplication. And **a `di` engine
fix**: `#isResolvable` now treats collection tokens (`Array<T>`/`Iterable<T>`) as always-satisfiable,
matching `#isKnown` and what `#resolve` already supported — without it, a constructor signature
naming a collection slot (the reference `IEnumerable<T>` injection the provider-configuration
factory needs) was rejected even though resolution would succeed.

Provider ALIAS lookup stays a residual here (needs a provider-alias analog in `logging.core`,
closed in §63).

## 55. `options`: startup validation — `IStartupValidator`/`StartupValidator`/`validateOnStart` — #152

Ports the reference options startup-validation surface into the collapsed shape: `IStartupValidator`
(the host-facing seam) and the built-in `StartupValidator` in `options`, plus the
`validateOnStart(token)` manifest verb in `options.augmentations` that marks a registration for
eager validation. `Host.start` resolves `IStartupValidator` (registered only when `validateOnStart`
ran) after hosted services resolve but before they start, so misconfiguration fails at boot rather
than on first use.

The reference verb hangs off `OptionsBuilder<TOptions>` (unported, §4.2); it collapses onto
`ServiceManifest` alongside `validate`/`postConfigure`, keyed by the options token, keeping the
reference static-class name `OptionsBuilderExtensions`. Targets accumulate through a flat collection
slot (§12) rather than the reference's dictionary-through-the-options-pipeline indirection —
realizing the previously-unused `options → di.core` edge, since the concrete validator is `options`'
first consumer of `di.core`'s `Resolver` type. Aggregation matches the reference: one failure
rethrows as itself, many aggregate as one `AggregateError`; async validation is out of scope (no
async pipeline exists to run it, stated so it isn't later "restored"). The augmentation file is
named `options-builder-augmentations.ts` after its reference class (renamed post-landing, #154/#163
— pure rename, no behavior change).

## 56. `di.core`: descriptor try-add/replace verbs, `ActivatorUtilities`, `EmptyServiceProvider` — #156

Three provider-side abstractions land, faithful-first with every divergence documented at its site:

- **`tryAdd`/`tryAddFactory`/`tryAddValue` + `replace`/`replaceFactory`/`replaceValue`** on
  `ServiceCollectionDescriptorExtensions` — conditional register-if-absent and unconditional
  replace, backed by a new `hasRegistrations(token)` primitive (the "already registered?" analog of
  `removeRegistrations`).
- **`ActivatorUtilities`** (`createInstance`/`createFactory`/`getServiceOrCreateInstance`) activates
  an unregistered class from a provider, injecting constructor deps via the same explicit `DepSlot`
  signature the rest of `di.core` uses, and never enters the resolution engine.
- **`EmptyServiceProvider`**, a stateless null-object `ServiceProvider` singleton where only the
  intrinsic provider token resolves.

Deliberate divergences: lifetime-named try-add verbs (`tryAddSingleton` etc.) collapse away —
lifetime here is always the fluent `.as(scope)`, so reintroducing named-lifetime verbs would bake in
scope names a manifest need not declare. There is no `ServiceDescriptor` object, so the reference's
descriptor-taking overloads collapse into per-kind verbs. Activation adapts to the no-reflection
model: no constructor-selection heuristics, no preferred-ctor marking, no keyed-service paths —
supplied arguments match constructor slots POSITIONALLY (a provider-satisfiable slot resolves, the
rest draw from args left to right) rather than by type-assignability, which TS cannot perform.
`EmptyServiceProvider` does not mirror empty-`IEnumerable<T>` resolution — that behavior is owned by
the resolution engine (`di`), and reproducing it here would fork that knowledge into `di.core`.

## 57. `di`: `ServiceProviderOptions` (`validateScopes`/`validateOnBuild`) + disposal aggregation — #157

`build(options?)` now accepts `{ validateScopes?, validateOnBuild? }`, both defaulting `false` per
the reference `Default`. The `ServiceProviderOptions` TYPE lives in `di.core` rather than the
reference's concrete-package placement, because `build(options?)` is declared on `di.core`'s
`ServiceManifestBase` authoring interface — the parameter type must be reachable without the
runtime engine. The reference's bare-`bool` convenience overload is deliberately collapsed into the
options object (a positional boolean is opaque at the call site).

**`validateScopes`** adapts the reference's fixed root/singleton/scoped call-site validator to the
uniform-named-frame scope model: the reference's two checks (scoped-resolved-from-root,
scoped-injected-into-singleton) collapse into ONE rule — a scope-tagged registration whose
owner-frame lookup fails throws `ScopeValidationError` instead of the previously-silent transient
fallback. A `Captor` (the nearest enclosing OWNED construction) threads through the resolution spine
to reproduce all three reference message flavors (direct, indirect-from-root, captive-consumer);
factories stay captor-opaque, matching the reference's leaf treatment of factory call sites. This
generalizes past the reference's fixed two-level hierarchy to arbitrary named-scope capture pairs.

**`validateOnBuild`** eagerly dry-run-validates every exact registration at `build()` — missing
metadata, greedy (async-mode) signature selection, a recursive dependency walk with cycle detection
— wrapping each failure in `RegistrationValidationError` and throwing one `AggregateError`. Open-
template registrations are skipped, mirroring un-validated open generics; a closing synthesized from
one IS validated when reachable as an exact registration's dependency. The reference's STATIC
scoped-in-singleton check at build time has no analog here (scope names have no static ordering,
frame arrangements are dynamic) — that half of validation stays resolve-time-only, covered by
`validateScopes`.

**Disposal aggregation**: `dispose()`/`disposeAsync()` previously aborted at the first throwing
disposable, leaking every not-yet-disposed sibling. Both paths now attempt every owned instance's
disposal regardless, then rethrow — a single collected failure as itself, two or more as one
`AggregateError` — matching the reference policy. Reverse-construction order and the sync-thenable
pre-check (`AsyncDisposalRequiredError`, thrown BEFORE any teardown so `disposeAsync()` can still
run the full teardown) are unchanged.

## 58. `primitives`: `CompositeChangeToken` + async `ChangeToken.onChange` — unstubs `CompositeFileProvider.watch`, closes #77 — #153

**`CompositeChangeToken`** composes N change tokens into one: `hasChanged`/`activeChangeCallbacks`
are any-of ORs, callbacks fire exactly once through a one-shot latch. Adaptations from the
reference: the cancellation-source latch becomes an `AbortController` (reusing
`CancellationChangeToken` for the latch registrations); the lock-based double-checked init collapses
to a plain lazy check (single-threaded JS); there is no `try/catch` around the latch cancel, since
`abort()` never rethrows listener exceptions (verified empirically — `EventTarget` dispatch isolates
them). Reference semantics kept: callbacks only propagate from inner tokens with active change
callbacks, poll-only inner changes are detected on a `hasChanged` poll, inner registrations release
once the latch fires.

**Async `ChangeToken.onChange` consumers** port into the EXISTING single signature via a runtime
thenable check, rather than separate overloads: a returned promise defers re-registration until it
settles; synchronous throws propagate to the trigger code; async rejections are swallowed AFTER
re-registration — the platform's unhandled-rejection default is process death (not the reference's
ignore-by-default), so leaving them unhandled would be the LESS faithful adaptation.
`ChangeTokenConsumer` stays a union of the sync/async function shapes rather than one
`void | PromiseLike<void>` return, because the union preserves TS's void-return assignability rule
(`() => count++` stays a legal consumer — a pre-existing `config.test` consumer depends on it).

**`CompositeFileProvider.watch`** over 2+ change-emitting providers replaces the §20/#77 throw with
the reference's exact tiering (null tokens excluded; 0 → `NullChangeToken.singleton`; 1 →
pass-through; 2+ → `CompositeChangeToken`), closing the deferment both §17 and §20 flagged as
blocked on this promotion.

## 59. `config`: stream configuration sources + `IConfigurationBuilder.properties` — #158

**`IConfigurationBuilder.properties`** — the shared key/value bag between a builder and its sources
— is added to `config.core`'s interface and both concrete builders. Divergence: the reference
`ConfigurationManager` wraps the bag so any mutation triggers a rebuild-all-sources pass; this
port's manager composes providers incrementally (§32) and has no rebuild-everything path (a rebuild
would discard provider `set()` state), so the bag is a plain shared `Map` and a source observes
properties as of its own `build()` time.

**`StreamConfigurationSource`/`Provider`** (`config`) — the abstract stream source/provider pair,
with the once-only load guard (a second `load()`, including via a root-wide reload, throws).
Platform adaptation: the whole load path stays synchronous while `primitives`' structural
`ReadableStream` is async-consume-only, so the payload type is `Uint8Array | string`
(`StreamPayload`) rather than `ReadableStream<R>` — matching the reference type's actual in-memory
usage. The reference's overloaded abstract `Load(Stream)`/concrete `Load()` pair can't share one
name in TS, so the payload-taking half is `loadStream`.

**`JsonStreamConfigurationSource`/`Provider` + `addJsonStream`** (`config.json`) join the
`JsonConfigurationExtensions` set, installed on BOTH builder classes like `addJsonFile` (§35). The
parse/flatten logic moved into a shared internal `JsonConfigurationFileParser` (mirroring the
reference's internal parser, not barrel-exported) so both providers flatten identically; one
reference behavior is unreachable — its parser throws on duplicate sibling keys, but `JSON.parse`
folds duplicates before user code sees them.

## 60. `caching.core`: the distributed-cache surface + the `Hybrid/` abstractions — #147, #159

**Distributed cache** (`IDistributedCache`, `DistributedCacheEntryOptions`,
`DistributedCacheExtensions`, `DistributedCacheEntryExtensions` in `caching.core`;
`MemoryDistributedCache` + `MemoryDistributedCacheOptions` + `addDistributedMemoryCache` in
`caching.memory`) finishes the reference `Caching.Abstractions`/`Caching.Memory` projects'
distributed slice. Byte payloads map to `Uint8Array` (a miss resolves `undefined`); the four
sync+async member pairs collapse to single Promise-returning members (no sync analog for
distributed IO); `CancellationToken` maps to an optional `AbortSignal` (§39). `IDistributedCache`
gets the many-implementers treatment §48 generalizes. The reference's internal `Freeze()` on
`DistributedCacheEntryOptions` ports as a module-scoped, barrel-excluded helper (the reference-
internal-member convention `freezeDistributedCacheEntryOptions`/`toDistributedCacheEntryOptions`
below both follow). `IBufferDistributedCache` is not ported — its entire purpose is the reference's
pooled-buffer vocabulary (`IBufferWriter<byte>`/`ReadOnlySequence<byte>`), which has no analog here;
`Uint8Array` payloads already ARE the plain-buffer shape.

**`Hybrid/` abstractions** (`HybridCache`, `HybridCacheEntryOptions`, `HybridCacheEntryFlags`,
`IHybridCacheSerializer<T>`, `IHybridCacheSerializerFactory`) port as abstractions only — the
reference's concrete multi-tier cache lives in its own project with no started std lib. Notable
collapses: the `TState`-threading `GetOrCreateAsync` overload exists solely to let CLR callers avoid
closure allocations via non-capturing lambdas, an optimization JS cannot express (closures ARE the
platform's state-capture mechanism) — it collapses to the state-less form. Same-name abstract/
virtual arity pairs (`remove`/`removeKeys`, `removeByTag`/`removeByTags`) split into distinct names,
since a TS class can't mix an abstract signature and a base-implemented one under one member name —
the split keeps each half independently overridable, matching the reference's abstract/virtual
semantics. `IHybridCacheSerializerFactory.TryCreateSerializer<T>`'s implicit `typeof(T)` reflection
becomes an explicit runtime type-token parameter (§40 vocabulary) — TS erases `T`, so a factory
needs the type's identity to arrive as a value to dispatch per-type at all.

## 61. `diagnostics.core`: `clearListeners` + the most-specific-rule-wins resolvers — #155

**`clearMetricsListeners`/`clearTracingListeners`** join `addMetricsListener`/`addTracingListener`
on their respective builders, removing all listener registrations via `di.core`'s `removeAll`
(§38) — the `logging` `clearProviders` recipe.

**The most-specific-rule-wins resolvers** — buried inside the reference's listener runtime
(`ListenerSubscription.RuleMatches`/`IsMoreSpecific` for metrics; `DefaultActivitySourceFactory`'s
matching for tracing) but NOT actually coupled to `Instrument`/`Meter`/`Activity` — are extracted as
standalone pure functions (`getMostSpecificInstrumentRule`/`getMostSpecificTracingRule` + the
`*RuleMatches`/`isMoreSpecific*` predicates) over `MetricsOptions`/`TracingOptions`' rule lists,
queried by plain-data descriptors (`InstrumentRuleQuery`/`TracingRuleQuery`). No matching rule
resolves to `undefined` ⇒ disabled: `getMostSpecific*(rules, query)?.enable ?? false` is exactly the
reference default. This makes the resolvers the documented selection PRIMITIVE of
`diagnostics.core`, ahead of and independent from the still-deferred listener/subscription runtime
itself (§17). The tracing matcher's `considerOperationName` flag is always `true` at every
reference call site, so the dead parameter is inlined rather than ported.

## 62. `logging`: the filter-selection engine, external scope, and generic-category logger — #162

`LoggerFilterOptions` rules are now CONSUMED at log time, not just held. `LoggerFactory` runs every
provider's `LoggerInformation` through `LoggerRuleSelector` (most-specific rule wins: provider
match, longest category prefix, wildcard, last-of-ties) to compute per-(provider, category)
`MessageLogger`/`ScopeLogger` views; the composite `Logger` consults those, and a reactive filter
source re-filters every existing logger on change. `addLogging` registers the
`Options<LoggerFilterOptions>` assembly, defaults the minimum level to `Information`, and injects
the assembled options plus the provider set into the factory — the filter token is the SAME
`Options<LoggerFilterOptions>` token `logging.configuration`'s `addConfiguration` already derives
(§54), so config-bound, `addFilter` (§51), and `setMinimumLevel` steps compose into one pipeline.

**External scope**: `ISupportExternalScope` + `LoggerExternalScopeProvider`
(`AsyncLocalStorage`-backed) flow scopes from the composite logger to scope-aware sinks. It lives in
`logging` (impl), not `logging.core`, so its `node:async_hooks` import doesn't force a compile-scope
requirement onto every package that src-compiles the abstractions barrel.

**Generic-category logger**: `ILogger<T>`/`Logger<T>` plus the open `ILogger<$1> → Logger<$1>`
registration, the closing type's token flowing in via `typeArg(1)`. TS forbids two same-named
interfaces of differing arity, so `ILogger` and the reference's `ILogger<TCategoryName>` collapse
into one defaulted-generic interface (`ILogger` = `ILogger<unknown>`) — consequently
`nameof<ILogger>()` lowers to `…:ILogger<unknown>` (the registry key), while the open service token
uses the clean `…:ILogger` base a `nameof<ILogger<Foo>>()` derives.

`setMinimumLevel` and `LoggerFactory.create` are UNSTUBBED — the former through the configure
pipeline, the latter through a real `@rhombus-std/di` container. The reference edge
`Logging → DependencyInjection.Abstractions` in `docs/reference/me-extensions-dependencies.md`
undercounts the real project (it also needs the DI runtime and Options); `logging` now depends on
both.

## 63. `logging.core`: reference type-parity port — `LogEntry`, buffered logging, `ProviderAlias`, `LoggerMessage`, structured `FormattedLogValues`, `beginScope` — #160

**`FormattedLogValues`** upgrades to the reference `IReadOnlyList<KeyValuePair>` shape: it parses
the template's named holes and enumerates one `[holeName, value]` pair per hole plus the
`{OriginalFormat}` pseudo-entry (lazy; `message`/`args`/`toString()` unchanged) — what a structured
sink's `state as IReadOnlyList<…>` probe reads.

**`LogEntry<TState>`** moves to its reference home here; the placeholder copy `logging.console` had
carried (§53's residual) is retired and every console consumer re-points at `logging.core`
(structural type, non-breaking).

**`ProviderAlias`** — the `ProviderAliasAttribute` analog. TS has no attributes and the repo's one
decorator is reserved for runtime installation, so this is a decorator-free static marker keyed by a
`providerAlias` symbol on the provider type, read back by `getProviderAlias` — resolving §54's
residual.

**`beginScope`** joins the standalone-only-permanently list (§50) — its name collides with
`ILogger.beginScope` exactly as `LoggerFactoryExtensions.createLogger` collides with
`ILoggerFactory.createLogger`.

**`IBufferedLogger`/`BufferedLogRecord`** (a batch-delivery capability a provider may implement
beside `ILogger`) and **`LoggerMessage.define`/`defineScope`** (the cached-delegate factory runtime
half, up to six template values — the source-generator/attribute half stays out of scope) round out
the family's type-parity surface.

## 64. `options`: `ValidateOptionsResultBuilder` + DI-injected pipeline steps — #161

**`ValidateOptionsResultBuilder`** accumulates validation failures across sources (`addError` with
an optional property name, `addResult`/`addResults` over the family's `ValidateOptionsResult`,
`clear`) and folds them into one result via `build()` — a validate step checking many things
collects errors instead of stopping at the first failure. Drops the reference's DataAnnotations
`ValidationResult` overloads (no DataAnnotations port exists, so there's no per-member result to
consume).

**DI-injected `configure`/`postConfigure`/`validate`** in `options.augmentations` mirror the
reference `OptionsBuilder<T>.Configure`/`PostConfigure`/`Validate<TDep1..5>` family: a caller
supplies a tuple of dependency tokens alongside the callback, each resolved from the provider at
ASSEMBLY time (once, when the pipeline slot is read — not re-resolved per materialization like the
reference, harmless for stable deps) and passed to the callback as trailing arguments. The
reference's five fixed arities collapse into one variadic overload (§42): a token tuple plus a
tuple-typed callback, so each verb keeps exactly two public overloads (the existing non-DI form +
this one) rather than growing six. The dep list is token strings, not compile-time type parameters
— a typed caller inlines `nameof<Dep>()`.

## 65. `caching`: `MemoryCache` statistics, keys, linked entries + a real `addMemoryCache` options pipeline — #164

**`getCurrentStatistics` + `MemoryCacheStatistics`** — the snapshot type and `IMemoryCache` member;
the reference's per-thread `Stats`/`StatsHandler` sharding collapses to plain hit/miss/eviction
counters (correct on single-threaded JS); user-initiated removals/replacements don't count as
evictions, matching the reference.

**Keys enumeration** — `MemoryCache.keys`/`count` over the single backing `Map` (the reference's
string/non-string dictionary split has no JS meaning).

**Linked cache-entry tracking** — the create→dispose push/pop chain and expiration-option
propagation from a nested `getOrCreate` factory's inner entry up to its parent. The reference's
`AsyncLocal<CacheEntry>` slot becomes a module-scoped variable — equivalent for every SYNCHRONOUS
create→dispose window, with the async-flow divergence documented inline (the pinned bun runtime's
`AsyncLocalStorage.enterWith` cannot reproduce restore-on-async-exit and segfaults after an `await`
at the time of writing).

**`addMemoryCache`'s options pipeline** finally mirrors the reference `AddOptions()` +
`Configure(setup)` + singleton composition: the `Options<T>` assembly registers at a per-cache
options token, `setup` becomes a lazy configure step, and the cache factory resolves the assembled
options plus, via `tryResolve`, the `ILoggerFactory` (reproducing the reference's constructor-
selection fallback to the logger-less ctor when logging isn't registered). The singleton registers
through `di.core`'s `tryAddFactory` (§56) — the reference `TryAdd(Singleton<...>)` analog — so an
earlier registration wins while configure steps still accumulate. The meter/observable-counter
metrics hooks stay unported (need a meter/instrument analog `diagnostics` deliberately omits, §17).

## 66. `diagnostics`: per-listener configuration factories — #165

Ports the reference per-listener configuration surface that `addMetricsConfiguration`/
`addTracingConfiguration` previously dropped on the floor: `IMetricListenerConfigurationFactory`
(metrics, an interface) and `ActivityListenerConfigurationFactory` (tracing, the reference's public
abstract class) each resolve a merged `IConfiguration` view for a named listener, chaining the
`{listenerName}` section of every bound configuration through a `ConfigurationBuilder` into one view
(later registrations win on key conflicts). `addMetricsConfiguration`/`addTracingConfiguration`
register one marker per bound configuration into a collection slot; `addMetrics`/`addTracing`
register the concrete factory as a singleton, ctor-injected with that collection. The markers and
concrete factories are `internal` in the reference; they're exported here (matching the existing
`ConfigureOptions`-step convention) so a plugin-less consumer can wire the same path by hand. There
is still no listener/subscription runtime analog — this is purely the resolvable-configuration
surface §17 already flagged as separable from the runtime it sits inside.

## 67. `hosting`: the host builder parity surface is finished — #150, #166

**`HostingLoggerExtensions`** (#150) reshapes the host runtime's internal structured log messages
from loose free functions into the internal object-literal form every other set follows
(module-scoped, receiver-first, `satisfies AugmentationSet<ILogger>`, no barrel export, no install)
— `LoggerEventIds` splits into its own module mirroring the reference file layout.

**`HostAbortedException`**'s three constructors collapse into one `(message?, innerException?)`,
mapping the inner exception onto the JS `Error` `cause`.

**`addHostedService`'s factory overload** mirrors `AddHostedService(Func<IServiceProvider,
THostedService>)`, sharing the enumerable-singleton token with the ctor form; the factory injects
the live resolver via a dep slot, and the overloads disambiguate by type (ES-class vs function) with
the factory form listed first so an un-annotated `sp => …` infers its resolver.

**`useDefaultServiceProvider` is real**: it configures a `di.core` `ServiceProviderOptions` (§57's
`validateScopes`/`validateOnBuild`) threaded into `ServiceManifest.build(options)`; `configureDefaults`
installs the dev-environment default (validation on only in Development). The single-container
build has no pluggable factory seam (§24), so the classic `HostBuilder` threads the pending options
through a package-internal `WeakMap` side channel resolved at build time (last write wins);
`HostApplicationBuilder` computes them inline.

**`HostApplicationBuilder.asHostBuilder()`** is a classic `IHostBuilder` view over the modern
builder, backed by an internal `HostBuilderAdapter` that accumulates `configure*` delegates and
replays them onto the shared configuration/services at build time, guarding late
application-name/environment/content-root changes.

**No-context convenience overloads** land for the pure-EXTENSION builder members
(`configureHostOptions`/`configureLogging`/`configureMetrics`) only. The reference's no-context
forms of the three INTERFACE members (`configureServices`/`configureAppConfiguration`/
`configureContainer`) are deliberately NOT surfaced: a TS overload can't disambiguate the two
arities for an un-annotated lambda without degrading contextual typing of the dominant
(context-taking) form every in-repo caller uses — those three keep the single reference-interface
signature. This is an empirically-confirmed TS arity/contextual-typing constraint, not an
oversight, and generalizes: a no-context convenience overload is only safe on a member with NO base
interface signature to compete with.

`useDefaultServiceProvider`'s context-form overload (`Action<HostBuilderContext,
ServiceProviderOptions>`) stays unported — no consumer (YAGNI, flagged so it isn't later "restored"
without one).

## 68. Residual open items after the port-completion wave (#144–#166)

- **`useDefaultServiceProvider`'s context-form overload** — unported by design (§67); revisit only
  if a consumer needs the `HostBuilderContext` inside the callback.
- **`logging.configuration` ↔ `logging` filter-options token convergence** — §51 flagged
  `logging.configuration`'s eagerly-bound filter token as needing to converge on `logging`'s
  pipeline token (§62) once its lazy-binding gap closed; §54 closed the lazy-binding gap, but the
  two packages still derive their tokens independently rather than sharing one — an open follow-up,
  not a regression.
- **Transformer consolidation** — an open owner-level question, not yet decided: whether future
  authoring-time lowering work should ship as an "advertised lowering" via a `rhombusTransform`
  manifest field (one generic mechanism a library opts into) versus more dedicated
  `di.transformer.*`-style satellites (one package per lowering concern, the current shape). Either
  direction must preserve §41's byte-parity constraint (the ts-patch and Go/`ttsc` engines lower
  identically, token strings byte-for-byte) — that invariant is not up for renegotiation, only the
  authoring mechanism feeding it.

## 69. Browser hosting: `hosting.browser` + `logging.browserconsole`, runtime kept

A page-hosted (not server-hosted) `Host` is a real, supported target — the reference stack's own
WASM-hosted shape, not the stripped mobile-shell (builder-only, no `IHost`) shape. This lands the
runtime version: the Generic Host runs unmodified inside a browser tab, with a browser-specific
lifetime, a page-lifecycle bridge, and a console log sink, wired through the same
`useBrowserLifetime`/`addBrowserConsole` augmentation seams every other host composition uses.
Nothing about `hosting`/`hosting.core`'s existing surface changes; `hosting.browser` and
`logging.browserconsole` are pure additions.

- **`BrowserLifetime` is the platform seam**, installed onto the existing `HOST_LIFETIME_TOKEN`
  (imported from `hosting`, never hand-written) via `useBrowserLifetime` on `IHostBuilder`.
  `waitForStart` resolves immediately — there is no OS-level "ready" signal to wait on in a page.
  `pagehide` with `persisted === false` is the best-effort stop path: it calls
  `applicationStopping`'s `stopApplication()` and nothing more, because `stopApplication` is a
  **terminal one-shot latch** and `Host` is **not restartable** — there is no `Host.start()` after
  a `stop()`. A `visibilitychange`-to-hidden/suspend signal therefore **never** maps to stop: a
  suspended (not discarded) tab can be resurrected straight out of bfcache with in-memory state
  intact, and calling `stopApplication()` on that path would permanently kill a host the page
  might resume seconds later. Suspend is a _pause_ signal with no accompanying _resume_ — routing
  it to `stop()` would be a one-way door with no way back. **`unload`/`beforeunload` are never
  registered anywhere in this surface** — both are bfcache disqualifiers, and a page that
  registers either loses the fast back/forward cache path entirely, which is the opposite of what
  a resource-conscious page host wants.
- **`PageLifecycleEvents` is the injectable bridge** between DOM lifecycle events and application
  code — a `subscribe`-with-immediate-replay surface over a stable `phase` snapshot, plus a
  `onFlush` event that recurs on every `visibilitychange`-to-hidden (not one-shot) as the
  **persistence checkpoint**: the natural place to flush pending state, since `hidden` is the last
  point at which a page is guaranteed to still be running before either bfcache suspension or
  outright discard. `onRestore` fires on `pageshow` with `persisted === true` — bfcache
  resurrection — as its own named event, never inferred from a flag on another callback.
- **Browser environment + host facade, never a fork.** `createBrowserEnvironment` produces an
  `@augment`-decorated `IHostEnvironment` (names from settings, `contentRootPath` `"/"`,
  `NullFileProvider` — there is no filesystem), and `BrowserHost` is a thin facade over
  `Host.createEmptyApplicationBuilder`, not a parallel builder implementation. The built host is
  **not container-resolvable** (`hosting`'s `resolveHost` constructs the concrete `Host` after
  `services.build()` and registers no host token — true in both server and browser composition),
  so there is no way to have a resolved component reach back in and call `host.stop()`; the
  one-line `applicationStopping → host.stop()` wiring stays the caller's responsibility in their
  own entry point, documented rather than hidden behind DI.
- **`logging.browserconsole` is its own provider package**, sibling to `logging.console`, not a
  variant folded into it — a page has no stream/TTY concept, so the sink is a direct
  `console.debug`/`info`/`warn`/`error` dispatch keyed off `LogLevel`, injectable via a structural
  `ConsoleLike` rather than a hard `console` global reference (keeps the package usable under a
  non-default global, and honest about what it actually touches).
- **Monorepo placement, ME-graph divergence flagged.** Both packages sit under the existing
  `hosting`/`logging` families with no reference-stack counterpart to mirror — the reference graph
  has no page-hosted target, so this is new-graph-surface, not a mirrored edge. Recorded here
  explicitly per the family digest's own caveat that graph-fidelity is a starting discipline, not
  a permanent constraint: this is exactly the disposable-mirror case, taken deliberately rather
  than forced into a nonexistent reference shape.
- **Rider: `hosting`'s `node:path` import.** `host-composition.ts`'s content-root path resolution
  (`isAbsolute`/`resolvePath`) is rewritten as local pure-string helpers instead of importing
  `node:path`, so hosting's own code no longer forces a node-backed module into a browser bundle
  graph. This does **not** make the _whole_ public `hosting` entry point browser-bundleable on its
  own — `default-configuration.ts` still statically pulls in `config.json` (`node:fs` +
  `node:path`) and `logging` re-exports the `node:async_hooks`-backed external scope provider;
  retiring those is out of this scope. The regression guard therefore bundles hosting's
  `host-composition` module in isolation, not the full package entry.
- **Deferred, explicitly out of v1:**
  - **`config.fetch`** — an HTTP-fetched JSON configuration source (the natural browser
    counterpart to `config.json`'s filesystem read, and the reference-WASM precedent for it). No
    consumer yet; tracked as a follow-up issue rather than spec'd here (YAGNI).
  - **`di.react` / per-route or per-component scoping** — checklist item 3 of the browser-hosting
    memo. Blocked on real design work, not busywork: `Resolver` has no `createScope` of its own
    (that capability lives on `ScopeFactory`, a narrower interface `ServiceProvider` composes),
    so a React binding has to confront that seam rather than assume every resolver can scope.
    Tracked as a follow-up issue with the open design questions recorded there.
  - **SSR/hydration** — explicitly out of scope for v1. `PageLifecycleEvents`' lazy
    `defaultPageContext()` and the browser environment both assume a live `document`/`window` at
    module-evaluation-adjacent time; a server target would need those swapped for an injected,
    request-scoped context before any of this surface could run off the main thread. Not attempted
    here; tracked as a follow-up issue.

## 70. The ported surface says "error", never "exception"

The reference stack's own vocabulary is "exception" throughout; this port renames every
occurrence that means a thrown error and belongs to this repo's own surface to "error" —
identifiers and type names (`HostAbortedException` → `HostAbortedError`, `BackgroundServiceExceptionBehavior`
→ `BackgroundServiceErrorBehavior`, and their filenames), enum/union member strings, event-id and
JSON log-output field names, error messages, and prose describing this repo's own behavior. The
rename is sense-aware, not a blind substitution — three cases stay "exception":

- **Reference-citation spellings** — a comment or doc naming the reference's own class/property/
  field verbatim (`InvalidOperationException`, `AggregateException`, `FileNotFoundException`,
  `ExceptionRecorder`), same precedent as the augmentation-not-extension rule for `ME.*` names.
- **Platform type names** — `NodeJS.ErrnoException` is Node's own type, not this repo's.
- **The English "special case" sense** — "one rule, no exceptions", "core is the one exception" —
  where the word doesn't mean a thrown error at all.

No functional behavior changes; this is a naming-only pass over identifiers, strings, and prose.

## 71. Implementer class-side merges retired — interface-extends supersedes §38's "stay downstream" rule

§38 left one seam open: "class-side merges … stay downstream next to each class; they are
retired per-lib as libs convert to dist builds (#68)." That retirement has now happened wholesale,
not per-lib — implementer class-side merges (a `declare module` block widening a concrete class
like `MemoryCache`, `Host`, or `LoggingBuilder` to restate members its own interface already
carries) are **retired outright** wherever the target is a class that implements an augmented
interface. §38's sentence is superseded by this entry; the OPEN/CLOSED registry mechanics, token
grammar, and merge-identity rule it describes are otherwise unchanged.

- **The replacement is a same-name empty extends-merge**, authored once beside the `@augment`
  class: `export interface C extends I {}`. Binding the interface symbol onto the class symbol
  means every augmentation registered against the interface — present or future, from any package
  — is visible on the class through ordinary structural typing; there is nothing left to restate
  by hand, and nothing to fall out of sync when the interface grows a member. Twelve sites
  converted (`logging`'s `LoggingBuilder`, `hosting`'s `Host`/`HostBuilder`/`HostingEnvironment`/
  `HostBuilderAdapter`/`MetricsBuilder`, `hosting.browser`'s `BrowserHostingEnvironment`,
  `diagnostics`'s `MetricsBuilder`/`TracingBuilder`, `caching.memory`'s `MemoryCache`/`CacheEntry`).
- **Cross-package class-side merges are banned outright**, not just retired — they are exactly the
  #168 publish-hazard class: a downstream package reaching into an upstream's `internal/*`
  subpath to widen its concrete class becomes unreachable the moment that subpath is publish-scrubbed
  (§7). Five such blocks (logging.console, logging.browserconsole, and logging.configuration
  augmenting `logging`'s `LoggingBuilder`; hosting.browser augmenting `hosting`'s `HostBuilder` and
  `HostBuilderAdapter`) are deleted with no replacement — the interface-side merge on
  `ILoggingBuilder`/`IHostBuilder` already carries every member they restated.
- **Receiver-class carve-out, explicitly owner-reviewed, not auto-converted.** A `declare module`
  block that targets a concrete class is NOT this pattern when the class has no augmented
  interface counterpart to extend from — a CLOSED value-object receiver (`LoggerFilterOptions`,
  `MemoryCacheEntryOptions`, `DistributedCacheEntryOptions`, `MetricsOptions`, `TracingOptions`),
  a many-implementers receiver deliberately left unmerged at the interface per §38/§36
  (`IConfiguration`/`IConfigurationRoot`'s concrete classes), or a class that intentionally does
  not implement its family's base interface (`ConfigurationBuilder<T>`'s `build(): T` is
  incompatible with `IConfigurationBuilder`, so its augmentations stay class-side by design).
  These sites are unchanged by this decision and flagged for owner review rather than folded in
  silently, since each rests on a judgment call (CLOSED-ness, many-implementers status, or
  deliberate non-implementation) rather than a mechanical check.
- **`publishConfig.exports` is now derived, not hand-authored**, closing the other half of the
  #168 hazard: `scripts/derive-publish-config.ts` computes each package's published `exports` from
  its dev `exports` — dropping the `./internal/*` white-box seam and collapsing every surviving
  subpath to the canonical published trio (`types`/`import?`/`default`), matching §7's scrub by
  construction instead of by hand-copied convention. `--check` runs in the root `lint` script (and
  therefore in CI); `--write` regenerates. One shape is out of scope for derivation and stays
  hand-authored: `@rhombus-std/config`'s `./configuration-builder`/`./configuration-manager` alias
  subpaths collapse onto the rolled `dist/index.*` bundle at publish, which no path-swap of their
  dev targets reproduces.

## 72. Dist-referencing lands for the leaf tiers; the di family stays src-referenced pending a token-desync fix

§9's original src-referencing rule (pure-types libs may point their `.` export at `./src/*.ts`;
runtime-emitting libs must be dist-referenced) was never fully enforced — most runtime libs stayed
src-referenced behind the `built` custom condition, tracked as #68. This entry records the first
real retirement pass: it converted the leaf tiers cleanly, then hit a genuine blocker converting
the di family and stopped there rather than ship a silently-broken runtime.

- **Landed — tiers 1–2.** `primitives` (tier 1) and `options` / `fileproviders.core` /
  `fileproviders.composite` / `config.core` (tier 2) had their `.` export's type-facing conditions
  (and, for the four runtime-emitting libs among them, the `bun` condition) repointed from
  `./src/*.ts` to the rolled `./dist/*.d.ts` / `./dist/*.js`, and their root `main`/`types` fields
  to match. `config.core` — pure types, zero runtime emit — collapses to a `{types, default}`
  pair over `dist/index.d.ts` alone, correcting the stale §9/family-digest text that called it
  "no longer pure-types" (that description described a transitional state, not the current one).
  Each tier's `bun run build` and the full `bun run test` gate passed clean (0 failures) before
  advancing to the next; `scripts/derive-publish-config.ts --write` reported no drift at either
  tier, confirming `publishConfig.exports` was already dist-shaped as the src-referencing rule
  anticipated. `internal/*` deliberately stays src-referenced throughout — white-box tests need it
  and there is no rolled per-file `.d.ts` for it to resolve to instead.
- **Blocked — tier 3 (`di`, `di.core`) and everything past it in dependency order.** Flipping
  `di.core`'s `types` condition to dist makes `bun run build` (`tsc --noEmit`) pass, but breaks 223
  runtime tests. The failure is not the type-level `declare module` incompatibility the `built`
  condition exists to prevent — types merge fine. It's a **runtime augmentation-token desync**: a
  package's public augmentation token (§40's `nameof<Interface>()` → `<declaring-package>:<TypeName>`
  derivation) is computed by walking that package's OWN resolved `exports` conditions
  (`primitives.transformer`'s `resolveConditionTargets`, over
  `['types','import','module','default','require','node','bun']`). Once `di.core`'s conditions
  point at dist, `di.core`'s _own_ build — compiling before its own `dist/index.d.ts` exists —
  can't find itself through those conditions and falls back to a Tier-2 file-path token
  (`@rhombus-std/di.core/src/service-manifest:ServiceManifest`) for its own `@augment` self-
  decoration. Every _external_ registrant (the `di` runtime, `hosting.core`, `logging.core`, …)
  resolves `di.core` through its already-built dist and gets the intended Tier-1 barrel token
  (`@rhombus-std/di.core:ServiceManifest`) instead. The two forms never match, so no
  `ServiceManifest` augmentation installs — `build`, `addHostedService`, `tryAdd*`,
  `addLogging`, `addMetrics`, and everything else registered against `ServiceManifest` silently
  disappears at runtime. This only trips on a package that both ships runtime AND self-augments
  its own public receiver — `di.core` today, and, if converted the same way,
  `diagnostics.core`/`config`/`hosting.core`/`logging.core` next, each of which `declare module`s
  its own public name. `bun run build` cannot see this class of break; only the `bun run test`
  gate catches it, which is why the tsc-detectable-break premise in the pass's own plan understated
  the risk for these packages specifically.
  - A secondary, narrower problem surfaces first and has a known fix: `di.core` also fails to
    _typecheck_ its own `declare module '@rhombus-std/di.core'` self-augmentation once `types`→dist,
    because self-name resolution hits a dist that doesn't exist yet during `di.core`'s own build
    (TS2664). A package-unique `di-core-source` custom condition (not the shared `source`
    condition — that would pull every downstream consumer of `di.core` — logging.core,
    hosting.core, diagnostics.core — into co-compiling `di.core` source too) fixes the typecheck.
    It does **not** fix the token desync above, because `resolveConditionTargets` doesn't consult
    custom conditions at all.
- **Standing direction, per owner: full retirement (#68 stays open).** The candidates for
  resolving the token desync — teach `resolveConditionTargets` to derive a package's own
  augmentation token from a src-pointing condition regardless of what its published conditions
  currently resolve to (correct, but must land byte-identically in both the ts-patch/TS5 engine
  and the Go/`ttsc` engine per §41's parity invariant); hard-code the barrel token literally at
  each self-augmenting core's `@augment`/`registerAugmentations` call (narrower, but a deviation
  from §40's no-literal-tokens rule, and needed at every self-augmenting core, not just di.core);
  or leave the di family (and other self-augmenting cores) permanently src-referenced and scope
  full retirement down to non-self-augmenting libs — are each design-significant enough that they
  were left for separate resolution rather than picked under this pass. Until one lands, `di` /
  `di.core` and the packages tiered after them keep `source`/`types`→`src` plus
  `customConditions: ["built"]`, and the `built` condition's plan-of-record ("interim hatch the
  src-referencing rule will retire, #68") in §9's forebear section is only half superseded — true
  for the tiers this entry converted, still load-bearing for the rest.

## 73. `fileproviders.physical` — a disk-backed provider, watch limited to exact-file / directory-prefix

Adds `fileproviders.physical` (← `fileproviders.core` + `primitives`) implementing `IFileProvider`
against the on-disk file system, born dist-referenced from the start (the post-§72 shape — no
`built`/src-reference detour, since it neither ships a transformer augmentation nor self-augments a
public receiver). `getFileInfo`/`getDirectoryContents` reproduce the reference's guards: empty/
invalid-char/absolute-path/above-root paths (`pathNavigatesAboveRoot` plus a resolved-path
prefix/equality check against the provider's root) fall through to `NotFoundFileInfo` /
`NotFoundDirectoryContents.singleton`. `ExclusionFilters` is ported as a bitflag const
(`None`/`DotPrefixed`/`Hidden`/`System`/`Sensitive`), defaulted to `Sensitive`, but only
`DotPrefixed` is enforceable on this repo's POSIX target — `Hidden`/`System` are documented no-ops
rather than silently-always-off, since a future platform target could make them real.
`createReadStream()` returns a web `ReadableStream<Uint8Array>` over lazy `openSync`/`readSync`
chunks (the reference's `Stream` has no TS analog) — a flagged deviation, not a gap.

**Globbing verdict: deferred outright, not stubbed.** The reference's `Watch(filter)` only routes
to `Matcher`/glob when the filter contains `*` or ends in a separator; every filter a bare exact
filename bypasses glob entirely. No ported consumer (`config`'s future `reloadOnChange`,
`hosting`'s content-root wiring) passes a wildcard filter today, so per the repo's YAGNI rule
`FileSystemGlobbing` (~30 internal types) is not ported and there is no `fileproviders.globbing`
package. `watch` supports exactly the reference's non-glob branch — an exact file path (mtime
token) or a directory path ending in `/` (recursive prefix-watch token) — and **throws** on any
filter containing `*` (`"Wildcard watch filters are not yet supported…"`), a faithful subset of the
reference's own branch split rather than a silently-inert `NullChangeToken`. Widening `watch` to
glob is deferred to a follow-up package, gated on a real wildcard-watch consumer appearing.

**Watcher design — active `fs.watch` XOR polling, not the reference's always-composite backstop.**
`PhysicalFilesWatcher` picks one mechanism per provider: active mode registers a `fs.watch` per
watched target and flips a `CancellationChangeToken` (from `primitives`) on a matching event;
polling mode (`PollingFileChangeToken`) re-`statSync`s a target only after a 4000ms interval
(matching the reference's default) and **latches `hasChanged` permanently true** once a change is
observed, with a shared timer driving callbacks only under active-polling. This is a flagged
simplification, not full parity: the reference runs both mechanisms together as a backstop; this
port runs exactly one per provider, because Node/Bun recursive `fs.watch` is well-known unreliable
on Linux (this repo's platform) and a composite always-both design would mask that unreliability
rather than surface it — polling is the documented deterministic path, active is the default,
best-effort mode. Directory-subtree change detection uses a structural `(path, mtimeMs)` join
rather than the reference's SHA hash — cheaper, same collision-avoidance property for this use.
Not ported (follow-up, correctness meanwhile covered by polling): `PendingCreationWatcher`
(watching a not-yet-existent root), renamed-descendant recursion, and the subdirectory-descriptor
watch-count optimization.

**Naming-taboo deviation.** The reference's polling-mode env var embeds the vendor product name
and cannot be written into a checked-in file; it is renamed to
`RHOMBUS_STD_USE_POLLING_FILE_WATCHER` (same `"1"`/case-insensitive-`"true"` semantics, read once
lazily), documented in-source as a rename of "the reference's polling env var" — the env var name
is never spelled verbatim in a checked-in file.

**Two further reference divergences, kept because each is the more correct behavior (both flagged
in-source).** (1) `PhysicalDirectoryInfo` propagates its `ExclusionFilters` to the child
`PhysicalDirectoryInfo`s it yields; the reference builds those children through its filters-less
public constructor, so filters silently drop one level down and a recursive walk of the returned
tree stops excluding. (2) `PhysicalFileProvider.usePollingFileWatcher` returns the locked-in value
once the watcher exists; the reference returns `false` there unconditionally, misreporting a
provider that is in fact polling.

**Test coverage added alongside**, filling gaps the port surfaced rather than pre-existing debt:
`tests/fileproviders.core.test` (null-object abstractions — `NotFoundFileInfo`,
`NotFoundDirectoryContents.singleton`, `NullChangeToken`, `NullFileProvider` — previously
untested), an extension to `tests/fileproviders.composite.test` (`getFileInfo` fall-through,
`getDirectoryContents` merge + first-wins dedup, lazy `CompositeDirectoryContents` init), and
`tests/fileproviders.physical.test` (29 cases: guards, exclusion filtering, read-stream
round-trip, polling determinism as the authoritative watch gate, active-mode as a tolerant
best-effort check). Coverage caught a real bug in `#getFullPath`: the provider's stored root
carries a trailing separator that `path.resolve` strips, so the root path itself
(`getFullPath('')`) was wrongly rejected as outside-root; fixed by adding an equality check
alongside the trailing-separator prefix check (which still blocks sibling-prefix escapes, e.g.
`/root-evil` against root `/root`).

**Superseding the family digest's deferral text** (previously: "A disk-backed provider
(`ME.FileProviders.Physical`) … [is] deliberately deferred"): that line now describes only
`FileSystemGlobbing`, not the physical provider itself, which has landed. §18/§20's still-deferred
non-console logging/physical-file-provider bundle referenced from the `hosting` family entry is
likewise narrowed — `hosting`'s content-root `PhysicalFileProvider` wiring remains a follow-up
(swap `HostingEnvironment.contentRootFileProvider`'s `NullFileProvider()` default, decide
disposal ownership), but the provider it would wire now exists.

## 74. Augmentation tokens derive from export MEMBERSHIP, never from resolved `exports`-condition targets

`nameof<T>()` (§40) locates the module that publicly exports `T` by walking a package's `exports`
map and asking, for each entry, "does the module at this entry's _resolved target_ re-export `T`?"
Both engines resolved that target by taking the entry's on-disk path literally — for a
dist-referenced package (the `built` customCondition, §41) that target is `dist/<X>`. Compiling
such a package's OWN source against itself, the not-yet-built `dist/<X>` doesn't exist in the
program yet, so the literal-target lookup came up empty and the derivation silently fell back to
the Tier-2 file-path form (`pkg/src/file:Type`) instead of the barrel form (`pkg:Type`) a
consumer of the same type derives once `dist` exists. Same type, same declaration, two different
token strings depending on which side of the build the deriving compiler sat on — a registry-key
desync between a package's self-registered augmentations and a downstream package's lookup of
them. Latent on `main` (nothing was dist-referenced yet to trigger it); caught by a dist-
referencing tier attempting the first `built`-mode self-compile.

- **The fix**: before falling back to Tier-2, try one more candidate — the entry's `src/`
  twin (`dist/<X>` → `src/<X>`, per `scripts/build-lib.ts`'s hard `dist/<X>.js ↔ src/<X>.ts`
  convention). If the type is a member of the exports of _that_ module, it derives the same
  barrel/subpath form a dist-side consumer would. The literal target is still tried FIRST, so
  every already-resolvable derivation (a package's dist dependency is built and present, or the
  package isn't dist-referenced at all) is byte-identical to before — the twin only fires in the
  previously-broken self-compile-of-dist case. Membership itself is unchanged: a non-exported
  internal type still gets the Tier-2 file-path form regardless of which candidate resolved it;
  aliased re-exports still tokenize to the DECLARED name, not the export alias; a type reachable
  from multiple subpaths still resolves to the shortest (root barrel wins).
- **The invariant this restores** (scoped to the built-vs-not-yet-built axis): a type's
  augmentation token must be identical whether the deriving compiler sits on the built or the
  not-yet-built side of the SAME `exports` shape — because the token is a registry key shared
  across packages compiled at different times by different processes (§38), and derivation must
  not be sensitive to which artifacts happen to exist on disk when a given invocation runs. The
  fix does NOT reconcile a _different_ `exports` shape: a type whose declaring file is itself a
  subpath entry (e.g. `config`'s `ConfigurationBuilder` at `./configuration-builder`) tokenizes to
  that subpath while the repo is src-referenced, but a published consumer — whose `publishConfig`
  collapses that subpath onto the rolled `dist/index.*` bundle (§7, §71) — derives the root barrel.
  That axis is closed only by a COMPLETE per-package `types→dist` flip; flip whole packages
  atomically, never half their subpaths, or the collapse desyncs writer from reader.
  **Correction (§78, #68):** that subpath/barrel split is a compile-time declaration-merge concern
  only. config derives NO _runtime_ augmentation token from the concrete `ConfigurationBuilder`
  class — every config-family registry token is `nameof<IConfigurationBuilder>()` (the interface,
  which lives in the already-dist `config.core`), and `config.transformer` rewrites only
  `.withType<T>()`, deriving no token at all. So config's own flip needed no token-derivation
  change; collapsing the two subpaths onto the rolled barrel (writer=reader on `dist/index.d.ts`)
  plus a `config-source` self-condition was mechanically sufficient (§78).
- **Both engines, kept in lockstep (§41 parity)**: the TS engine derives every token through one
  path — `entrySourceFile` in `libraries/primitives.transformer/src/tokens.ts`, called from
  `publicImportSpecifier` (the di.transformer.options base scan routes through it too, via
  `baseTokenForSymbol`) — so a single fix there covers it. The Go/`ttsc` engine carried the
  pre-fix literal-only lookup in TWO independent call sites: `publicImportSpecifier`
  (`transforms/internal/tokens/packages.go`) and the `Options<T>` base scan's `isRootExportTarget`
  (`transforms/internal/dioptionstransform/options.go`), which the general-derivation fix alone
  left divergent — a dist-referenced `@rhombus-std/options` self-compile would leave every
  `addOptions<T>()` unlowered while the TS engine lowered it. Both Go sites now resolve their
  candidate stems through one shared helper, `tokentext.EntrySourceStems` (literal target, then
  the `dist/<X> → src/<X>` twin), so they cannot drift again. Parity is verified by re-running
  every `*.ttsc.e2e` suite plus the `examples.app.with-transformer` byte-diff — unchanged, since
  the twin only activates on a compilation shape neither suite exercises yet; the twin's stem
  selection is pinned by `TestEntrySourceStems`/`TestEntrySourceFile` in the Go unit corpus.
- **Relationship to §72 (tier-3 dist-referencing).** This lands the first of the three candidates
  §72 named for its tier-3 blocker — teach derivation to key on a src-pointing target regardless
  of what the published conditions currently resolve to, byte-identically in both engines. Landing
  it removes §72's **runtime augmentation-token desync**: a self-augmenting core compiling its own
  not-yet-built dist now finds itself through the `src/` twin and derives the same barrel token an
  external registrant does, so the `ServiceManifest` (and every other self-augmented receiver)
  install no longer silently drops. It does NOT perform the tier-3 conversion itself, and does NOT
  resolve §72's _secondary_ TS2664 self-typecheck problem (still needs the package-unique
  `di-core-source` custom condition). So `built` retirement for `di`/`di.core` and the tiers past
  them now waits only on doing that conversion — the runtime desync that made it unsafe is fixed.

## 75. The file-configuration family — `config.file` base, `config.ini`, `config.xml`

The configuration family gains a file base layer and two new format providers, mirroring the
reference `FileExtensions` / `Ini` / `Xml` packages. `config.json` is rebased onto the shared base.

- **`config.file` — the shared base (the `FileExtensions` analog).** `FileConfigurationSource`
  (abstract: `fileProvider`/`path`/`optional`/`reloadOnChange`/`reloadDelay`/`onLoadError`,
  `ensureDefaults`, `resolveFileProvider`) and `FileConfigurationProvider` (abstract: reads the
  file through the source's `IFileProvider`, hands decoded text to an abstract `loadContent`,
  reloads on change) plus `FileLoadErrorContext` and the `FormatError`/`InvalidDataError` types.
  The name is short and tier-flat (like `config.json`): the package's job is base classes, not
  side-effect extension methods, so the `Extensions⇒augmentations` rule (§0) doesn't fire. Depends
  on `config` (peer), `config.core`, `fileproviders.core`, and `fileproviders.physical` (the
  centralized default provider). It is inherently node-side; the `config` barrel stays
  browser-clean by never importing it. Born dist-referenced (§72) with the `nameof` `internal/*`
  lowering split (§40).

  - **Read is synchronous via `physicalPath` (flagged deviation).** `load()` is synchronous, but
    `IFileInfo.createReadStream` yields an async `ReadableStream` that can't be drained in a sync
    method. So the base reads with `readFileSync(fileInfo.physicalPath)` — which is exactly the
    reference's own primary path (its `OpenRead` special-cases `PhysicalPath` to a synchronous
    `FileStream`). A provider exposing no `physicalPath` (in-memory/remote) is unsupported for
    synchronous file config and throws.
  - **Reset by reassignment (#86).** The base resets its store with `this.data = new Map()` (the
    §-preceding widening dropped `readonly` on `ConfigurationProvider#data`), so it parses into a
    fresh store and swaps it in atomically — restoring the previous store when a NON-reload parse
    fails, matching the reference's "Data unchanged on a failed initial load" semantics, which an
    in-place `clear()` can't express. #86's second half (null value vs. empty string) is left open:
    no ported provider stores a null leaf.
  - **`FileConfigurationExtensions`** installs `setFileProvider`/`getFileProvider`/`setBasePath`/
    `setFileLoadErrorHandler`/`getFileLoadErrorHandler` against the shared `IConfigurationBuilder`
    token, merged onto the `config.core` `IConfigurationBuilder` INTERFACE (so a source's
    `ensureDefaults`, which only sees the interface, can call `builder.getFileProvider()`) AND onto
    both concrete builders (so user code reaches `setBasePath` on a `ConfigurationBuilder`/
    `ConfigurationManager`). The `properties`-bag keys stay the reference's literal strings
    (`"FileProvider"`, `"FileLoadExceptionHandler"`) for cross-provider parity; the member and type
    names are error-worded (`FileLoadErrorContext`, `onLoadError`) per the error-not-exception rule.

- **`config.json` rebased.** `JsonConfigurationSource`/`Provider` now derive from the file base;
  the read flows through an `IFileProvider` (default a cwd-rooted `PhysicalFileProvider`,
  reproducing the old cwd-relative behavior byte-for-byte), so `node:fs` leaves `config.json`
  entirely. The positional `(path, opts)` ctor is unchanged (hosting's appsettings sources keep
  working); `JsonConfigurationSourceOptions` gains `reloadOnChange`/`reloadDelay`/`fileProvider`.
  **Deviation from the reference's positional-bool `AddJsonFile` ladder:** the established
  options-object form (matching `addEnvironmentVariables`) subsumes it more idiomatically (§0).
  **Deviation:** `build()` calls `resolveFileProvider` before `ensureDefaults` so a directly
  constructed source with an absolute path self-roots (the reference resolves only inside the
  ladder; this keeps direct construction reading absolute paths). The parser now throws
  `FormatError` (wrapped by the base in `InvalidDataError`) and rejects a top-level JSON ARRAY —
  the root must be an object, as the reference requires (an audit-found gap). Stream variants are
  unchanged (§59).

- **`config.ini`.** `IniConfigurationSource`/`Provider` on the file base + the `IniStream*` pair
  over `config`'s stream base, sharing an `IniStreamParser` (sections, `;`/`#`/`/` comments,
  first-`=` split, one-pair quote strip, duplicate-key and no-`=` `FormatError`). `addIniFile`/
  `addIniStream` on both builders.

- **`config.xml`.** `XmlConfigurationSource`/`Provider` + the `XmlStream*` pair, over a
  self-contained tokenizer + tree walk (`XmlStreamParser`) with NO XML-parser dependency (a dep
  would violate the zero-ambient-types ethos, §39/§44). Grammar: elements/attributes/text/CDATA;
  the root element name is dropped; a case-insensitive `Name` attribute contributes an extra path
  segment; repeated siblings get a numeric index; the five predefined entities are expanded (plus
  numeric character references — core XML, beyond the plan's five-entity scope); a namespace (a
  name containing `:`), a DTD, an undefined entity, or a duplicate resolved key is a `FormatError`;
  the XML declaration, comments, and PIs are ignored. **Simplification (flagged):** the reference's
  `SingleChild`/`ChildrenBySiblingName` perf optimization collapses to a plain grouped-children
  walk. **Out of scope:** encrypted-section decryption (`XmlDocumentDecryptor`/`EncryptedData`) —
  no analog; `KeyPerFile` — no reference source present, no consumer.

- **`config.env` connection-string prefixes (audit rider).** An environment variable whose name
  starts (case-insensitively) with one of the conventional `*CONNSTR_` prefixes some deployment
  platforms inject is re-keyed into the `ConnectionStrings` section with the prefix stripped
  (`SQLCONNSTR_Db` → `ConnectionStrings:Db`); the part after the prefix is transformed as usual.
  The reference additionally emits a `<name>_ProviderName` sibling naming the ADO provider for four
  prefixes; those provider-name values are OMITTED — they are runtime-stack-specific identifiers
  with no analog here — so no `_ProviderName` key is written.

- **Prerequisite issues.** **#82** (builder `Properties`/`Sources` narrowing): the `Properties` bag
  the file base needs was already landed by §59, so no widening was required — the file base
  consumes it directly; the `Sources`-mutability half remains unaddressed (no consumer). **#86**
  (provider `Data` reassignment + null coercion): the reassignment half is now enabled (the file
  base relies on it, above); the null-vs-empty-string half is deferred (no consumer). **#183**
  (config.json `reloadOnChange` retrofit) is fully implemented and closes.

- **Hosting `reloadOnChange` enablement — DEFERRED (blocked on watcher-disposal ownership).**
  `PhysicalFileProvider.watch` is live (#184), so the reference's default of `reloadConfigOnChange
  = true` on the host's `appsettings(.{env}).json` sources is now technically wireable. It is NOT
  flipped, because enabling it by default registers an `fs.watch` handle (which does not `unref`)
  per appsettings source, through a cwd-rooted `PhysicalFileProvider` that `getFileProvider`
  creates fresh and NOBODY disposes — so the watcher keeps the event loop alive and the process
  never exits (the app examples boot via the Generic Host and would hang the output-diff e2e). The
  missing piece is disposal ownership: something must own disposing the default file providers when
  the host stops — the SAME open question #182 raises for the content-root provider. Hosting keeps
  `reloadOnChange:false` (zero regression); the config-side machinery fully supports opt-in
  `reloadOnChange` with a disposal-aware provider. #182 (content-root `PhysicalFileProvider`
  wiring) is likewise left for its issue.

## 76. `options`: pipeline reachability closed + recorded divergences — #128

The public/abstract type-set of the options family already corresponds to the reference
(`ME.Options` / `ME.Options.ConfigurationExtensions`) modulo the §4.2/§4.5 carve-outs — no new
public type is warranted (YAGNI: `IOptionsFactory<T>`, `BinderOptions`, the source-gen validator
attributes, and an `OptionsWrapper<T>` all lack any consumer). The alignment pass is about
pipeline-stage **reachability** and recording divergences, not new types.

- **Pipeline reachability.** All three `OptionsFactory` stages (configure / post-configure /
  validate) are reachable through `options.augmentations`' public manifest surface. The one
  genuine gap was coverage, not capability: `postConfigure`'s bare form —
  `postConfigure(token, delegate)` and `postConfigure(token, PostConfigureOptions-object)` — was
  implemented and reachable but had **zero** callers through the manifest augmentation (the only
  bare `PostConfigureOptions` in the repo, the without-transformer example, builds
  `new OptionsFactory(...)` directly and bypasses the slot). It is now exercised end-to-end
  (`tests/options.augmentations.test/test/post-configure.test.ts`), asserting both forms run
  **after** configure and that multiple steps run in registration order. Test-only change; the
  impl was already correct.

- **Sync-only validation (divergence recorded).** Validation is synchronous and resolution lazy by
  design, so the async family (`IAsyncValidateOptions<T>`, `IAsyncStartupValidator`) and the
  source-gen validator attributes stay out (the latter has no TS analog; a future
  `options.data-annotations` satellite, §4.4). The **sync** path is ported and stays IN:
  `IStartupValidator`/`StartupValidator`/`validateOnStart` (§55). The issue's carve-out wording
  that lumps `IStartupValidator`/`ValidateOnStart` in with the async-out family is imprecise —
  only the async pieces are out; removing sync `IStartupValidator` would regress a §55-documented,
  tested feature.

- **`OptionsFactory<T>` is not a DI seam (divergence recorded).** It is a concrete class, not the
  reference's DI-swappable `IOptionsFactory<T>` interface — YAGNI, no consumer needs to substitute
  pipeline assembly. Reopen when one does.

- **Deep-merge config bind (divergence recorded).** The config→options bind
  (`ConfigurationConfigureOptions`/`bindSection`) reimplements the reference's reflective
  `ConfigurationBinder.Bind` structurally as a deep merge (reflection is impossible under type
  erasure). Beyond being reflection-free, the deep merge carries a stronger guarantee than the
  reference `Bind`: two configure steps binding overlapping sections **compose** rather than
  clobber each other's nested keys (`config-options.test.ts` asserts this).

- **Step-object-or-delegate, deps resolved once (divergence recorded).** `configure`/
  `postConfigure`/`validate` each accept a pre-built step object _or_ a bare delegate on the one
  verb (the reference needs a separate raw DI registration for the instance form). The DI-injected
  variadic `DepTokens<Deps>` form (§42) resolves its dependency tokens **once**, when the assembly
  reads the slot — not per-materialization as the reference's transient closures do — harmless for
  the stable services those deps carry.

The features where options goes beyond the reference are catalogued in
`docs/options-beyond-reference.md`. No public type or signature in `options`/`options.augmentations`
changed, so no referencing library (`di.transformer.options`, `diagnostics`,
`logging.configuration`, `hosting`) is affected.

## 77. `logging` (core/config only): ME public-API alignment pass — #129

The public/abstract type-set of the logging family (`logging.core` / `logging` /
`logging.configuration`) already corresponds to the reference (`ME.Logging.Abstractions` /
`ME.Logging` / `ME.Logging.Configuration`) — no new public type is warranted, and both candidates the
#129 triage surfaced were already resolved by earlier work and are live/consumed. The alignment pass is
a reconciliation plus recording divergences, not new types. The three intentional pending-integration
stubs (`setMinimumLevel`, `clearProviders`, `LoggerFactory.create`, all throwing, await #75/§18) and all
provider-facing abstractions (out of scope) stay untouched.

- **`NullLogger<T>` ships as the phantom-generic parity spelling (revised — was "not a gap").** The
  reference splits `NullLogger` and `NullLogger<T>`; here `ILogger<TCategoryName = unknown>` is a
  **phantom**-param interface (`TCategoryName` appears in no member, §logger.ts), so `ILogger<A>` and
  `ILogger<B>` are structurally identical and the shared `NullLogger.instance` singleton is already
  assignable to `ILogger<T>` for every `T`. The earlier "it cannot even be authored" rationale was
  wrong: the idiomatic TS form is not a second same-named class (that would be the duplicate-identifier
  error it described) but ONE generic class with a defaulted parameter —
  `class NullLogger<T = unknown> implements ILogger<T>`, exactly the trick
  `ILogger<TCategoryName = unknown>` and `Logger<T>` already use. The family therefore now provides the
  `NullLogger<T>` spelling: `new NullLogger<Foo>()` is a freshly-typed no-op, while the `instance`
  singleton stays typed `NullLogger<unknown>` (a static member cannot reference the class type
  parameter) and already covers every closed slot. Because the parameter is phantom this adds the
  reference-parity spelling, **not new runtime behavior** — the bare `NullLogger` remains
  `NullLogger<unknown>` and every prior use (value or type) compiles unchanged.

- **Candidate (1): the `LoggerFilterOptions` binding is already lazy and reload-reactive (no work).**
  `logging.configuration`'s `addConfiguration` installs the `Options<LoggerFilterOptions>` pipeline
  through `options.augmentations` — an `addOptions` assembly + a `LoggerFilterConfigureOptions`
  configure step + a `ConfigurationChangeTokenSource` at the change-token-source slot — so nothing
  binds until the assembly materializes and a configuration reload re-runs the parse. The triage's
  "binds eagerly, stale blame comment" premise was resolved by #162; the header comment already reads
  "faithful LAZY pipeline … a configuration reload re-runs it." The ported-but-unconsumed
  `LoggerFilterRule` selection is reachable and consumed at log time — `LoggerFactory` subscribes to
  the options change token and re-selects via `LoggerRuleSelector.select(...)`. Reopen trigger: a
  black-box e2e showing a config-file level change does NOT re-filter a live logger.

- **Candidate (2): the generic category-logger trio is present, non-reflective (no work).** `ILogger<T>`
  (phantom param), `Logger<T>` (category from the DI token's type-name segment, not `typeof(T)`), the
  open `ILogger<$1> -> Logger<$1>` registration, and `createLogger(factory, type) -> factory.createLogger(type.name)`
  are all live (#162). `CreateLogger<T>()` is deliberately transformer sugar (no-transformer-first). See
  the `NullLogger<T>` note above — the trio's `NullLogger<T>` member now ships as the phantom-generic
  parity spelling.

- **`LoggerFactoryOptions` / `ActivityTrackingOptions` / `LoggingBuilderExtensions.Configure` stay
  unported (divergence recorded).** Their sole purpose is `Activity`-based scope enrichment; this port
  drops the entire Activity/ActivitySource/Meter runtime (§17/§61). An options bag whose only field can
  never be populated is dead surface. Rationale previously lived only in a `LoggerFactory.ts` inline
  comment; recorded here so the logging-side consequence is discoverable from decisions.md, not just
  the diagnostics family. Reopen only if an `Activity`/`ActivitySource` analog is ever ported.

The enhancements where logging goes beyond the reference (string DI tokens, the token-derived
generic-category logger, dual-export augmentations on `ILoggingBuilder`/`LoggerFilterOptions`, the
`Disposable`/`Symbol.dispose` convention, `FormattedLogValues` as a first-class export, the collapsed
convenience-wrapper overloads, and the reload-reactive converged filter-options pipeline) are
catalogued in `docs/logging-beyond-reference.md`. No public type or signature in
`logging.core`/`logging`/`logging.configuration` changed, so no referencing library (`hosting.core`/
`hosting`, `diagnostics`) is affected.

## 78. The runtime tier is dist-referenced; the `built` condition is retired — #68 COMPLETE

§74 fixed the runtime augmentation-token desync that §72 named as tier 3's blocker; this entry
lands the tier-3+ conversion §72 said would follow once that fix existed, and retires the `built`
hatch §9's forebear section named as `built`'s own eventual replacement. `config` — the sole lib
this entry originally deferred — converted in a follow-up (see the final bullet); **#68 is now
complete, every runtime library is dist-referenced.**

- **Converted (19 libs).** `di.core`, `di`, `config`, `config.json`, `config.env`, `config.commandline`,
  `diagnostics.core`, `diagnostics`, `logging.core`, `logging`, `logging.configuration`,
  `logging.console`, `logging.browserconsole`, `caching.core`, `caching.memory`, `hosting.core`,
  `hosting`, `hosting.browser`, `options.augmentations` — each `.` export's type-facing condition
  (and, since all eighteen emit runtime, `bun`) repointed `./src/*.ts` → `./dist/*`, `source`
  dropped, root `main`/`types` → `dist`. `./internal/*` is unchanged throughout — still
  src-referenced, white-box tests only, same as every tier before it.
- **§72's secondary TS2664 problem: a per-core, not shared, source condition.** Three of the
  eighteen self-augment their own public receiver — `di.core` → `ServiceManifest`,
  `diagnostics.core` → `IMetricsBuilder`/`ITracingBuilder`, `hosting.core` → `IHostBuilder` — so
  each carries a package-unique `<pkg>-source` condition (`di-core-source`/
  `diagnostics-core-source`/`hosting-core-source`), listed FIRST in the `.` export ahead of
  `types`, that routes the core's OWN program back to its not-yet-built src while every external
  consumer (which never sets the condition) resolves the built dist. This is deliberately narrower
  than the shared `source` condition §72 considered and rejected: `source` would pull every
  downstream consumer (`logging.core`, `hosting.core`, `diagnostics.core`, …) into co-compiling
  the core's src too. `hosting.core.test`'s white-box program hits the identical TS2664 through a
  different path — it pulls `hosting.core`'s src in via `./internal/*`, which still carries the
  self-`declare module` — so it sets `hosting-core-source` in its own tsconfig too, matching the
  library's.
- **§72's primary runtime desync does not recur.** §74 landed first, precisely so this wouldn't
  reopen it: derivation now keys on export MEMBERSHIP (literal target, then the
  `dist/<X> → src/<X>` twin), byte-identically in both engines, so a self-augmenting core
  compiling its own not-yet-built dist derives the same barrel token an external registrant does.
  Verified, not assumed: `bun run build`, `bun run test`, and `bun run lint` all exit 0 across the
  full workspace (1359+14 passes, 0 failures), including the §16 `examples.app.*` e2e that builds
  with `tspc` and diffs stdout against the checked-in `expected.txt` — the one suite that actually
  runs the built dist end-to-end rather than only typechecking against it.
- **`built` retired.** Dropped from `di.core`/`di`'s `.` export and from `customConditions` in the
  nine downstream consumer tsconfigs that used to set `customConditions: ["built"]` to force
  dist-resolution against di's still-src `.` export (the `di.transformer` pair, the example/app
  programs, and the di + config transformer test programs), plus the now-redundant `built` export
  condition on `examples.lib.with-transformer`. The per-core `-source` conditions above are its
  narrower replacement: `built` was a blanket forces-dist hatch any consumer could reach for; a
  `-source` condition exists only on its own owning core's tsconfig and is never set by a
  consumer.
- **`config` converted — the last runtime lib; #68 closed.** This entry originally deferred
  `config` as §74's flagged hard case, on the theory that its subpath-declared augmentation
  receivers (`./configuration-builder`, `./configuration-manager`) needed both a barrel collapse
  AND a `config.transformer` token-derivation change. The token half was wrong (see §74's
  correction): config derives no runtime augmentation token from the concrete `ConfigurationBuilder`
  class — every config-family registry token is `nameof<IConfigurationBuilder>()`, the interface,
  which lives in the already-dist `config.core`, so its barrel/subpath form is stable regardless of
  `config`'s own flip; and `config.transformer` rewrites only `.withType<T>()`, deriving no token.
  So the flip was mechanical, identical in shape to the three self-augmenting cores above: the two
  subpath exports collapse `types` onto the rolled `./dist/index.d.ts` (external consumers merge
  onto the flat barrel where `ConfigurationBuilder` is declared directly — no re-export chain to
  trip TS's phantom-duplicate) while a package-unique `config-source` condition, listed FIRST,
  routes `config`'s OWN program back to `./src/*` so its `with-type-augment.ts` self-`declare
  module` sees the concrete class in its declaring module during the not-yet-built compile. The
  `bun` per-file emit stays for white-box execution. Verified against the full gate — `bun run
  build`/`test`/`lint` all exit 0, including the config provider suites (`config.json`/`env`/
  `commandline`), `config.tests.integration`'s "augmentations are installed on the dist
  ConfigurationBuilder" assertions, and the §16 `examples.app.*` byte-diff e2e.
## 79. Augmentation collision model — delta install + blind prototype merge

The registry (§38) installs augmentation members onto a class prototype (the TS
stand-in for C# extension methods). Two different registrations contributing the
SAME member name onto one class used to silently clobber. §73's first cut fixed
the clobber with a member-identity marker on each installed slot; this entry
supersedes that with a simpler, correct-by-construction model in three parts.

- **Delta install (`@augment` never re-installs the whole bag).** The old
  listener re-installed the token's ENTIRE accumulated bag on every later
  `registerAugmentations(token, …)`. With eight config providers registering onto
  `nameof<IConfigurationBuilder>()` (config.json/env/commandline/ini/xml/file plus
  config's memory + chained), `addJsonFile` was re-installed ~8 times. Now the
  install is a DELTA: the INITIAL `@augment` application installs the
  currently-accumulated members ONCE (catch-up for anything registered before the
  class was decorated), and each LATER `registerAugmentations` installs ONLY that
  registration's own `set`. A member therefore reaches a given prototype EXACTLY
  ONCE. The delta is driven onto every subscribed class through a plain
  per-token SUBSCRIBER LIST called SYNCHRONOUSLY — deliberately NOT an
  `EventTarget` bus. A strategy-less collision (below) THROWS from
  `installMember`, and `EventTarget.dispatchEvent` SWALLOWS a listener's throw
  (reported out-of-band as an uncaughtException, never propagated to the
  dispatcher). Through a bus, an already-decorated class's genuine collision
  would return normally and silently DROP the colliding member — asymmetric with
  the catch-up path, which throws loudly. Iterating the subscribers directly
  lets the throw reach the `registerAugmentations` registrant.

- **Blind prototype merge (no tokens, no receivers, no member identity).**
  Mounting member `n` asks one question: is `n` already on the prototype?
  Absent → mount the `this`-forwarding thunk. Present → a genuinely different
  registration is colliding (the class's own primitive, a base-class member, or a
  member a DIFFERENT token/set already installed — different tokens share one
  prototype). With a `merge` strategy for `n`, mount a dispatcher chaining the
  incoming over the existing (blind — the strategy does not inspect which
  token/receiver/member it is). With NO strategy, THROW
  (`augmentation "n" collides on <Class> — supply a merge strategy`). Because
  delta install guarantees a member is mounted once, a second arrival at a taken
  name is always a real collision — there is no idempotency/marker bookkeeping,
  and the retired §73 `installed`-marker (`base`/`member`) machinery is gone.

- **The bag holds a per-name list (§73/3 kept).** `registerAugmentations` does
  NOT throw when a name is registered a second time under the same token — it
  appends to that name's list. The throw for an unresolved collision lives
  entirely at install: a late-decorated class replays the bag's contributions in
  registration order, and the second same-name contribution hits the blind merge
  (dispatcher with a strategy, or throw without one). The common cross-token
  same-name collision needs no bag list at all — different tokens share the
  prototype, so §2's install path already covers it; the list only covers a
  same-token same-name pair.

- **Double-installs are harmless by construction, not policed.** With delta
  install a member is installed once; the only residual double-install is the rare
  same-name-re-registered-with-a-strategy case, which self-chains into a dead
  routing branch. No machinery detects or prevents it — adding some would be
  weight against a case that is already inert.

- **The hand-authored, no-transformer path (the real API, per
  "No-transformer-first").** A wrapper that shares a name with the primitive it
  builds on (`ILogger.log`/`beginScope`, `IMemoryCache.tryGetValue`,
  `ILoggerFactory.createLogger`, and `di`'s `build` over `di.core`'s throwing
  stub) supplies a `MergeStrategy` by hand: a pure filter routing the
  primitive-shaped call to the primitive and the convenience-shaped call to the
  wrapper. The convenience form is thus dot-callable at runtime; it is NOT typed
  as a method overload (a concrete class declares the primitive in its body and TS
  forbids merging an incompatible overload onto it, TS2430), so the typed path
  stays the standalone functions. The seam left for the transformer: it will later
  auto-generate the default merge, so a transformer user never writes a strategy —
  built here as a no-transformer capability first, transformer sugar deferred.
