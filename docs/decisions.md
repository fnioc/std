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
