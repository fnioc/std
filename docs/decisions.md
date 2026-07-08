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

The original config port skipped several public
`Microsoft.Extensions.Configuration.Abstractions` APIs. This pass ports them: the convenience
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

- **Deferrals (issue #96, tracked as follow-up).** Extensions whose receiver is a concrete
  _options-bag_ class rather than a builder/cache interface are NOT yet given the method form —
  their standalone free-function form is unaffected. Namely: `addFilter` (LoggerFilterOptions), and
  the options-targeted rule mutators `enableMetricsRule`/`disableMetricsRule` (MetricsOptions) and
  `enableTracingRule`/`disableTracingRule` (TracingOptions). Prototype-patching a plain value object
  is a distinct boundary call from patching a builder, deferred rather than rushed. `tryGetValue` is
  deliberately standalone-only in perpetuity: `IMemoryCache` already declares a `tryGetValue`
  member, so a method merge would both clash and, at runtime, overwrite the real implementation the
  extension wraps.

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
