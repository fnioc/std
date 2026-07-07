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
The **API surface *within* a package may deviate** where our scope system or TS/BUN justifies it
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

| reference | ours | depends on |
|---|---|---|
| `ME.Options` (MEO) | `@rhombus-std/options` — a 4th family | `@rhombus-std/di.core` (MEDI.Abstractions) |
| `ME.Options.ConfigurationExtensions` | `@rhombus-std/options.augmentations` | `options` + `@rhombus-std/config.core` (MEC.Abstractions) + config's `bindConfig` binder |

- **`options` core:** pure `Options<T>` (`{ readonly value: T; subscribe?(cb): Unsubscribable }`)
  + monitor/snapshot semantics. **Config-unaware** — knows only the DI abstractions,
  exactly like MEO → MEDI.Abstractions.
- **`options.augmentations`:** ALL the side-effect `declare module` augments live here —
  augments `di.core` (adds `addOptions<T>()` to the authoring surface) **and** config
  (section → `Options<T>` binding). Mirrors `Options.ConfigurationExtensions`, and it is
  the *extensions* package — not core — that references the config abstractions.

### 4.2 Accessor model — collapse IOptions+IOptionsSnapshot (scope-justified); keep the monitor

> **Adopted** (per the strict-graph / free-API rule in §0): the singleton-vs-scoped accessor
> split is a fixed-lifetime reference-DI artifact; our open-ended scopes + registration-time lifetime
> + ancestor-walk (§3) erase it, so `IOptions` + `IOptionsSnapshot` collapse to **one `Options<T>`**
> (lifetime chosen at registration). The **reactive `IOptionsMonitor` is orthogonal**
> (change-notification, not lifetime) and stays a distinct capability, tied to `IChangeToken` / #6.
> Package boundaries + deps remain exact ME (§4.1).

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

- **Live-reload / monitoring (#6)** sub-decisions — *leaning*: type-driven opt-in;
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
