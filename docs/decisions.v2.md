# Decisions (v2)

**NOT gospel.** Claude's own decision log — the owner's record is `decisions.user.md`, and only that
file grounds architectural choices. Claude writes here freely, without asking: its own calls, working
positions, material for arguing a case with the owner. Each entry keeps its `§N` id so citations
across the codebase resolve here. No entry overrides another — correct the original in place (for a
`decisions.md` entry: strike it there, author the corrected entry here) — and every entry speaks only
of the present, so the doc reads the same in any order. di2 decisions stay distinct from di. Kept
terse on purpose — this doc is primarily for Claude's use.

---

## §92 — Authoring-only inline primitives live in their domain `*.transformer` package (no structural mirrors)

An inline-stage primitive that is ONLY ever called inside inline bodies (never in runtime source) is an authoring-time construct: it lives in its domain's `*.transformer` package, not `@rhombus-std/primitives`, and never as a structural mirror of the type it returns.

- `schemaof` (config `Schema` from a type) → `config.transformer`, which peers on `config` and already owns the `ts.Type`→`Schema` codegen + the `OPTIONAL` import injection.
- `tokenfor` STAYS in `@rhombus-std/primitives` — it is the one primitive called in RUNTIME source (`registerAugmentations(tokenfor<T>(), …)`), so every runtime package must import it. That runtime call-site is the discriminator between a universal primitive and an authoring-only one.

Consequences: the inline BODIES and their `rhombus-std` `inline` markers move to the transformer packages too — a runtime package cannot depend on its own transformer (the reverse of the real edge) — which deletes the old "inline.ts excluded from the runtime bundle" gymnastics; runtime packages stay clean. The Go inliner gate becomes a `knownPrimitives` name→home-module map (multi-package). This dissolves the prior schemaof blocker with no gate-widening and no hoisting of config's `Schema`/`OPTIONAL` into the zero-dependency leaf.

Implementation notes: a primitive cannot be self-imported by its own package name (bun's isolated linker makes no self-symlink → `tsc` fails), so an inline body imports its own package's primitive RELATIVELY (`./schemaof.js`); the gate scanner and the `inline-authoring` eslint rule accept the home-module specifier OR a package-relative one within the primitive's own package. A consumer or fixture of a moved primitive must depend on the transformer package (it peers on the runtime, so it isn't reachable from a runtime-only dep graph). _Owner-directed 2026-07-18._

---

## §93 — config keeps its hand-rolled `Schema`; zod not adopted

config's schema system (`Schema` / `Infer` / `coerce` — a hand-rolled, ~230-line, zero-dependency, reference-shaped set for string→scalar config coercion) is kept; zod is not adopted, at either the runtime or the transform layer. zod would add a runtime dependency to a foundational package, change the public API (`withSchema(z.object(…))` instead of the `{ Host: "string" }` literal), and shift coercion semantics (config's strict `parseNumber`/`parseBoolean` vs `z.coerce`); its strengths (refinements, unions, custom errors) are unused by config's narrow job. Decisive: zod is a runtime dependency and so cannot live in the zero-dependency leaf, which conflicts directly with §92's "primitives own their types in the right package" direction — a hand-rolled `Schema` can move where it's needed, zod cannot. _Owner-directed 2026-07-18._

---

## §79 — Augmentation collision model (delta install + blind prototype merge)

When two augmentation registrations put the same-named member on one class, that's a real
collision. Three parts make it correct-by-construction:

1. **Delta install.** `@augment` installs only each registration's own new members — the first
   application catches up on whatever was already registered, later registrations add only their
   own `set` — so a member reaches a prototype **exactly once**. Delivered via a synchronous
   per-token subscriber list, deliberately NOT an `EventTarget` bus (whose `dispatchEvent`
   swallows a listener's throw, which would silently drop a genuine collision).
2. **Blind merge.** Installing member `n` asks only "is `n` already on the prototype?" Absent →
   mount it. Present → real collision → mount a dispatcher if a `merge` strategy was supplied,
   else **throw** (`augmentation "n" collides on <Class> — supply a merge strategy`). No token /
   receiver / member-identity inspection.
3. **Bag = `Map<string, [fn, merge?][]>`** per token: each contribution pairs its fn with its
   own strategy; a second same-name registration just appends (the throw lives at install, not
   registration).

Double-installs are harmless by construction (mounted once). No-transformer path: a wrapper
sharing a primitive's name (`log`/`beginScope`, `tryGetValue`, `createLogger`, di's `build`)
supplies a hand-written merge; the convenience form is runtime dot-callable but NOT a typed
overload (TS2430), so the typed path stays the standalone functions. The transformer will later
auto-generate the default merge (deferred). _Owner-approved._

---

## §47 — Prefer relative internal imports; fall back to the fully-qualified specifier when relative doesn't work

Within a package, internal imports are relative by default. Reach for the fully-qualified package specifier (`@rhombus-std/<pkg>`) only where a relative one won't resolve correctly — the standing case being a `declare module` augmentation target, which must name the package **barrel** so the merge lands on the class every consumer resolves and survives the published `.d.ts`. _Owner-approved._

---

## §72 — In-repo resolution is source-first; dist is the published surface only

A library's dev `.` export resolves `./src/index.ts` for every consumer and every condition;
`publishConfig.exports` carries the `./dist/bundle/*` surface a published consumer gets. No custom
conditions exist: a self-augmenting package's own `declare module` resolves its own specifier to
the very source being compiled, so the self-typecheck needs no special casing. Full rationale and
mechanics: §192. _Owner-directed via the exports-rework charter (tasklist, 2026-08-19)._

---

## §74 — `tokenfor` and token derivation

`tokenfor<T>()` is declared in `@rhombus-std/primitives` with a throwing body (a call reaching runtime means the transformer wasn't wired). The transformer lowers it to a token identifying where `T` sits in the exports graph — the package barrel for a publicly-exported type (`pkg:Type`), the `_` subpath for a tests-only one (`pkg/_/file:Type`). It keys on export **membership**, not on-disk path, so a package's own build and an external consumer derive the identical token. The primitive `nameof<T>()` was renamed to `tokenfor<T>()`; the pipeline stage id `nameof` is unchanged. _Owner-approved._

---

## §83 — The white-box subpath is for tests and token derivation only

Each library's white-box subpath (`./private/*`, §97) maps to `./src/*` and is
publish-scrubbed, so it is reachable by exactly two things: test suites (which deep-import through
it), and token derivation's non-public token form for a type reachable only through it
(`pkg/private/<path>:Type`). Nothing in shipped code imports through it. _Owner-approved._

## §24 — No pluggable containers

di has ONE container type. `build()` accepts a `ServiceProviderFactory` — the type lives in
di.core only so the hosting builders share one shape instead of hand-rolling four copies — but it
IGNORES it: there is nothing to swap. Hosting and everything else must NOT try to support
pluggable or third-party (Autofac-style) containers, and `DefaultServiceProviderFactory` is
deliberately unported. _Owner-decided._

## §84 — Per-builder build-time state rides the builder's `properties` bag

When a hosting-builder augmentation needs to stash state for `build()` to read later (e.g. the
`ServiceProviderOptions` from `useDefaultServiceProvider`), it goes in `IHostBuilder.properties` —
the Map the builder already exposes and threads into the context — under a module-private `Symbol`
key. That bag exists for exactly this per-builder build-time state. (§24: with no pluggable
containers, the factory seam that would otherwise carry these is inert.) _Owner-approved._

## §85 — Keyed services as token-key composition

Keyed services are not a parallel resolution subsystem (the reference bolts on an `IKeyedServiceProvider` hierarchy because its identity is a `Type` object). Our service identity is already a token _string_, so a key is just a suffix on that token: `"<pkg>:<Type>#<key>"`. Registration and resolution of a keyed service therefore need no new engine — a `#`-suffixed token is an ordinary token, resolved by the existing single-arg `resolve(token)` at O(1).

`resolve` gains an optional trailing argument, `key: string | RegExp = ''`:

- an exact `string` (default `''`) → a single service (the non-keyed registration when `''`, else that key); the runtime composes `base + '#' + key` and does an exact lookup.
- a `RegExp` → the list of every registration under `base` whose key-portion matches; a pattern is a plural request, so it returns an array (registration order, per-element lifetime) and never throws on count.

Because "no key" is the empty-string key, the reference's `KeyedService.AnyKey` sentinel disappears: `/.+/` is "any that has a key" (the reference's `AnyKey`), `/.*/` is "true any" (keyed + non-keyed) — a superset the reference cannot express. The `Array<T>` / `Iterable<T>` collection wrappers stay **non-keyed-only** (the reference's `IEnumerable<T>` / `getServices` parity); keyed registrations are reachable only through the key argument, so the two aggregate operations stay disjoint.

The matcher runs against the **key-portion within a fixed base**, never the whole token, so a keyed resolve can never wander into a collection-wrapper token (`Array<pkg:T>`) or another type — the base you name scopes it.

Constructor injection uses a phantom brand, `Keyed<T, K extends string>`, sibling to `Inject`/`Typeof`: the transformer keeps the normal base derivation for `T` and appends `#K`. It stacks with `Inject` as an orthogonal intersection — `Keyed<Inject<T, "tok">, "k">` lowers to `resolve("tok#k")` — because `Inject` sets the base and `Keyed` sets the key. A literal `Keyed<T, "k">` lowers to the pre-composed single-arg form `resolve("<pkg>:<Type>#k")`; the two-arg form is needed only for a `RegExp` or a runtime-dynamic key. Both transformer engines lower it byte-identically.

Deferred: the reference's `FromKeyedServices` `InheritKey` mode (resolve a dependency with the _same_ key that resolved the enclosing service) needs the engine to thread the ambient resolution key through the resolution context — the one keyed feature that is genuine engine work rather than a brand. `ExplicitKey` and `NullKey` modes come for free (`Keyed<T,K>` and plain `T`). The reference descriptor-verb ladder (`addKeyedSingleton`/`tryAddKeyed*`/`removeAllKeyed`/`getKeyedServices`/`isKeyedService`) is likewise deferred — the `#`-token primitive already provides the capability; the sugar verbs are additive and unbuilt.

_Owner-approved._

## §44 — Libraries compile with zero ambient platform types

Every library builds a "bare" program: `types: []` (via `/tsconfig.lib.json`) so no `@types/*`
package auto-injects globals, and a `lib` without `DOM` so no `window`/`fetch`/`document`. The
published `.d.ts` then never leans on `@types/node` or `lib.dom` — an in-repo build sees exactly
what a bare published consumer sees. Platform types come in explicitly instead: `primitives` owns
`process` / timers / streams / `AbortSignal` as typed `globalThis` lookups, and `node:fs` / `node:path`
are typed by per-package `src/node-builtins.d.ts` shims (unimported, so never shipped). Tests,
examples, and repo tooling keep their bun/node types deliberately. _Owner-approved._

## §86 — Browser-host shutdown is a three-tier reliability contract

A browser can discard a page without running async work, so the browser host presents three tiers,
and callers must know which they are relying on:

- **Reliable — `PageLifecycleEvents.onFlush`.** Fires synchronously on every `visibilitychange →
  hidden`, while the page is still alive. Synchronous work here — a `localStorage` write, a
  `navigator.sendBeacon` call — is guaranteed to run (for a beacon: the call fires and enqueues, not
  that delivery arrives). This is the one place to persist critical state; listeners must be
  synchronous.
- **Conditional — a synchronous `applicationStopping` listener.** Runs when a terminal
  (non-persisted) `pagehide` fires, because the abort dispatch is synchronous — but `pagehide` is not
  guaranteed on hard or mobile discard. A backstop, not a guarantee.
- **Best-effort — the async `host.stop()` pipeline** (hosted-service `stop()`/dispose,
  `applicationStopped`). Cut off mid-await on a terminal pagehide and may never start on an abrupt
  discard; reliable only for a deliberate in-app stop, not a page-close-triggered one.

A persisted (bfcache) pagehide never stops the host (suspend≠stop, §69). `sendBeacon` is a plain
global a caller uses inside its own `onFlush`. _Owner-approved._

## §87 — Augmentation authoring stays first-party

Consumers being able to author augmentations is **not** a goal. Consumers authoring
**concretes** that implement an augmented interface **is** a goal — a distinct thing from
authoring the augmentation itself. This ruling drives the scoping of the default-merge-strategy
transformer (#213). Full elaboration lives in `docs/features/augmentations.md` (§89). _Owner-approved._

## §88 — Transformer receiver matching anchors at the declaration site

Full text now lives in `docs/features/augmentations.md` (§89) — the declaration-site-anchoring mechanism
described there. Kept here only as a citation anchor (cited as `(§88)` from `CLAUDE.md`).
_Owner-approved._

## §89 — Augmentations are the sole extension mechanism; no deviation

The full system — authoring, the OPEN/CLOSED install split, the token registry, the `@augment`
collision model, and the transformer's declaration-site matching — is documented once, in full, at
`docs/features/augmentations.md`. It is the ONLY mechanism this monorepo uses to add a member to an
interface after the fact — no package substitutes a bespoke mixin, a runtime monkey-patch, or a
free-function-only surface to route around it, and no receiver skips the OPEN/CLOSED split or the
`@augment`/registry install path the doc describes. Its package placement and dependency shape
mirror the reference implementation's own static-extension-class placement and dependencies
exactly (§0) — never a shortcut taken to save porting effort. _Owner-approved._

## §90 — One owner `ttsc` binary; every consumer runs its full, always-on stage table

The Go/`ttsc` build engine (§41) ships as **one owner binary**, `transforms/cmd/ttsc-std`, linking
every transform stage in one fixed canonical order. Every consumer's `ttsc` descriptor resolves to
this same source dir, so `ttsc` dedupes every consumer to one cache key and one spawn — whichever
descriptor triggers the spawn, the host always runs its full stage table; there is no second layer
deciding which stages apply (§119).

Rejected alternatives:

- **Per-combination hand-authored hosts** — the original disease this decision fixes: a bespoke
  binary per stage-combination a consumer happens to need.
- **Family-partitioned hosts** — just recreates curated aggregates against the same opening
  constraint, one layer removed.
- **Multipass source-to-source chaining** — corrupts source maps, since later passes' positions
  anchor to the previous pass's intermediate text rather than the original source.
- **Dynamic loading** (`.so`/wasm/gRPC) — conceded value collapse: a wasm host-mediated ABI was
  buildable, but shipping once collapses into a re-ship-per-`ttsc`-pin treadmill.
- **Build-time generated hosts** — whole-module cache-key poisoning plus `v0.0.0` resolve
  mechanics.

Declare-by-depending — a dependency on any `*.extras` package's auto-discovery marker spawns the
shared host — is the mechanism (§100): what a dependency governs is spawning the host and which
certified bodies are in play, never which stages run.

Mechanics — descriptor/source dedup, the publish story — live in
`docs/features/transformer-architecture.md`, the canonical reference; this entry records only the
ruling. _Owner-approved 2026-07-16._

## §91 — Inline-stage matching is by symbol identity, not a string key

A `rhombus-std` `inline` entry's `type`+`member` pair resolves through the checker to declaration
sites, once per program: the type reference resolves to a module symbol, then to the exported type,
and every type on that surface is asked for its own member of the entry's name (§159 states which
sites those are and why the surface is walked rather than queried for a property). A call site
matches by node identity against that set, or — when its binding falls outside it — by the marker's
own name/shape/receiver triple. Never by a string key, canonical name, or reconstructed token.

Scope stays workspace-only — never a published manifest, never a dist/JS resolution path
(consistent with §87) — and the certified grammar is narrow: interface member (`type`+`impl`+
`member`) and free function (`impl` only) are certified; class member and object-literal member are
specced but flagged uncertified. Matching goes one level deep, no recursion.

Four canonical-string-key designs were tried and rejected before landing here. A string key has to
be derived from some one declaration site, but N separately-authored declarations of "the same"
member are what `declare module` augmentation exists to produce — a string reconstructed from any
one of those sites cannot know about the others, and drifts the moment an augmentation changes
shape.

Full schema, the authoring lint, and the tripwires (rogue-duplicate, emit sweep) live in
`docs/features/transformer-architecture.md`; this entry records only the identity-vs-string ruling.
_Owner-approved 2026-07-17._

## §94 — Resolution sugar always asks the container

Every resolution sugar body is a bare container call — the `get*` family lowers to the
token-explicit member with a derived `Type` argument. There is no compile-time singularity
dispatch: a literal-typed request reaches the container like any other request.
_Owner-directed 2026-08-12 (singular death)._

## §95 — `addOptions` sugar homes in its transformer satellite

The phantom `addOptions<T>()` typing, its certified inline body, and the `rhombus-std` `inline` marker all
live in `di.transformer.options` (per §92); `options.augmentations` keeps only the runtime explicit
verbs. The compile-time guard stands: without the satellite in the program, the 0-arg form does not
typecheck — no compiles-then-throws.

The bespoke di-options lowering stage retires into the generic inline path: the body lowers to a
dot-call of the explicit verb (`this.addOptions(tokenfor<IOptions<T>>(), tokenfor<T>())`), so the
augmentation prototype wrapper and any merge dispatcher execute exactly as they would for
hand-written code. This requires the inline engine to support nested closed-generic type-argument
instantiation (`tokenfor<IOptions<T>>()`).

Token derivation is one function, not two: the non-hole-aware derivation collapses into the
hole-aware `DeriveTokenF`, mirroring the reference's single `deriveToken`.

_Owner-directed 2026-07-18._

## §96 — One transform engine

The Go/`ttsc` engine (§41, §90) is the **only** transform engine. The ts-patch track — twin
transformer sources, `tspc` emit and check invocations, `tsconfig.build.json` twins, and the
ts-patch dependencies — is removed, tagged at the restore point `pre-tspatch-removal`. Typecheck and
lint for sugar-consuming packages run plain `tsc --noEmit` over the phantom typings; transformer-
authored diagnostics fire on the build path, which the same gate runs.

Tests must never run different code than what is delivered — no load-time re-transformation of
library code. A test category of sugar-**authored** tests, compiled by the same Go pipeline,
exercises transform and runtime together.

Build shape per lowering package: one per-file lowering pass (a "stage") whose output is retained as
`dist/private`, then a plugin-free bundle is built **from** that stage emit. Each file lowers exactly
once, and the bundle tests execute is built from those same lowered files — never a second,
divergent lowering.

_Owner-directed 2026-07-18._

## §97 — White-box surface: `./private/*`; strict token derivation

Every library exposes `./private/*` as its one white-box seam: `types`/`bun` → `./src/*.ts`,
deliberately carrying no `default` so the subpath stays NON-PUBLIC to token derivation. It serves
both typing and execution — a deep-imported source file lands on the same module instance the
barrel resolves (source-first, §72/§192), lowered at load time where the package lowers. The root
`.` export is the bare-string source barrel (§72). `./private/*` is in-repo only: `publishConfig`
rewrites `exports` without it, and `files` excludes the stage emit directory.

Token derivation for an exports-mapped file matches the **shortest** subpath among export entries
carrying a `default` condition — public, where a bare-string target counts as carrying one — with
ties broken lexicographically; the root `.` export is the shortest possible case, deriving the bare
`pkg:Type` form. If no public entry reaches the file, `./private/*` — deliberately default-less, the
one sanctioned in-repo internal surface — derives `pkg/private/<path>:Type`. If neither reaches it, a
hard diagnostic names both fixes (export the type publicly, or expose its file via `./private/*`).
Shortest-within-public supports deliberate public aliasing; only publish-surviving entries ever
compete, so an internal or test mapping can never affect token identity. The derivation path for a
package with no exports map is unchanged. `internal` is banned as an export alias, since it collides
with same-named source folders.

_Owner-directed 2026-07-18._

## §98 — A key composes into the type; a keyed address is a tagged one

A keyed registration is not a separate argument travelling beside a type, and not a `base#key`
string. The key composes INTO the type: `Type.tag(base, key)` is the address the registration lives
under, and the same type under a different tag is a different type. One node, one address, one
lookup — the container never has to know that "keyed" was a thing a caller said.

The explicit registration verbs each carry ONE signature with an optional TAIL key parameter —
`addClass(type, ctor, signatures, scope?, key?)`, `addFactory(type, factory, signatures, scope?,
key?)`, `addValue(type, value, key?)` — never an overload pair. The verb composes the tag when a key
is given and passes the bare type when one is not, so an unkeyed call and a keyed call reach the
same code path with different addresses.

`typefor` over a `Keyed<T, K>` brand derives the BASE type unchanged — base extraction, not key
loss. The brand is a type-level marker a caller may carry; the address a registration answers under
is the tag the verb composed.

_Owner-directed 2026-07-19; the tag-composed address is the owner's 2026-08-13 ruling._

## §99 — Registration overrides are sparse arrays merged at runtime

The `add<T>(ctor, overrides)` form's override array uses SPARSE HOLES to skip positions
(`['x:A', , 'x:C']` — the hole keeps the derived token for that slot); an explicit `undefined`
element instead OVERWRITES the slot with `undefined`. This works because the merge is a plain
`Object.assign` over a copy of the derived signature: `Object.assign` copies only own enumerable
properties, a hole is not an own property, and an array's `length` is own but non-enumerable — so
`Object.assign` naturally skips holes and passes `length` through untouched.

The merge happens at RUNTIME, inside the certified body — not at compile time. The override
argument therefore need not be an inline array literal; any expression that produces the array is
legal, for transformer and no-transformer callers alike (the no-transformer-first rule,
`CLAUDE.md`).

_Owner-directed 2026-07-19._

## §100 — Transform activation and body collection are one dependency scan

Declare-by-depending (flagged in §90 as a nice-to-have) is the mechanism: a dependency carrying
the transform auto-discovery marker implies its transform for the consumer. The marker lives on
`*.transformer` packages — never on a core, whose ubiquity would force activation on every
consumer regardless of whether it actually uses sugar. A dependency on a `*.transformer` package is
a precise "I use this family's sugar" signal, since transformer packages peer on their cores and
are otherwise unreachable from a plain runtime dependency graph.

The same recursive scan that activates stages also collects certified bodies (the `rhombus-std`
`inline` markers, §91), including from the consumer package itself; a third-party sugar library's own
consumers receive the needed stages transitively, through that library's `*.transformer`
dependencies, with no action of their own. Explicit `tsconfig.ttsc.json` declaration (§90) remains
the override and opt-out path.

A plain consumer never authors a `rhombus-std` `inline` marker. Authoring one makes a package a toolchain
participant, whose obligations arrive as a bundle: its inline bodies must be certified
single-expression forms (§91), its body sources ship in the published files, it carries its own
auto-discovery marker, and it builds through the same transform machinery as every other
transformer package.

_Owner-directed 2026-07-19._

## §101 — Certified bodies are direct-over-primitives; no nesting

A certified inline body (§91) may compose authoring-only primitives and explicit runtime verbs,
but may NOT call other sugar. There is no recursive expansion — the manifest reserves no field for
it — so adding nesting later is purely additive, not a breaking change to the existing grammar.

Cross-package composition happens at runtime instead, through ordinary function calls: a family's
registration helpers are themselves runtime members, and any sugar those helpers use lowers at
their own declaring package's build, not at the call site that invokes them.

_Owner-directed 2026-07-19._

---

## §102 — API placement follows reference assembly parity; a runtime package wholesale re-exports its own core

Where an API lives is decided by the reference assembly that owns it, NOT by whether the target
package happens to emit runtime. The abstractions assembly's public surface — including its
convenience helpers, static-class member sets, and small runtime discriminants — belongs in the
family's `*.core` package even when that means the core ships a JS bundle. A `*.core` is
"abstractions", not "types-only"; a core emits runtime whenever the reference's abstractions
assembly does. (This retires §21's "park it in the runtime package because the core is types-only"
placement for the config family: `configPath`, `ConfigAugmentations`/`ConfigRootAugmentations` +
`exists`, and the `ConfigDebugViewContext` type moved to `config.core`.)

Three standing rules fall out:

- **A runtime package wholesale re-exports its own family core** (`export * from
  '@rhombus-std/<family>.core'`), so its public surface stays a strict superset of the core's and
  every consumer keeps resolving the abstractions through the runtime package unchanged. Where a
  name is defined in both, the runtime package's explicit local export wins (ES module semantics
  give an explicit re-export precedence over a `*` re-export) — e.g. `logging`'s concrete `Logger`
  shadows `logging.core`'s `Logger<T>`.
- **In-repo library source imports family ABSTRACTIONS from the `*.core` specifier directly**, never
  through the runtime package's re-export. The wholesale re-export is a consumer-facing convenience;
  first-party code targets the core it depends on. (Tests may use either.)
- **Runtime section-vs-root discrimination goes through `config.core`'s branded guard.** TS erases
  interfaces, so the reference's `config is IConfigurationSection` interface test has no runtime
  form; and structural duck-typing fails because the port's root exposes `key`/`path`/`value` yet is
  not an `IConfigSection`. `config.core` exports a unique-symbol brand the concrete `ConfigSection`
  stamps on itself (a public own property) plus `isConfigSection(x): x is IConfigSection` that reads
  it; a root never carries the brand. The brand lives in the (external, shared-singleton) core so
  the symbol is identical everywhere (§38 identity invariant), never a forked copy.

_Owner-directed 2026-07-18._

---

## §103 — One `ttsc` binary links typia; the two-host split retires

The two-binary split (§90's "typia/mergesynth stays in-repo-only, in a separate host, never in the
published `ttsc-std`") is retired. There is ONE owner binary: the merge-synthesis stage folds into
`stdhost.BaseStages()` (before nameof), so `cmd/ttsc-std` links typia and `cmd/ttsc-std-full` is
deleted.

This does not reopen §87. `ttsc-std` is a BUILD-TIME plugin binary, never shipped as runtime: typia
is fully lowered at build time — the stage inlines its guards as plain JS and drops any guard that
would need a typia runtime import — so no typia reference survives into a published artifact or npm
manifest (§87's "emitted guards are typia-free" invariant stands). The typia-free-_published-binary_
consequence §90 drew from §87 is therefore unnecessary; the measured cost of linking typia into the
one binary, +4.4 MB / +17.6% on the compiled sidecar, is accepted for the single-host
simplification. §87's core ruling — augmentation authoring is first-party-only — is untouched.

mergesynth gates on `primitives.transformer` like every other stage — no always-on carve-out. An
augmentation-installing package gains synthesized default-merge strategies purely by depending on
`primitives.transformer` (which every lowering library does); a package that installs no
augmentation gets a no-op and byte-identical output.

Selection is §100's declare-by-depending, implemented HOST-SIDE as literally one scan: the host's
`CollectProject(cwd)` walk yields BOTH the active stages (from each reachable `*.transformer`'s
`ttsc.stages` marker) and the certified bodies (§91) in a single traversal. `build-lib.ts` passes no
explicit plugin list, so `ttsc`'s own (direct-only) auto-discovery merely spawns the one host — the
transitive reach that declare-by-depending needs comes from this scan, not from `ttsc`. Outside any
workspace (a bare non-workspace project that declares its plugins explicitly) the scan degrades to
empty and selection falls back to the manifest; the zero-stage guard and the inline emit-sweep still
fail loudly on a genuine misconfig. One refinement keeps §100's "cores don't force-activate" exact:
devDependencies are followed for the consumer package only, never transitively — a transitive
dependency's devDeps are its own build tooling (di.core devDeps `primitives.transformer` to lower
ITSELF), which a plain di.core consumer must not inherit. For every real workspace package this is a
no-op; it changes only the degenerate core-only-consumer case the invariant is about.

_Collapse and mergesynth-gating owner-directed 2026-07-19; the host-side one-scan implementation of
§100 and the root-only-devDep refinement are Claude's implementation calls._

---

## §104 — Family-neutral primitive stages vs per-family sugar bodies

The primitive STAGES a family's sugar leans on — inline and typefor, alongside nameof and
mergesynth — are family-neutral machinery under `transforms/internal/*`, surfaced through
`primitives.transformer` (its `ttsc.stages` set, plus the `./inline-ttsc` / `./typefor-ttsc`
single-stage override descriptors). A family's own `*.transformer` (di.transformer,
di.transformer.options, config.transformer) owns only its per-family sugar: the phantom typings, the
`rhombus-std` `inline` BODIES (§91), and its own stage (`di` / `di_options` / `config`). This complements
§92's primitive-STUB homing — the stubs and their typings stay in their domain transformer; §104
records where the STAGE machinery lives.

The honest dep edge falls out: because a family transformer's inline bodies call the neutral
primitives (`tokenfor`/`typefor`), that transformer genuinely requires the primitive stages, so
di.transformer, di.transformer.options, and config.transformer each declare
`@rhombus-std/primitives.transformer` as a `dependency`. That edge is what lets §103's host scan
reach the primitive stages for a family-sugar consumer: a library depending on di.transformer's
sugar gets inline+nameof+typefor activated with no action of its own. The edge is build-graph
only — `primitives.transformer` ships no runtime JS, so it never enters a bundle.

_Owner-directed 2026-07-19 (the family-neutral-stage placement); the dependency-edge mechanics are
the implementation._

---

## §105 — Editor navigation is a whole-repo program over source

Cross-package IDE rename / find-references needs the editor's TypeScript program to see one unified
symbol identity across packages, AND to contain every consumer — resolution alone cannot make a
rename reach a package nothing currently open imports. So each package's `tsconfig.json` is an
editor-only whole-repo program (`include: ["../*/src/**/*"]`, extending `/tsconfig.editor.json`);
the strict CI/build config is `tsconfig.ci.json`, which `tsconfig.ttsc.json`, the per-package
`lint` scripts, and `build-lib.ts`'s typecheck read. Module resolution needs no editor-special
help: in-repo exports resolve `@rhombus-std/*` to source for every program (§72/§192), so the
editor works identically on a cold clone and after a build. `paths`-based src-refs were tried and
rejected back when runtime resolved dist: bun honors tsconfig `paths` at runtime, which would have
poisoned module resolution; source-first resolution with load-time lowering (§192) is what made
the whole condition apparatus unnecessary.

_Direction owner-directed._

---

## §106 — Open-generic matching is `Type`-node unification; a generic hole is `Type.generic(label)`

Closing an open registration (`IRepo<%T>`) against a ground request (`IRepo<app:User>`) is `Type`-node unification, not string manipulation, and there is no separate token model to keep in step with it. `Type` (§137) is the whole vocabulary: a generic hole is its own node kind — `GenericType = { kind: 'generic', label: string }` — minted by `Type.generic(label)` and written `%<label>` in the token grammar (`libraries/primitives/src/Type/internals/parser.ts`'s `%` case), an arbitrary string label rather than a positional numeric index. `Type.isOpen(type)` (`libraries/primitives/src/Type/analyzers.ts`) reports whether a type still holds a hole anywhere; `Type.match(pattern, subject)` asks whether some instantiation of `pattern` extends `subject`, returning the label→`Type` bindings it captured; `Type.substitute(type, bindings)` replaces each hole the map names. All three are static members of `Type` (`libraries/primitives/src/Type/Type.ts`), each backed by a dedicated visitor (`SatisfiesVisitor`, `SubstituteVisitor`) over the one node tree every other `Type` operation shares (§111).

- **Holes are labels, not indices.** `Type.match` records one binding per generic label in the pattern, so a template may reuse or reorder labels freely; a repeated label must bind the same `Type` at every occurrence, which interning makes an `===` compare.
- **One grammar, one parse.** `Type.from` is the sole place a token string becomes a `Type`, for a registration, a request, or a dependency signature alike (§111) — there is no second, shallower classifier a hand-typed template's whitespace or hole spelling could disagree with.
- **The engine.** `Registry` (`libraries/di/src/internal/Registry.ts`) partitions a manifest once, at construction, into closed registrations (keyed by the interned `Type` itself, reached by `===`) and open registrations (kept in a list); `Registry#matching(request)` answers a closed hit by identity and an open hit by running `Type.match` against each open registration in turn, yielding a `Registration` already closed over whatever the match captured (`Registration.substitute`).
- **Partial closing is live; most-specific-wins is not.** A registration mixes concrete args and generic holes freely — `Type.match`'s unification is fully recursive over the whole tree, so nothing about registering a partially-closed template needs special-casing (§124's retired ground). Overlapping open registrations are ranked by registration recency, not specificity (§125's retired ground, and the present gap it leaves).

§141 records the `Type` taxonomy this matching walks over; §142 the resolution walk that calls it.

---

## §107 — ttsc plugin cache is shared on disk; e2e sandboxes are per-worktree

`/tmp` here is a `tmpfs` with a per-user quota (~6 GiB). ttsc resolves its plugin cache per WORKSPACE
ROOT (`<root>/node_modules/.cache/ttsc`), and each e2e suite's throwaway project is its own workspace
root, so every unpinned suite grew a PRIVATE cache — each a compiled sidecar (~30 MB) plus ttsc's own
Go object cache (GOCACHE under the cache root, ~3 GB). The unpinned suites on `/tmp` plus the main
build drove a cold full gate toward ~15 GB into the ~6 GiB quota → `EDQUOT`.

The cache is content-keyed, so ONE shared location is correct: a version skew is just different keys
in the same store, and Go's object cache is concurrency-safe. So `TTSC_CACHE_DIR` and `GOTMPDIR`
default to a shared, disk-backed home dir — `~/.cache/fnioc-ttsc/{cache,gotmp}` — for the main build
(`build-package.ts`'s `ttscEnv`) AND every e2e suite's `goEnv`, each written default-if-unset so CI
or a shell can override. The cold ~5-min sidecar compile is now paid once per machine, not once per
suite or worktree.

The throwaway sandboxes move to `~/.cache/fnioc-ttsc/sandboxes/<worktree-dirname>/<suite>` — keyed by
the worktree directory name for per-worktree isolation, but crucially OUTSIDE the repo tree. A
sandbox must sit outside any enclosing `package.json`: ttsc derives its tokens relative to the
nearest package root, so a sandbox under the monorepo re-roots a fixture's local tokens as members of
`@rhombus-std/monorepo` (`@rhombus-std/monorepo/…:ILocal`) instead of the package-less `./app:ILocal`
the parity corpus expects. The old `tmpdir()` / `~/.cache` homes had no enclosing manifest — a
load-bearing property this preserves. Two sessions in different worktrees get independent sandboxes
but share the one content-keyed cache: collision-free, and the ~3 GB per-suite duplication is gone.
CI caches `~/.cache/fnioc-ttsc/cache` (scoped so the sandboxes ride outside it).

**Refinement — the Go objects go to the global `GOCACHE`.** ttsc only invents its private object
cache when `GOCACHE` is unset; its build code honors an ambient value. Every env site (the eight
suite `goEnv`s + `ttscEnv`) now also pins `env.GOCACHE = process.env.GOCACHE ?? ~/.cache/go-build`.
That path is Go's own default — the assignment is not a no-op; a set `GOCACHE` is the signal ttsc
reads. The sidecar's object graph is the same one the transforms Go gates compile, so the two stop
double-caching (~3 GB reclaimed) and a cold sidecar build against a gate-warmed cache is mostly
re-linking; `~/.cache/fnioc-ttsc/cache` shrinks to the keyed sidecar binaries.

_Owner-directed 2026-07-21; GOCACHE refinement owner-approved 2026-07-23._

---

## §114 — A mutable manifest slot is the seam between an immutable manifest and a stateful builder

`Manifest` is immutable (§108: an iterable decorator chain; every verb returns a NEW manifest). Everything that _wraps_ a manifest and is configured by a caller-supplied delegate — `ILoggingBuilder`, `IMetricsBuilder`, `IHostApplicationBuilder` — therefore cannot register "into" the manifest it was handed. The seam is a single mutable slot: a builder's constructor accepts `Manifest | ManifestSlot`, where `ManifestSlot` is the structural type `{ services: Manifest }` — a bare manifest gets a private slot allocated for it, an existing slot is SHARED — and every builder augmentation does `builder.services = builder.services.addX(...)` and returns the same builder. Mutation-shaped ergonomics survive; the chain underneath stays immutable. `ManifestSlot` is not one centrally-exported type: `libraries/logging/src/LoggingBuilder.ts` and `libraries/hosting/src/MetricsBuilder.ts` each declare their own — the seam works by structural typing, not a shared nominal interface.

Two consequences are load-bearing:

- **Long-lived sibling builders SHARE one slot.** `HostApplicationBuilder` passes `this` as the slot to its `LoggingBuilder` and `MetricsBuilder` (through `HostBuilderAdapter`, `libraries/hosting/src/internal/HostBuilderAdapter.ts`), so `builder.logging.addConsole()`, `builder.metrics.enableMetrics(…)`, and `builder.services = builder.services.add(…)` all land on one chain. Constructing them over a manifest VALUE instead would fork the chain three ways.
- **`IHostBuilder.configureServices` / `configureContainer` are RETURNING delegates** (`Func<[HostBuilderContext, Manifest], Manifest>`, `libraries/hosting.core/src/IHostBuilder.ts`): a delegate is the one place with no builder to write through, so the manifest has to come back out. A void callback there is a silent-drop trap — it typechecks and registers nothing.

_Owner-directed (the mutable-slot seam, forced by the immutable-manifest design); the current per-package slot shape is Claude's._

---

## §108 — `Manifest` is an interface; its own body carries three primitives, every registration verb arrives through augmentation

`Manifest<Scopes>` (`libraries/di.core/src/Manifest.ts`) is an interface extending `Iterable<Registration<Scopes>>`, and its own body declares exactly three members — `add`, `remove`, `replace`, each taking one registration — each returning a NEW manifest rather than mutating the receiver, so a call whose result is discarded registers nothing. `DefaultManifest` is the concrete, `@augment`-decorated class: an immutable decorator chain where `add` prepends one registration via a generator that yields the new registration then delegates to the rest, so iteration order is newest-registration-first.

Every other registration verb — `addMany`, `addClass`, `addFactory`, `addValue`, `tryAdd` and its typed siblings, `replaceClass`/`replaceFactory`/`replaceValue`, `removeAll` — arrives through augmentation onto `Manifest`, in `libraries/di.core/src/augmentations/`. Augmentation also contributes further `add` shapes on the primitive's own name: a lambda that walks the per-registration builder (§109), or an implementation plus its composed call-shape type positionally (§188). `addClass`/`addFactory`/`addValue` are separate convenience verbs that compose a `Registration` from a type, an implementation, and the implementation's own composed `Type` (`libraries/di.core/src/Registration/Registration.ts`), then forward to `add`. Builders that wrap a manifest and are configured by a caller delegate keep mutation-shaped ergonomics on top via a mutable-slot seam (§114). _Owner-directed (the immutable-chain, verb-carried-by-augmentation direction); the builder's slot mechanics (§109) are Claude's._

---

## §109 — The per-registration builder gates completion on the type system: an impl door, then exactly one call-shape door, then optional lifetime/tag doors

The two-argument `add(type, configure: Func<[Unstarted<T, Scopes>], IComplete>)` form hands the configure lambda a `PendingRegistration` typed as `Unstarted` — every step door still open, no `IComplete` in the intersection — and walks it through `libraries/di.core/src/builder.ts`'s `Pending<T, ImplementerNode, Scopes, Slots, Ready>` type: each slot still open (`'implementer' | 'implementerType' | 'lifetime' | 'tag'`) contributes one interface to an intersection, so only the doors for open slots are callable. `asClass`/`asFactory`/`asValue` spend the `implementer` slot and open `implementerType` (skipped by `asValue`, already complete once tagged); `withSignature(...paramTypes)`, `withSignatures(...rows)` or `withType(implementerType)` spend `implementerType` — exactly one of the three, since taking any removes the slot the other two also target — and only this step flips `Ready` to `true`, adding `IComplete` to the intersection. `withLifetime`/`taggedAs` remain independently callable afterward without gating completion further. A lambda that never opens a call-shape door never reaches a value `add`'s overload accepts, so the gate is enforced by the type checker, not a runtime check.

`withSignature` is variadic (`...paramTypes: Array<Type | string>`) and spends `implementerType` naming one parameter row; `withSignatures(...rows: ReadonlyArray<ReadonlyArray<Type | string>>)` spends the same slot naming several, one per call the implementation answers to. A registration's whole call shape can also be named positionally, without the builder: `add(type, ctor, implementerType, scope?, key?)`, where `implementerType` is one composed `ConstructorType` or `FunctionType` — its own `args` field is a `TypeSignatures`, one row per call, so an overloaded implementation is one node carrying several rows rather than several nodes joined. Sugar (`addClass<T>`, `addFactory<T>`, `add<T>`) derives `T` and, where relevant, `implementerType`, so the same builder ergonomics are available to a hand-writer and a transformer-driven caller alike.

_Owner-directed (the gated-completion, single-call-shape-door direction); the current slot/intersection mechanics are Claude's._

---

## §110 — Primitive naming: `-for` mints an identity, `-of` observes an existing one

A primitive's suffix says which half of the job it does. `-for` MINTS an identity for a type nothing
has stated yet: `typefor<T>()` mints `T`'s address, `tokenfor<T>()` its string token. `-of` OBSERVES
something the target already carries: `tokenof(value)` reads a value's own type, and `schemaof<T>()`
reads out the members `T` already declares. `typefor` alone crosses both halves: its value-argument
overload, `typefor(ctor)` / `typefor(factory)` / `typefor<typeof C>()`, OBSERVES a runtime
constructor or factory's own construct or call signatures, deriving the callable `Type` they
describe the same way any `-of` primitive observes its target.

The pipeline STAGE ids are independent of the function names — the `nameof` stage lowers
`tokenfor`/`tokenof`, and nothing requires a stage to be named after the primitive it folds.

_Owner-directed (the -for/-of convention itself); the naming of each primitive against it is
Claude's, done as a dedicated PR per the owner's "name them right the first time" direction._

---

## §111 — One `Type` tree serves both the resolve side and the signature side

A resolve request and a dependency-signature slot are the SAME `Type` expression — there is no separate tree for one and not the other. `Type` (`libraries/primitives/src/Type/Type.ts`) is a single plain-data discriminated union, minted through interning factories (`libraries/primitives/src/Type/internals/factories.ts`), and every operation over it — `match`, `satisfies`, `substitute`, `stringify`, `validate` — is written once, as a dedicated `TypeVisitor<T>` subclass (`SatisfiesVisitor`, `SubstituteVisitor`, `StringifyVisitor`, `TypeValidatorVisitor`) dispatching one `switch (kind)`, not `accept`-on-node. Nodes stay plain data, so the immutable-update idiom keeps working, and a `Registration`'s dependency signatures (`TypeSignatures`, `libraries/primitives/src/Type/Type.ts`) are literally `ReadonlyArray<readonly Type[]>` — the same `Type` nodes a request is built from, closed over an open registration's captured bindings by substituting the registration's whole `implementerType` (`Registration/op.ts`'s `substitute`, which applies `Type.substitute` to it directly).

The wire format is the one grammar `Type.from`/`Type.stringify` run at the data-input/output boundary (§106) — there is no separate parse step for a signature versus a resolve target. _Owner-directed (the one-tree, parse-at-the-boundary direction); the visitor shape and node-as-plain-data reasoning are Claude's._

---

## §112 — A union dependency is chosen once, when the plan is built; nothing here falls through if the chosen member later fails to construct

`PlannerVisitor` (`libraries/di/src/internal/Plan/PlannerVisitor.ts`) decides a union's member at PLAN-BUILD time: `#chosen`/`visitUnion` ask which registered or synthesizable member the union resolves to, and that choice is baked into the `Plan` the engine memoizes per request (`Engine#planFor`, `libraries/di/src/internal/Engine.ts`). Realizing the plan later never re-asks the question — nothing in `Plan`/`RealizeVisitor` catches a construction failure and tries the union's next candidate. Multiple members that could each answer the union raise `AmbiguousUnionError` at plan-build time (or take the newest, under `unionAmbiguity: 'newest'`); a literal member is the union's fallback when no other member resolves.

_Claude's finding, flagged for owner review: whether a union member that throws or rejects during construction should fall back to the next candidate is a design question the current engine has not answered either way._

---

## §113 — Chain-modifier sugars lower through the general inline stage, not a bespoke Go stage

`withSignature` / `withType` / `withLifetime` / `taggedAs` lower the same way every other sugar
call does: through the single-expression inline stage, one call substituted per fixed-point pass
(§115) until the whole chain resolves — a chain like
`addClass<T>(C).withSignature(S).taggedAs('primary')` peels one call per pass. There is no separate
di-direct Go recognizer set: the fixed-point loop reaching inner chain positions, together with the
transitive-witness module-resolution fix (§119), makes the inline path sufficient for both
dist-referenced and di-direct consumers, and both emit byte-identical output. Full mechanics live at
§115; kept here only as a citation anchor.

---

## §115 — Fixed-point loop replaces stage-order dependence; the enabling invariant is disjoint match sets

The transform engine runs one ordered set of primitive stages repeatedly, per file, until a pass
changes nothing (max 16 passes, loud `FIXED_POINT_EXHAUSTED` on exhaustion — never a silent cap),
instead of a single top-to-bottom sweep. Each stage matches only the OUTERMOST construct it
recognizes and does not descend into what it produced; a chain
(`addClass<T>(C).withSignature(S).taggedAs('primary')`) peels one call per pass. This is
receiver-recursion-free by construction — no stage
author ever writes a visitor that walks into its own output — because the loop supplies the
recursion.

Correctness under repeated, unordered running rests on one invariant: **every stage owns matches
no other stage can claim** (inline: sugar declarations; each primitive stage: its own callee
symbol; mergesynth: `registerAugmentations`/`applyAugmentations` installs). A new stage must be
checked against this invariant before joining the set. In-pass order (documented in
`transformer-architecture.md`) is a reproducibility choice, never a correctness dependency — no
stage may require running before/after another within one pass. The di Go stage and its bespoke
chain-sugar recognizers (§113) are deleted: with the loop reaching inner chain positions and the
transitive-witness module-resolution fix (§119) making inline active for di-direct consumers, chain
sugars lower through inline bodies for both paths. _Owner ruling: "a few extra iterations doesn't
hurt anything. it's milliseconds."_

---

## §116 — There is no no-type-arg self-registration verb; every convenience verb takes an explicit-or-inferred `T`

`addClass<T>(ctor, signatures, scope?, key?)` / `addFactory<T>(factory, signatures, scope?, key?)` /
`addValue<T>(value, key?)` (`libraries/di.extras/src/augmentations/Manifest-service-augmentations.ts`)
each derive their address from the TYPE PARAMETER `T`, via `typefor<T>()` — not from the argument's
own runtime value, and not from a dedicated value-derivation primitive. `T` may be written explicitly
at the call site or left to ordinary TypeScript generic inference from the argument (`Ctor<any[], T>`,
`Func<any[], T>`, or `T` itself); either way, the sugar body substitutes `typefor<T>()` for the
address, the same primitive every other type-argument-driven sugar call uses (§137).

`tokenfor(value)` / `tokenof(value)` — the value-arg primitives that derive a STRING token from an
argument's own runtime type rather than a type parameter (`libraries/primitives.extras/src/tokenfor.ts`,
`.../tokenof.ts`) — still exist, but no current registration verb calls either of them; they are
general authoring primitives, not part of the registration dialect. Their retirement is tracked at
§146.

---

## §117 — No domain names in Go transform source; domain arrives as data

No primitive stage's Go source may compare a callee name against a hardcoded domain string
(`if calleeName == "addClass"`, `"@rhombus-std/options:IOptions"`, etc.). Domain knowledge reaches
the engine only as DATA carried by the checker or the artifacts hand-off: a side-parsed sugar
body's own text, a checker-resolved symbol/type, a structurally-detected brand shape (the
`Keyed`/`Inject`/`Hole`/`$N` token grammar stays engine-owned naming language, detected
structurally, not by name-matching a specific package's export). Two illustrative cases: the
`schemaof<T>()` primitive threads config's `OPTIONAL` marker identity through a generic
`valueimport.Ref` value, never a branch on "is this config's marker"; `mergesynth`'s per-member
merge-strategy guards are generated from the member's own parameter types via an in-process typia
call, with no family/augmentation identity named anywhere in the stage. This is why there is no
bespoke per-family Go stage left — a per-family stage would necessarily encode domain in Go
source. _Owner ruling: domain in TRANSFORM SOURCE is banned; domain in runtime memory (checker
state, artifacts) is fine._

---

## §118 — Transforms never validate user code; they only report their own lowering failures

No transform in the engine polices a user's design choices (there is no re-implementation of the
old domain stages' open-generic-registration completeness checks, formerly diagnostics
990008/990009/990010). Runtime already enforces the equivalent invariants at
registration/resolve time; duplicating that policing at compile time was never the transform
layer's job. The one thing a transform DOES still report is its own inability to lower a specific
call — an underivable token, a member `schemaof<T>()` has no `Type` spelling for — which is failure
reporting about the transform's own mechanism, not validation of the user's design. _Owner ruling: "it's not transform's job to validate. don't do it. leave runtime
as-is."_

---

## §119 — Stage SELECTION retired; one always-on primitive set

The two-layer selection model (a workspace dependency scan choosing which stage ids activate for
a given consumer, `ttsc.stages` package.json markers, `BaseBundles` preset expansion,
`selectStages`) is retired. Depending on any `*.extras` package's `./ttsc`
descriptor spawns the ONE host, which always runs its full stage table — there is no second
question of "which stages" left to answer. `*.extras` packages survive as sugar
homes (declarations + bodies + one spawn descriptor each); the inline stage's referenced-check
(witness → inert when a target module is genuinely absent from the consumer's program) survives
as the mechanism that makes an unrelated consumer's build a no-op, not stage selection. What a
dependency still governs is spawning + which inline BODIES are in play: the transitive-witness
module-resolution fix resolves a sugar target reached only transitively (e.g. a di-direct consumer
importing `@rhombus-std/di` but not `di.core`), so the inline path activates for exactly the
di-direct consumers whose bespoke Go stages were deleted.

---

## §120 — Mergesynth is a one-shot pre-pass, not a fixed-point loop member

`mergesynth` (the augmentation default-merge-strategy synthesizer, #213) runs once per file BEFORE
the fixed-point loop starts, not inside it. Rationale: its matches
(`registerAugmentations`/`applyAugmentations` installs) are always source-written — no sugar body
or primitive stage ever mints a fresh one — so the loop can never generate new work for it, and a
pre-pass placement makes the termination story trivially explainable without reasoning about
whether it could re-fire. A landed defect motivated this explicitly: an earlier loop-member
version re-wrapped its own hand-authored merge spreads every pass, because its strategy-name
detector had no case for a `KindSpreadAssignment` and so couldn't see inside the spread it had
just emitted. Rejoin condition (documented in code, not yet triggered): if a sugar body is ever
added that emits an install call, `mergesynth` must rejoin the loop and gain spread-recursing
detection.

---

## §121 — `*.transformer` → `*.extras` rename; transformables move out of the runtime `primitives` leaf

Every sugar-only authoring package (declare-module typings + inline bodies + one spawn descriptor,
no other toolchain artifact) is renamed `<family>.extras`. The landed set is total: all four
former `*.transformer` packages renamed — `primitives.transformer` → `primitives.extras`,
`di.transformer` → `di.extras`, `di.transformer.options` → `di.extras.options` (the direct
`transformer`→`extras` substitution, chosen as cleaner than `di.options.extras`), and
`config.transformer` → `config.extras`; none kept the `.transformer` name (the `.transformer`
qualifier is reserved for a package that carries a real toolchain artifact beyond the descriptor,
of which there are now none). Separately, the transformable authoring stubs (`tokenfor`/`tokenof`)
move OUT of the runtime `@rhombus-std/primitives` leaf into `primitives.extras`: the prior reason
for keeping them in the runtime leaf — "runtime source imports it directly" — dissolves once the
nameof stage's import elision leaves no reference in any shipped bundle (verified: zero
`tokenfor`/`tokenof`/`primitives.extras` references survive in any consuming lib's `dist/bundle`),
so every runtime library depends on the authoring package dev-scoped only. Brand TYPES
(`Keyed`/`Inject`/`Typeof`/`Hole`) stayed put — moving them is byte-parity-gated (token text
embeds home package specifiers) and was not required.

---

## §122 — Keyed addressing is the tag: a keyed request and its registration meet at one interned `TagType`

A keyed service's address is `Type.tag(type, key)` — an interned node, so the registering side
and the requesting side hold the `===` same address or they hold different types; there is no
derived-string keyed token and no composed-lookup primitive. The durable rule this entry
carries: keyed addressing must be backed by a runtime round-trip test (a keyed request actually
matching a keyed registration), because parity-style nets only prove two spellings agree — they
cannot prove the agreed spelling matches anything.

---

## §123 — Failure semantics unified: a token-shaped primitive never emits a silent empty result

Every token-deriving primitive follows one rule: an underivable derivation never falls through to
an empty string, `null`, or other silent placeholder. A SYNTHETIC (substituted) use that's still
underivable when its stage runs is left un-lowered with no diagnostic yet — because a dead ternary
branch's primitive call may still be pruned by the `fold` stage before anyone needs its value, and
erroring before that prune would fail builds that are actually fine — and the emit sweep is the
backstop that catches one that never got pruned or lowered. A SOURCE-WRITTEN use (a human wrote the
call directly) has no later rescue, so it emits a targeted diagnostic naming the problem
immediately. This retires the prior split behavior where different code paths independently chose
`""` vs `null` vs no diagnostic for the same underlying "can't derive this" condition.

---

## §124 — There is no separate open-registration classification step; `Type.isOpen` is the one predicate

`openEntry`, `ServiceManifestClass`, and the string-grammar registration-time classification this
entry described do not exist. The current engine draws no distinction between "registering" and
"matching" an open template: `Registry` (`libraries/di/src/internal/Registry.ts`) partitions every
registration once, by `Type.isOpen(registration.address)`, into a closed map (keyed by identity)
and an open list matched per request via `Type.match`. A registration mixing concrete args and
generic holes needs no special-casing, because `Type.match`'s unification is already fully
recursive over the whole tree — there is no separate all-holes rule to enforce or retire. §106
records the current matching mechanism; §141 records the `Type` taxonomy it walks.

---

## §125 — Overlapping open registrations are NOT ranked by specificity; the current registry resolves them by registration recency

`Registry#matching` (`libraries/di/src/internal/Registry.ts`) collects every open registration
whose address `Type.match`es the request, and orders every answer — closed and open together —
by `rank`, the registration's position in manifest iteration order (newest first, since
`Manifest#add` prepends). There is no specificity measure: two open registrations both matching one
request (`IRepo<User,%A>` and `IRepo<%A,%B>` against `IRepo<User,Foo>`) are resolved by which was
registered more recently, not by which binds fewer holes.

This is the exact hazard this entry's original ruling existed to close for the string-token engine —
a caller registering the specific template first and the general one second silently resolves
through the general one, a wrong instance rather than an error. No successor ranking has been built
for the current `Registry`; §106 records what the registry does instead.

---

## §126 — There is no `libraries/di.core`/`libraries/di` correctness sweep on record for the current engine

`materialise`, `#lookup`'s open/closed split, `keyedToken`/`unkeyedToken`, `OpenRegistration`,
`#collectionRegistrations`, and the dispose-guard mechanics this entry catalogued belonged to the
string-token engine and do not exist in the current `libraries/di`/`libraries/di.core`.

A keyed request and a keyed registration meet at one interned `Type.tag(base, key)` node (§122), so
the keyed-identity class of bug this entry catalogued — a verb naming the bare base where the
composed tag was meant — has no separate string-composition step left to get wrong.

The current engine (`Registry`, `Engine`, `PlannerVisitor` — §106, §111, §112) has no scope or
disposal model yet: `IServiceScope`/`IServiceScopeFactory` (`libraries/di.core/src/ServiceScope.ts`)
are declared, and `AsyncServiceScope` is explicitly a "scaffold: the async face of a scope, pending
the scope model." Use-after-dispose is not yet a question this engine can raise; a correctness
sweep against it belongs to whichever entry records the scope model once one lands.

---

## §127 — Open-template classification is spelling-independent by construction; there is no separate classifier left to disagree with the parser

`isOpenToken`, the raw-arg-slice fallback, `materialise`, and `openEntry` — the machinery this entry
fixed a whitespace/hole-spelling disagreement inside — do not exist. `Type.isOpen`
(`libraries/primitives/src/Type/analyzers.ts`) answers off the parsed `Type` tree, and `Type.from`
(the token grammar, `libraries/primitives/src/Type/internals/parser.ts`) is the ONE place a token
string becomes a `Type`, for every consumer — a registration, a request, or a signature parameter
alike. There is no second, shallower classifier that could disagree with the parser about
whitespace, hole spelling, or a keyed template's boundary, so the specific defect this entry closed
(`IRepo<IA, $1>` / `IRepo< $1 >` / `IRepo<$01>` reading CLOSED under a stale regex) has no
counterpart to reintroduce it.

`token/manifest.ts`, `TokenManifest`, `TokenProvider`, `Validator`, and `parseSlot`/`serialiseSlot`
— all audited here as vestigial or public-but-unconsumed — are gone along with the token-string
package they lived in.

§106 records the current matching mechanism; §129 records the current hole grammar.

---

## §128 — `ActivatorUtilities` is porting noise; the whole activation surface is removed

`ActivatorUtilities` (`createInstance` / `createFactory` / `getServiceOrCreateInstance`), its
`ObjectFactory` return type, and `ActivationError` are deleted outright.

They existed for exactly one reason: the reference exposes a static activator helper, and §56
ported it because the mirror said to. Nothing here ever called it — no library, no example, no
transform fixture — and its only exercise was `tests/di.test/test/activator.test.ts`, a test
written to cover the mirror rather than to pin a consumer's behaviour. That is what porting noise
looks like under the "faithfulness is a disposable starting discipline" rule: a reference shape
carried across with no job on this side.

It was not free to keep. Activation deliberately never enters the resolution engine, so it shipped
`slotResolvable`/`resolveSlot` — a di.core-local synchronous MIRROR of the engine's private
`#resolveSlot`, kept in step with it by hand. §126 caught that mirror after it had already drifted
(an unregistered factory target raised `FactoryTargetError` instead of falling through to the
caller-supplied arguments). Deleting the surface retires that standing obligation with it.

`ActivationError` goes too. `ActivatorUtilities` was its ONLY thrower — verified across the whole
repo, engine included — so no other failure mode loses the error it reports with.

**What §56 (v1) no longer describes.** §56 records three things landing together; the registration
`tryAdd*`/`replace*` verbs and `EmptyServiceProvider` are untouched and still current. Its
`ActivatorUtilities` bullet, and every deliberate divergence hanging off it — positional argument
matching in place of type-assignability, no constructor selection, no
`[ActivatorUtilitiesConstructor]` preferred-ctor marking, no keyed-parameter paths — are now
historical record only. They describe adaptations of something the repo does not contain. §56 stays
in the retiring v1 doc unedited; this entry is the correction.

The capability the reference reaches for the activator to get — construct something the container
does not own, with its dependencies filled in — is already served here by factory injection and
`resolveFactory(token, params?)`, neither of which needs reflection (`docs/libraries/di.md`,
divergence 7). Removing the helper removes a second, weaker way to do it, not a capability.

The surface was present in the published `@rhombus-std/di.core` alphas, which have no users; no
migration path or deprecation cycle is owed to anyone.

_Owner-directed 2026-07-24._

---

## §129 — A generic hole is `Type.generic(label)`, written `%<label>`; there is no numeric `$N` grammar

The `$1`…`$9` type aliases, `$N` as wire text, `HOLE_PATTERN`, and the two-implementation
disagreement this entry unified do not exist. A generic hole is its own `Type` node kind —
`GenericType = { kind: 'generic', label: string }` — minted by `Type.generic(label)`
(`libraries/primitives/src/Type/internals/factories.ts`) and written `%<label>` in the token
grammar (`libraries/primitives/src/Type/internals/parser.ts`'s `%` case), with an arbitrary string
label rather than a positional numeric index. `Type.from`/`Type.stringify` is the one grammar every
consumer parses and writes a hole through (§111); there is no second implementation of the hole
rule left to disagree with it, and so no `$0`/leading-zero edge case to resolve — a wire-spelled
hole either is one, by the one parser's rule, or the text after `%` names something else entirely.

§144 records the `placeholder` → `generic` rename this entry's successor landed under.

---

## §130 — A library references the abstractions package; only an entry point references the engine

The whole di error taxonomy is DECLARED in `@rhombus-std/di.core` and re-exported from
`@rhombus-std/di`. `UnsatisfiableError`, `CycleError`, `AmbiguousUnionError`, and
`ManifestValidationError` join the `DiError` root — `libraries/di.core/src/Errors.ts` declares all
five. `libraries/di/src/index.ts` re-exports them directly, with no separate `errors.ts` file of its
own, so every `from '@rhombus-std/di'` import naming one keeps working unchanged.

**The rule this enforces.** A library references the abstractions package; only an entry point
references the engine. It is repo-wide, not an examples-only convention. `examples.lib.*` are its
existence proof — they declare registrations against `Manifest` and take an `IServiceProvider`,
both importable from `@rhombus-std/di.core` alone, and neither
`examples.lib.with-transformer` nor `examples.lib.without-transformer` depends on `@rhombus-std/di`
at all, runtime or dev; the application packages that build a provider are the only things in
`examples/` that do.

**Why the split was a defect, not tidying.** The di.core / di boundary exists to make one claim: a
library can do everything a library needs with only a `di.core` reference. Classifying what a
caller's container threw at it — branching on the failure, adding context, re-raising, or degrading
gracefully — is ordinary library work. With the taxonomy split, a di.core-only library could branch
on the root `DiError` and nothing else, so it had to take a reference on the engine purely to READ
an error class. Nothing about that reference is used at runtime, which is exactly what makes it the
wrong dependency: the boundary was claiming an independence it did not actually deliver.

**Nothing moved gains an engine dependency.** Every leaf class imports only `Type` — di.core's own
type — and references no engine internal.

**Runtime identity holds (§9/§38).** These are `instanceof` classes, so there must be exactly one
copy. di keeps di.core external in its bundle (`scripts/build-lib.ts`'s external = deps ∪ peers
derivation), so `libraries/di/dist/bundle/index.js` declares none of the five classes and imports
all of them from `@rhombus-std/di.core`, whose own bundle declares each once — `core.X === engine.X`
for every one of them, and an error thrown by the engine satisfies `instanceof` against the class
imported from `di.core`.

**`logging` is an exception. The rule stands.** `logging` and `hosting` are the only libraries
carrying a RUNTIME `@rhombus-std/di` dependency. `di.core` ships `DefaultManifest`, the concrete
`Manifest` implementation; `di` installs `build()` onto every `Manifest` (an augmentation sealing it
into a `ServiceProvider`, `libraries/di/src/Manifest-ContainerBuilder-augmentations.ts`). `hosting`
is an entry point by job description, so it is not an exception at all. `logging` is:
`LoggerFactory.create` (`libraries/logging/src/LoggerFactory.ts`) does `new
DefaultManifest().addLogging(configure)`, then `.build()`, then resolves the factory out of the
provider — entry-point work by this entry's letter, inside a library.

It stays. The API is a legitimate convenience for a consumer who wants logging without composing a
container, and the returned `DisposingLoggerFactory`'s `[Symbol.dispose]` forwards to the provider
it built, so the intended shape is "the factory owns the scope it made." Whether that forward
actually disposes anything today rides on the still-unbuilt scope/dispose model:
`ServiceProvider.dispose()`/`disposeAsync()` (`libraries/di/src/ServiceProvider.ts`) are currently
`NotImplementedError` stubs, so calling `LoggerFactory.create`'s disposal path throws rather than
tearing anything down — a gap in the scope/dispose model generally, not a defect specific to
`logging`'s carve-out.

**The exception is `logging`, by name. The list is closed.** The paragraph above explains why
`logging` earned it; it is not a test anyone else may apply. No other library builds a container,
and a second exception requires a new decision here — not an argument that some new case resembles
this one. Stated deliberately as a name rather than as a shape: a shape ("a library may own a
container it creates itself…") reads as a general permission and invites each author to decide their
own case qualifies, which is how an invariant erodes without anyone ever choosing to weaken it.

_Owner-directed 2026-07-24 ("move the errors"), the rule stated in the owner's words, and the
`logging` carve-out ruled 2026-07-25 ("the rule stands, logging is an exception")._

## §131 — The emittable surface of a type is its public, string-keyed instance surface

Every member walk in the engine that produces an EMITTED artifact — the `mergesynth` guard
synthesizer and the `internal/schema` config-schema walk — enumerates the same thing: a type's
public, string-keyed instance surface. Public properties and get/set accessors are in it, and an
accessor is typed by the type IT declares. Three member shapes are outside it and never reach an
emitted artifact:

- an ECMAScript `#`-named field, which is not a string-keyed property at all — `Reflect.ownKeys` does
  not list it and `obj["#x"]` is `undefined`;
- a `private` / `protected` member, which a caller cannot supply;
- a SYMBOL-keyed member such as `[Symbol.iterator]`, which has no string key to emit either.

A COMPUTED name is not the third of those. `["a-b"]` and `[KEY]` where `const KEY = "k"` evaluate to
ordinary strings and name keys an element access reads, so they stay in the surface; only a name
whose TYPE is a symbol leaves it. Deciding on the syntactic node kind instead dropped every
string-computed member and reported it as one no string key can name.

`internal/typesurface` is the one enumerator both walks consume. Every test it makes is on the
member's DECLARATIONS — a private-identifier name, an accessibility modifier, a computed name, a
`get`/`set` node — never on the symbol's flags and never on the mangled internal property name the
checker gives such members. (The computed-name test reads the name expression's type to answer
"symbol or string", which is the one question the node alone cannot.) The flags are not equivalent:
a mapped type (`Partial<T>`, `{ [K in
keyof T]: T[K] }`) remints each member as a plain property symbol while KEEPING the original
declaration node, so the flags say "property" exactly where the declaration still says "accessor" —
and typia, which filters on the declaration, drops the member. Reading the flags therefore made
every accessor invisible behind any mapping, reopening the whole defect class one indirection away.

**The surface is DIRECTIONAL, and the two consumers face opposite ways.** A guard READS a member, so
a set-only accessor gives it nothing to check; a schema WRITES one, so a get-only accessor gives it
nowhere to put a value. `typesurface` therefore reports both directions per member
(`Member.Readable` / `Member.Writable`) and each consumer filters by the one it uses —
`Surface.Readable()` in `mergesynth`, `Surface.Writable()` in `internal/schema`. Filtering by the
wrong direction, or by neither, yields a member operation that can never succeed: a
`typeof input.x === "number"` clause on a set-only accessor is never true, and a schema key for a
get-only accessor names an assignment that throws.

**Why this was a correctness defect, not a tidiness one.** A guard clause keyed on a `#`-named field
reads `undefined === undefined` and can never be false. `MemoryCacheEntryOptions` has five such
members; its merge dispatcher validated all five vacuously while the public accessors that should
have been checked contributed no clause at all, so the guard accepted objects that were not
`MemoryCacheEntryOptions`. A schema keyed the same way describes fields no configuration source can
ever populate.

**Both consumers refuse on the SAME predicate, one per direction.** `Surface.NothingReadable()` and
`Surface.NothingWritable()` each say "this type DECLARES members, and none of them faces the way I
need". The schema walk raises the hard error `992003` on the writable one; `mergesynth` stops
emitting member clauses on the readable one. A type that declares nothing at all (`{}`, `object`) is
neither: there is nothing it fails to expose, so the empty result is correct rather than blind.

Sharing the enumerator is what keeps the two walks agreeing about a type's SURFACE; it does not by
itself keep them agreeing about anything else. Every other question both walks ask — above all "is
this a nominal built-in?" — has to be asked through one shared function too, or they drift. That is
not hypothetical: `mergesynth` once admitted a type to typia's fast path by comparing its symbol's
NAME against `"Set"` while `internal/schema` asked `typesurface.FromLibrary`, so a first-party
`interface Set` was a library type to one walk and a first-party shape to the other — and the walk
that answered by name handed it to a check that keyed on its `#`-named backing field.

**A guard may be WEAKER than its type, never NARROWER — and never weaker than what it replaces.**
Where `mergesynth` cannot decompose a position it costs that position its clause and nothing else.
Every clause beside it stands, the parameter's arity bounds stand (derivable from the signature
alone), and the runtime-KIND floor the type still implies stands. So an undecomposable parameter
still routes a wrong-KIND argument to whatever held the member name before, and one such member
never disarms the guard on its siblings. Each weakening is reported as a
`MERGESYNTH_PRIVATE_SURFACE` warning naming the position and saying what the emit contains —
never that a position is "unchecked" when a clause was in fact written for it.

**A floor may assert only what is true of EVERY value the declared type admits.** For an object type
that is `(typeof input === "object" || typeof input === "function") && input !== null`, and for an
array `Array.isArray(input)`. Two tighter-looking clauses are each false for values their own type
admits, and were emitted anyway: `typeof input === "object"` alone rejects a function, which
`Function` and every interface a property-carrying function satisfies admit; `!Array.isArray(input)`
rejects an array, which `ArrayLike<T>`, `Iterable<T>` and `object` admit. A clause that is false for
a genuine value does not weaken dispatch, it INVERTS it — the call the augmentation was written for
goes to whatever held the name before — so where no assertion holds of every inhabitant, the
position gets NO clause rather than a wrong one. The `object` keyword is the floor's own type: its
values are exactly the non-primitives, so that condition is not a floor under `object`, it is the
whole of it, and `object` reaches it from a bare parameter, a union arm, an array element and a rest
element alike. Falling through to no arm at all — which is what `object` used to do — let a number,
a string and `null` dispatch to the augmentation.

The one thing never emitted is a clause that cannot decide anything. A guard with NO clause at all is
dropped rather than written as `true`, and a floor is dropped in rest-parameter position, where
`Array.isArray(args.slice(0))` is true by construction. A member whose EVERY parameter is
un-derivable in the first place — no annotation, `any`/`unknown`, or a reference to the member's own
type parameters — still gets the bare always-pass strategy; that is a stated degradation, not a
weakening.

**The fast path is a WHITELIST, and that direction is the whole design.** `typiaFaithful` asks
"does typia render this — and every type reachable from it — the way a hand-written check would?"
and takes typia's is-programmer only on a positive yes at every position; its final branch is
`return false`. The inverse — enumerating the shapes typia gets WRONG — is what failed: its misses
are silently vacuous clauses that read exactly like correct ones, and every type position the walk
forgets defaults to emitting one. Independent review found several such positions (a mapped type's
value type, reachable through neither a property walk nor a type-argument walk; a symbol-keyed data
property; a wholly `private`-modifier surface, which typia filters correctly and so renders as a
constant `true`; an intersection of a primitive with an object, which typia drops rather than
renders, giving the mirror-image defect of a clause that can never be TRUE). A whitelist's misses
default instead to a composed guard or a loud weakening, both
honest. Each faithful branch carries its justification in terms of what typia emits for that
construct: a `typeof`/`===` leaf, a literal or enum comparison, a compiled template-literal pattern,
a nominal `instanceof` for a class typia knows natively, `instanceof` plus element checks for
`Map`/`Set`, positional checks for a tuple, `Object.keys` for an index signature, and a
self-referencing helper with its own cycle detection for a recursive type — which is why a cycle is
treated as faithful and settled by the type's finite positions.

**What is composed in-tree.** Everything the whitelist rejects and the composer can decompose:
unions disjunctively, intersections conjunctively, arrays element-wise, fixed-length tuples
positionally, string-keyed index signatures over `Object.values`, nominal built-ins by `instanceof`
(plus an entry-wise walk for `Map` and `Set`), callables and symbols as their `typeof` check (typia
emits a constant `true` for both), and objects and class instances
clause-per-public-readable-member. Two asymmetries are load-bearing. A UNION cannot drop an arm — a
value of an unchecked arm IS a value of the union, so a disjunction missing it would REJECT that
value — where every other composition can drop a position and stay sound. And an INTERSECTION
containing a primitive is decided by the primitive alone: in `string & { readonly __brand: "UserId"
}` the object half is phantom, a value of the type carries no `__brand` at runtime, and conjoining a
check for one rejects every genuine value.

**"Library type" means NOMINAL, not "declared elsewhere".** `typesurface.FromLibrary` reports only a
class or interface declared in a default library file — `Date`, `Map`, `Promise`, `Error`.
Membership in one is an identity, so per-member clauses say nothing about whether a value really is
one, and the composer answers with `instanceof` for the built-ins whose values cannot exist without
their constructor and the object floor for the rest. **That table's membership rule:** only a type
carrying internal state no object literal can hold — a `Map`'s entry table, a `Date`'s time value, a
`RegExp`'s pattern, an `ArrayBuffer`'s bytes — belongs in it. A structurally satisfiable interface
does not, however built-in it looks, because `instanceof` on one REJECTS values the type admits:
`ReadonlyMap` is satisfied by any object implementing it, and `Error`'s whole declared surface is
`name`, `message` and an optional `stack`, all plain strings, so `const e: Error = { name: "a",
message: "b" }` is a legal value that `instanceof Error` refuses. Both fall through to the floor.

**Nominal admission is by IDENTITY, never by name.** Every place the engine turns a type into a
built-in's name reads that name only after `typesurface.FromLibrary` has admitted the type, so a
first-party `interface Set` — which is named `"Set"` and is not the global `Set` — is composed over
its own public surface like any other first-party shape. Two things are deliberately NOT nominal. A
STRUCTURAL type is not, wherever declared: `Partial<T>`, `Readonly<T>`, `Pick<T, K>` and `Record<K,
V>` are mapped types whose declarations sit in `lib.es5.d.ts`, and `Partial<Opts>` is exactly as
checkable as `Opts`. Nor is a type from an installed package: a third-party `interface` is a shape
the same way a first-party one is, and counting `node_modules` as "library" disabled synthesis for
every non-primitive type an external consumer imports — invisible in-repo, where workspace packages
resolve to real paths.

**A consequence worth naming.** The checker's mangled internal name embeds a symbol id allocated in
checking order, so it drifted between builds. The whitelist is what makes that non-determinism
unobservable: typia enumerates members only for a type the whitelist admitted, and admission at
every position requires a surface with no `#`-named and no symbol-keyed member. The identity gate is
load-bearing to that guarantee rather than incidental to it — a name-string admission let a
first-party type with a `#`-named field onto the fast path, and a mangled key reached the emit for
it.

_Ruled 2026-07-25 while fixing the vacuous `setOptions` guard in `caching.core`; the whitelist
inversion followed from the review of that fix, and the declaration-over-flags rule, the
nominal-not-elsewhere reading of "library type", and the weaker-never-narrower contract from the
review after it. The identity-not-name gate on nominal admission, the honest-floor rule and the
evaluates-to test for a computed name came from the review after THAT — each one a place where two
walks answered the same question separately and drifted._

## §132 — An undeclared surface is worse than an unimplemented one

A public member whose semantics are undecided still gets DECLARED: the predicted signature over
existing types, a body that throws `NotImplementedError`, and nothing else. Runtime errors are an
honest state; compile errors are not — an absent member blocks every consumer, test, and lowering
that names it, and forces each of them to invent a workaround. The scaffold rule has three hard
edges: predict the correct form but never block on the prediction, create no new types without the
owner, and keep every scaffold additive. `NotImplementedError` itself lives in `primitives` and
extends plain `Error` — not-implemented is not a container concept, so it does not join the
`DiError` taxonomy.

_Owner-directed 2026-08-11 (the scope-surface scaffolds); the placement correction is his._

## §133 — Silence is the augmentation contract working; a drifted merge is it failing

A program that never loads a sugar augmentation gets its calls passed through untouched — that is
the DESIGNED behavior, not a defect, and diagnosing it as one wasted two hypotheses. The loud case
is different: an authored entry whose member matches nothing anywhere in the project is dead and
now diagnoses instead of skipping. The sharp lesson came from the app example: a sugar package
whose `declare module` merge had drifted from the surviving surface SHADOWED the receiver's real
exports and made it worse to use — removal was the fix. So the pending sugar-roster ruling decides
exclusions as much as inclusions: a merge that is not kept in step is worse than no merge.

_From the inline-suite diagnosis and the #306 dependency drop, 2026-08-11/12._

## §134 — The live parity suites are the oracle; the frozen goldens are retired

The di-direct goldens pinned the deleted engine's outputs in the deleted token vocabulary. At
retirement every entry was audited — the rebuilt factory tree's `Type.stringify` against the frozen
string — and the mismatches were all DESIGNED grammar changes (the `%`-sigil placeholder spelling,
the tag-composed keyed form), which is what made retirement correct rather than convenient: the old
strings are unreproducible by construction. Byte-parity now lives only in the running suites, whose
assertions pin verified emissions that must equal what a no-transformer author would hand-write.

_Audit 9 match / 3 designed-mismatch; retirement its own commit, 2026-08-12._

## §135 — The engine matches the owner's authoring shapes, not the other way round

Two matching-contract changes, both conforming the engine to the sealed sets' authored forms: a
receiver is not a value parameter however it is spelled (`this:` or receiver-first — both reduce to
value parameters only, and a leading receiver binds to the receiver), and a forwarding body whose
last parameter is a rest serves any declaration tail — with exact named-parameter matches always
beating a rest-match, so discrimination stays load-bearing where two bodies coexist. Parameter
NAMES remain the discriminator; a member-plus-arity scheme was considered and rejected because the
provider trio showed arity cannot discriminate.

_Cleared at supervision level against the owner's authored shapes, 2026-08-11; his override stands._

## §136 — Augmentation members are `this`-based functions, installed verbatim

**An augmentation set member IS the prototype member.** A set is a namespace of exported function
declarations whose receiver is a `this` parameter, and installation assigns the authored function
straight onto the receiver prototype:
`proto[name] = set[name]`, no forwarding thunk, no adapter. Function identity therefore holds
(`proto[name] === set[name]`), which makes two things meaningful that a wrapper made impossible:
re-installing the very same function is a detectable silent no-op (the double-install shape two
loads of one module used to produce), and an installed member can be recognized as its authored
source.

**The receiver is written, per member, as an explicit `this` parameter — never `ThisType<R>`.**
`AugmentationSet<R>` is `Record<string, (this: R, ...args: any[]) => unknown>`, the erased shape the
registry and the `registerAugmentations` sugar accept. An `& ThisType<R>` intersection reads better
and is ruled out for a checkable reason: an intersection strips the implicit index signature of the
`Record` type literal, and that index signature is exactly what lets a concrete set satisfy that
erased parameter. Writing `this` on each function is also what a namespace requires — a namespace
member has no contextual type to inherit one from.

**Merge dispatchers take two `this`-based members.** A `MergeStrategy` receives `original` and
`incoming` as ordinary methods and forwards both with `fn.call(this, ...args)`; the receiver-first
`incoming(this, ...)` convention is gone everywhere, including the mergesynth-synthesized
strategies (`extension.call(this, ...args)` / `original.call(this, ...args)`).

**Standalone calling is `.call`.** A set stays exported, and a member is reachable without
installation as `Set.member.call(receiver, ...args)` — an extracted method invoked on an explicit
receiver. The deliberately-standalone receiver-first free functions (`logTrace(logger, ...)`,
`beginScope(logger, ...)`) are unaffected: they are not set members.

**The engine speaks only `this`.** The inline stage's receiver-as-leading-parameter machinery is
deleted (`ResolvedBody.ReceiverParam`, the param split, the arg/param index offset); a member
body's value parameters align 1:1 with its call's arguments, and `this`-substitution respects
`this`-scope boundaries — it rewrites in the body and through nested arrows, never inside a nested
`function`, method, accessor, constructor, class, or static block. mergesynth derives guards and
arity bounds from the member's own parameters (`params[i]` guards `args[i]`), skipping only an
explicit type-only `this` parameter.

## §137 — The Type grammar is the only structural vocabulary; a primitive names, expands, or observes

**`schemaof<T>()` yields a `Type` tree.** There is no second vocabulary for describing a shape at
runtime. The config schema was the last holdout — kind-name strings (`"string"` / `"number"` /
`"boolean"`), plain nested objects, and an `OPTIONAL`-symbol wrapper — and it is gone, along with
`Schema`, `ObjectSchema`, `OptionalSchema`, `OPTIONAL` and `Infer`. A schema is now
`Type.object({...})` at every level, a global `string` / `number` / `boolean` at each leaf, and a
union with `undefined` for a member the configuration may leave out —
`Type.union(inner, Type.typeLiteral(undefined))`, the one spelling the union canonicalizer keeps
intact, since nothing subsumes a nullish member.

**Two verbs, one vocabulary.** A type-argument primitive does one of two things, and its name says
which: `typefor<T>()` NAMES a type (a named type yields its interned `NominalType` address) and,
given a runtime constructor or factory value in place of a type argument, OBSERVES it instead —
deriving the whole callable `Type` its construct or call signatures describe; `schemaof<T>()`
EXPANDS one (the members of the type it was handed). `tokenfor` / `tokenof` remain the string-token
pair pending their own held retirement. That is the whole transformable roster.

**Expansion stops at a name.** A member whose type has a name of its own keeps it, spelled exactly
as `typefor` would have spelled it. Only what has no name — an inline structure, a tuple — is opened
up in place. This is what the two verbs being distinct MEANS: the expansion adds the members of one
type and names everything inside it, so a self-referential type terminates by construction rather
than by a depth cap or a visited set. Its cost is real and accepted: a member naming an interface is
an address, so a coercion driven by that schema has no structure to descend into and says so.

**Structurally equal expansions are one node.** Two types that expand to the same tree intern to the
same `ObjectType`. That is correct, not a collision: a structural description is not an address, and
nothing downstream may read identity as provenance.

**The static image is stated, not inferred.** `Type.object` and `Type.global` erase their arguments'
literal types, so no type-level image can be recovered from a tree — `Infer<S>` was possible only
because the retired grammar was made of string literals. `withSchema<U>(schema: ObjectType)` takes
the shape as a type argument instead: the tree states the shape at runtime, the argument states the
same shape to the compiler, and a hand-writer names it once at the call site. The sugar is
unaffected — `withType<U>()` already carried `U` in its own signature.

**`signaturefor`, `signaturesfor` and `keyof` are retired.** All three had zero declarations and
zero call sites across `libraries/` — `keyof` not even a TypeScript stub to import, so the sugar
was unreachable from authored code by construction. They survived only as engine stages,
inline-stage support machinery, and authoring-lint entries. A primitive nothing authors is not a
capability, so they are deleted rather than kept warm: the stage table, the `knownPrimitives`
roster, and the lint's `PRIMITIVE_HOMES` all shrink to what authored code can reach.

**An aggregate spelling derives with only its element.** `Iterable` and `AsyncIterable` are declared
with two defaulted tail parameters, and a bare `Iterable<E>` reference resolves all three, so a
derivation must trim to the element. The global door mints an aggregate kind from a SINGLE argument;
a spelling that carried the defaulted tail would land as an ordinary global type that no aggregate
registration answers, and a derived address would name a different type than the hand-written
`Type.iterable(E)`.

_Owner-directed 2026-08-13._

## §138 — The inline marker grammar: three entry shapes, typed deserialization, loud on ambiguity

A `"rhombus-std".inline` marker entry deserializes into one of three shapes, partitioned by which
field carries a type and which carries a value — `type` names a TYPE, `impl` names a VALUE:

- **Instance member** — `{ type, member, impl? }`. `type` is the receiver type; `impl` is present
  exactly when the member's declaration is ambient (its body lives in the value's `member`-named
  property).
- **Static / namespace / const member** (one shape — the three are the same thing) — `{ impl,
  member }`, no `type`; the value is both the call-base anchor and the body holder.
- **Floater** — `{ impl }`; the function value's own source is the body.

Every declaration-reference field parses through the one Type grammar, strictly: a missing,
unqualified, or unparseable reference is a loud load-time error, never a permissive skip or a raw
string threaded past deserialization. `type` must deserialize to identifier-kind — a
signature-shaped type in that field is a loud error. `impl` is fully qualified and must
self-reference its declaring package (the side-parse boundary); violating that is a loud validation
error. An entry whose declaration already has a body takes no `impl` — the declaration's own source
is the body — and a substituted body's runtime imports come from the body file's own imports
(import-following), never from the entry. A grammar-valid shape with no certified matcher fails
loudly (an uncertified-kind diagnostic), never silently.

Matching stays certified only for the shapes already landed (§91: interface member and free
function). Static / namespace / const-member and class-member (shape-1-without-`impl`) matching are
grammar-valid but their matchers are not yet certified, and nested member paths (`A.B.fn`) are
describable by the grammar but deliberately unimplemented.

Go stays agnostic of the inlinable roster itself (U2, `decisions.user.md`; the general
source-agnostic principle is §117's) — nothing in the marker grammar introduces a name table, a
per-sugar list, or a special-cased identifier in engine code.

_Owner-directed 2026-08-12/13._

## §139 — Free identifiers in a sugar body are import-bound and bare-only; the unlowered sweep anchors on the declaring package

A free identifier inside a sugar body is legal exactly when the authoring file imports it — a
named, non-type-only binding from a bare package specifier — and the consumer receives that same
`(module, export)` pair, spelled as the consumer's own binding. An imported binding is BARE-ONLY: it
can never head a dotted call inside a body. This is closed permanently, not parked pending a future
extension.

The unlowered-sugar sweep — the diagnostic that catches a sugar call nothing certified matched —
anchors on the marker's DECLARING PACKAGE, never on spelling alone: a same-named export from a
different package is a different function and does not satisfy the sweep. Absence is designed
silence only at the PER-PROGRAM level — a program that never reaches a target module gets the
pass-through behavior §133 describes — but PROJECT-level inertness (every program in the project
failing to reach an authored marker) is a loud diagnostic, not a silent no-op.

Member-body substitution, `this`-rewriting across function boundaries, and 1:1 parameter alignment
with call-site arguments are already stated at §136 and unchanged by this entry.

_Owner-directed 2026-08-13._

## §140 — Contextual `this` typing has one exception; the augmentation inventory is discovered two ways

Two refinements on the `this`-based augmentation model settled at §79/§136:

- Every member of a set writes its receiver as an explicit `this:` parameter.
- The augmentation inventory — the roster a tool (a lint rule, a scan, mergesynth) needs to
  enumerate — is discovered from TWO sources, both counted as augmentations: `registerAugmentations`
  call sites, and any namespace a `declare module` block derives a receiver's members from
  (`extends Flatten<typeof Ns>`) with no accompanying register call.

_Owner-directed 2026-08-13._

## §141 — di2's Type taxonomy: one flat node space, address vs. spec as usage, not identity

di2's `Type` is one flat node space with one public parent — no registration union, no overlapping
door unions. `TypeIdentifier = NominalType | GenericType | TagType` names the ADDRESS-ONLY kinds:
a pure reference can never self-construct. `NominalType = GlobalType | ImportedType` is the pair a
name is reached by — the ambient scope, or an import from a package that the node carries as its
`from`.

Every `Type` can be an ADDRESS: interning makes any node registrable and resolvable by `===`, so a
`Registration` may link absolutely any `Type` to an implementation. Every NON-identifier `Type`
can also be a SPEC — it self-constructs when no registration answers a request for it. The
capability lives in the USAGE and the registry, never as a dual identity stamped on the node itself.

`TagType = { type: Exclude<Type, TagType>, tag: string }`; the inner `type` is any other kind (a
keyed function-typed service is spellable), but never a tag itself — a type wears at most one, and
the door refuses a second rather than re-keying silently. A tag is address-only regardless of its
inner type — keying is registration intent, so an unregistered keyed request fails rather than
constructs. `TypeLiteralType` is a self-supplying leaf; it names nothing.

Capability questions (`identifier`, `open`) are answered by MEMOIZED ANALYZERS: computed on first
ask per unique node by walking the node itself, cached in a `WeakMap` that lives INSIDE the
analyzer, single-consumer state whose only writer is the walk that derived the answer. Interned,
frozen identity makes the cache exact forever. No side-table describes a node without that
provenance guarantee, and nodes stay pure data — capability never becomes a member on the node
itself.

THE MATCH WALK COLLECTS ITS OWN PLACEHOLDERS: the walk visits every placeholder position anyway, and
the very next step — instantiation — needs exactly that collection, so the bindings ARE the
placeholder inventory and no pre-scan runs inside the match path. The memoized analyzers serve only
the genuine standalone gates: partitioning registrations closed-vs-open at the registry (closed
answers by `===` alone and never enters matching), the augmentation receiver door, and marker
validation. The intern table itself stays pure identity — it learns no type-theory questions, and no
mint-order invariant is load-bearing. Steady-state predicates are O(1); the closed/open partition is
VOCABULARY, never a dispatch axis.

`TokenType` and `ConstructableType` — the string-token era's node kinds — are deleted. Types are
interned; `===` is equality; `Type.from` runs only at data-input boundaries (external strings, the
`Type | string` public door) — internal code spells a `Type` via a factory or `typefor`, never
`Type.from`.

This `Type` taxonomy is the one node space `di`/`di.core`'s engine resolves over — §106 walks the
matching it enables, §142 the resolution walk that calls it — and there is no separate token model
anywhere in the engine to keep in step with it.

_Owner-directed 2026-08-13._

## §142 — di2's container door: one entrypoint, lookup-then-construct-on-miss, three memo layers

di2 exposes one resolution entrypoint, `getService(request: Type)`. Resolution is LOOKUP, THEN
CONSTRUCT ON MISS: the lookup answers for any `Type` at all; on a miss, a request that can
self-describe is constructed by composing looked-up leaves, and a pure reference on a miss fails.
Requesting an unregistered constructor is construct-on-miss of a `ConstructorType`: di2 instantiates it,
resolving its parameter types through the lookup — the injection signature must be DESCRIBED in the
request, since there is no runtime reflection.

THE CACHING MODEL IS THREE MEMO LAYERS, one per lifetime, and nothing else:

1. **Types** are memoized globally — interning, `===` identity, immortal.
2. **Plans** are memoized per provider, keyed on the interned request, dying with the provider —
   conditioned on a purity audit (plan construction is a pure function of the request node and the
   provider's fixed registration set, reading no runtime state). A failed construction is not cached;
   determinism makes rebuild-and-rethrow identical.
3. **Instances** are cached per scope, internally — `realize` interprets a plan's lifetime data
   against the asking scope, and scopes own their instance caches outright.

Every visitor serves the making of a `Type` or a plan, so those two memo layers absorb all
resolution-path caching; the standalone analyzers' memos (§141) serve build/registration-time gates
only. Plans hold no instances and scopes hold no plans — the layers meet only at `realize`.
Resolve-one and resolve-all share instance caches, so a scoped or singleton instance never
double-instantiates via the enumerable path.

Metadata never holds state: registrations and plans stay pure, and instances live only in scope-owned
caches keyed by the interned request. The scope model adopts nothing from prior art without its own
justification, case by case.

_Owner-directed 2026-08-13._

## §143 — di2's registration impl description composes one node; the address stands in the instance slot

A registration's impl description is one composed node, not a separate registration-time check: sugar
derives the exact impl type by transform (the way it derives signatures), and the explicit API is
unchanged — the registration verb composes the node internally from the provided signatures, with
the ADDRESS standing in the instance slot. That stand-in is honest: "a constructable producing the
addressed type" is the strongest guarantee the container ever holds for an explicit registration.
Plan construction consumes only the args and the door, so one plan-builder contract serves both
registered and construct-on-miss paths; it is built only when that unified plan-builder itself is
built, not before.

Sugar declarations enforce impl-produces-address at COMPILE TIME: `addClass<T>(ctor: Ctor<any[],
T>)`, `addValue<T>(value: T)` — the sealed declarations carry the constraint themselves. The
di.core/di.extras same-name double-merge fix rides with this, since the generic forms must be
reachable from consumer programs.

Non-behavioral dialect calls made under delegation stay minimal: `asValue`'s stage offers only
`taggedAs` and completion, and `withLifetime`/`taggedAs` commute.

_Owner-directed 2026-08-13._

## §144 — di2's registration dialect: no TypeBuilder, renamed nodes, object-parameter overloads, a generic hand-usable builder

di2 has no `TypeBuilder`, neither general-purpose nor as manifest stages. A node's name is spelled
out in full and its factory pairs with it: `GenericType` (kind `'generic'`, factory `generic`), and
the callables `FunctionType` / `ConstructorType` behind `func` / `ctor`. The multi-field factories —
`global`, `imported`, `ctor`, `func`, `tag` — gain OBJECT-PARAMETER overloads whose keys are the
node's own published fields (`{ name, from?, genericArgs? }`, and so on), one vocabulary labeled at
every nesting level with defaults skippable independently; positional forms remain for flat use, and
the homogeneous-list factories (`union` / `intersection` / `tuple`) stay positional-rest only.

Registration never requires the impl instance's own type: a provided constructor's instance
`NominalType` is data the container has no use for. The address is what consumers resolve by,
assignability is compile-time-enforced by the sugar constraints (§143), and the composed
described-constructable carries the address in its instance slot — users supply argument types
only.

The signature verbs are `withSignature` and `withSignatures` (the owner delegated the naming choice;
`using-` was the one odd prefix and dies with it): `withSignature(...paramTypes)` names one parameter
row, `withSignatures(...rows)` names several, and `withType(implementerType)` names the whole
composed node. A callable node carries its own parameter rows natively — `ConstructorType.args` /
`FunctionType.args` is a `TypeSignatures`, one row per call it answers to, a no-parameter callable
carrying one empty row (`[[]]`) — so an overloaded implementation is rows on the one node rather than
a separate node shape; exactly one of the three verbs is ever called per chain, since each spends the
same slot. Verb naming beyond this is case-by-case; prefix uniformity is not itself a goal, and
`taggedAs` — the one address-rewriting verb — stands, since it looks different because it is
different.

Every builder-carrying API also offers a positional overload taking everything at once: an
`implementerType` argument (one composed constructable/function node, its parameter rows already
inside it), never a bare row array — the row-array spelling lives only in the builder's
`withSignature`/`withSignatures`. A hand-composer of a positional `implementerType` puts the address
in the instance slot, the same documented convention as above; sugar derives the precise node.
Builders read as fluent English, and the positional twin is the terse complete form.

The builder form is HAND-USABLE: `add(type, configure)` takes the address as the first positional
argument and the builder lambda second. The sugar form `add<T>(configure)` is exactly that overload
with the first argument derived and deleted — a one-argument-forward inline body whose parity with
the hand-written form is trivially visible — so builder ergonomics are never transformer-exclusive.

THE BUILDER IS GENERIC: its stages carry the address `T`, and every impl door enforces
extension — `asClass(ctor: Ctor<any[], T>)`, `asFactory(fn: Func<any[], T>)`, `asValue(value: T)` —
the same constraint (§143) threaded through the builder path, not only the flat verbs. `T` defaults
to `any`: `add<T = any>(type, configure)`. Sugar derives `T` precisely; a hand-roller may spell it
(`add<IRepo>(…)`) for full enforcement, or omit it for `<any>` and no enforcement — opt-in safety,
consequences owned, no `Type`-surface change, no phantom.

The configure dialect offers `withType`, `withSignature` AND `withSignatures` after the `as`-verb,
EXACTLY ONE of which must be used — stage types make the completion state reachable only through one
of them, once, with a runtime guard backing the untyped caller. `withSignature(...paramTypes)`
supplies one parameter row and `withSignatures(...rows)` supplies several, each composing internally
with the address in the instance slot; `withType(node)` supplies the whole composed constructable,
typed per the `as`-verb (`ConstructorType` for `asClass`, `FunctionType` for `asFactory`) — sugar
substitutes `withType` with the transform-derived precise node, and a hand-writer reaches for
`withSignature`/`withSignatures`. Deep signatures remain irreducibly deep; the object-overload
factories and named intermediate consts are the spelling relief, not the dialect.

_Owner-directed 2026-08-13._

## §145 — di2's aggregates are first-class node kinds; normalization lives in the `global` door

Two aggregate factories mint their OWN node kind apiece: `Type.array` (`ArrayType`) and
`Type.iterable` (`IterableType`) — each a single-`element`-child node. The aggregate names join the
parser's one reserved-name mechanism beside `Func` / `Ctor` / `ServiceProvider`, and the engine
dispatches on kind. This dissolves the engine-side reserved-name list, the "a global name is
address-only except three names" asterisk, and the pairing-rule scoping clause that predated it —
fewer distinct mechanisms, more uniform arms.

Normalization lives in the `global` door, with no swap visitor: `global` given a reserved aggregate
spelling (`'Iterable'` / `'Array'`, one argument) silently returns the corresponding kind node — the same canonicalization contract `union` already
has. Every path that can spell an aggregate — the parser, derivation-emitted code, hand composition,
adoption — normalizes at mint, so the kind node is the ONE interned identity and a `GlobalType`
spelling of an aggregate can never exist. The signature principle is PERMISSIVE IN, EXPRESSIVE OUT:
as narrow as expressible per call — a literal reserved spelling types as its kind node, a
non-reserved literal as `GlobalType`, a dynamic string as the honest union, each as tight as TS can
prove. The object-parameter overloads (§144) narrow the same way via literal property inference.

An aggregate address's CONTRACT is the protocol alone — an `Iterable` / `Array` of every
registration of the element. Binding is a property of the SYNTHESIZED registration-miss fallback
only: the synthesized `array` materializes at resolution, and the synthesized `iterable` is
late-bound, each element resolving at iteration time. A
registration answering at lookup under an aggregate address binds however its own registration binds
— the engine imposes nothing on it. A registration under an aggregate address answers at lookup
before synthesis, uniformly, with no reserved-name carve-out in the door and no warning machinery:
shadowing an aggregate is legal, and the consequences belong to the registrant.

`getServices(type)` forwards to the iterable aggregate through the one resolution door and never
throws or returns `undefined` for zero matches — the empty aggregate is the answer.

_Owner-directed 2026-08-13._

## §146 — di2's `IOptions<T>` is one open registration, and the composed-generic derivation question dissolves with it

`IOptions<T>` is served by ONE open registration in di2 — `IOptions<$T>` with a
placeholder-parameterized impl, the same mechanism the open logger registration already uses. No
call site composes `IOptions<T>` as a spelled type: the sugar body registers the per-`T` pipeline
pieces under a bare `typefor<T>()`, the open registration's `realize` reads its bound placeholder,
and a consumer's closed request (`typefor<IOptions<UserOptions>>()` at a call site) matches the open
registration through the ordinary match walk.

The consequence is that the composed-generic derivation question dissolves for this case — no
engine grammar extension, no new derivation path is needed — and the `tokenfor`/`tokenof`/
`nameoftransform` trio retires once the `addOptions` body is rewritten to bare `typefor<T>()`.

_Owner-directed 2026-08-13._

## §147 — Singular death names its own retiring machinery

§94 states the ruling: sugar always asks the container, and there is no compile-time singularity
dispatch. Retiring that machinery by name: the `isSingular` / `singularValue` / `valueof` stubs,
the Go `singular` / `valueof` / fold stages, and the short-circuit e2e all retire. A literal-typed
request is served by the describe door, the same as any other request.

_Owner-directed 2026-08-13 (owner: "singular + the lookup thing are all dead")._

## §148 — A type is named by where it is reached from: `Type.imported` for a package, `Type.global` for the ambient scope

One factory named both, and a `from` of `'global'` was the sentinel that meant "no package at all".
The two readings split into two doors. `Type.imported(name, from, typeArgs?)` names a type an import
reaches and carries that specifier as its `from`; `Type.global(name, typeArgs?)` names one the
ambient scope already declares and carries no `from` member, because there is nothing for it to
hold. Their nodes are `ImportedType` (kind `'imported'`) and `GlobalType` (kind `'global'`), and
`NominalType` unions them for the call sites that take either.

The doors are strict about the boundary they draw. Handing `Type.imported` a `from` of `'global'`
throws rather than quietly re-routing to the other door: the ambient scope is not a package, and a
caller who spells it that way has the wrong door, not a normalizable argument.

The factory is `imported` rather than `import` for one reason: `import` is a reserved word, so no
namespace can export a member named for it. `Type` is a namespace — every factory a declaration
carrying its own documentation — and the verb bends to keep it one.

The wire format does not move. A global name is spelled bare and an imported one `from:name`, so
every token, every derived address and every parity fixture reads byte-for-byte as before; the split
changes what the TypeScript surface and the node shape say, not what a token says. The token grammar
still accepts an explicit `global:` qualifier, which the reader hands to the global door, so a token
round-trips to the node it always did.

_Owner-directed 2026-08-13._

## §149 — Node names are spelled out; a factory pairs with its node's name

A node's type name is written in full: `FunctionType` and `ConstructorType`, never an abbreviation.
A factory pairs with the node it mints — `global` with `GlobalType`, `imported` with `ImportedType`,
`tag` with `TagType` — and its object door takes a literal shaped like that node's own fields, so
`Type.imported`'s object door takes an `ImportedType`-shaped literal.

The pairing bends only where the full word cannot be a member name. `Type.func` and `Type.ctor` keep
their short spellings for that reason and no other, and their kind strings stay `'func'` and
`'ctor'` to match the factories a reader calls. Nothing about being callable makes a factory short;
the two that are short are the two whose full words are unavailable.

_Owner-directed 2026-08-13._

## §150 — A type wears at most one tag

`TagType.type` is `Exclude<Type, TagType>` and so is the base parameter of `Type.tag`, so the type
system refuses a tag over a tag wherever the base is statically known. The interning path refuses
the rest: a tagged base arriving as a value throws, naming the type that already carries a tag, and
the token reader reports a second `#` as a parse error rather than building a node no factory would.

Re-keying is the alternative this rules out. A keyed registration composes its key into the type, so
silently replacing or nesting a key would file the registration at an address neither the
registering side nor the requesting side named, and the miss would surface far from its cause.

One consequence reaches the registration verbs: a verb taking an optional key derives the address it
files under through a single door, which is where the refusal lives — the check and its message
exist once rather than beside every verb.

_Owner-directed 2026-08-13._

## §151 — Delivery is not a node kind: `Type.async` and the `asyncIterable` kind are cancelled

Handing a value over later is a property of the plan node, not of the type being named. "A `T`
delivered later" is `Promise<T>` — the ordinary global generic that a `Promise<T>` reference already
derives to — so `Type.async` and the `Async<E>` wire spelling are gone with nothing replacing them.

`AsyncIterable<E>` factors the same way: an async sequence is a plan node's iteration protocol over a
collection, and `AsyncIterable` is a real TypeScript name that spells as an ordinary global generic.
Its dedicated aggregate kind is gone too, and with no kind left to produce one, the engine's
async-iterable plan node and its realization go with it.

`Type.iterable` and `Type.array` are the aggregates that remain, and they are the only addresses
carrying collection-resolution semantics. What survives untouched on the derivation side: an
`AsyncIterable<E>` reference derives exactly as it did, emitting the ordinary global generic and the
same token, and the arity trim that keeps a lib-declared `AsyncIterable`'s defaulted tail parameters
out of a derived address stays — that is derivation hygiene, not a kind.

_Owner-directed 2026-08-13._

## §152 — A callable signature's holes live in its own tree, not a separate list

`FunctionType` and `ConstructorType` carry no quantifier list of their own. An open signature is
spelled by an ordinary generic hole sitting inside its `args`/`return`/`instance` —
`() => app:Box<%T>` is already open, the same tree shape a closed `() => app:Box<app:String>` is a
concrete instance of. Closing one against a request is tree-position unification against the holes
themselves, the mechanism every other node already uses (§180); a signature needs nothing extra to
participate.

The token grammar carries no quantifier prefix: a signature spells exactly its `args`/return/instance
shape, holes and all, reachable through the arrow, `new`, and reserved `Func`/`Ctor` spellings alike.

_Owner-directed 2026-08-13, Claude-corrected 2026-08-14._

## §153 — `ServiceProviderOptions` stays immutable; `useDefaultServiceProvider` takes a returning delegate

`ServiceProviderOptions` declares every property `readonly` — the container's build-time options are
a value, not a bag a caller reaches into. `IHostBuilder.useDefaultServiceProvider`'s configure
delegate matches that shape instead of fighting it: it receives `ServiceProviderOptions.defaults` and
RETURNS the `ServiceProviderOptions` that `build()` threads into `ServiceManifest.build(options)` —
the same returning-delegate shape `configureServices` already uses for the manifest. A caller composes
the result with a spread (`(options) => ({ ...options, validateScopes: true })`); each
`useDefaultServiceProvider` call replaces whatever an earlier `configureDefaults` or
`useDefaultServiceProvider` set, so the last call wins.

_Owner-directed 2026-08-13._

## §154 — The config schema coercer covers literal-union members

A schema member typed as a union of literal values coerces like any other leaf: a string member
matches the raw configuration value by equality, a number/boolean/bigint member by parsing (via the
same `parseNumber`/`parseBoolean`/`parseBigInt` the scalar leaves use) then equality. A miss reports
the same path-naming `SchemaCoercionError` issue every other leaf uses, naming every value the union
allows. Wider coercer growth — arrays, tuples, library globals beyond the four scalar leaves — stays
undecided.

_Owner-directed 2026-08-13._

## §155 — The manifest verbs' long overload is Type-only; naked signature arrays survive only in the builder

Every manifest verb whose long overload takes a dependency-signature argument takes the composed
implementation type directly — `ConstructorType` for `addClass`/`tryAddClass`/`replaceClass`,
`FunctionType` for `addFactory`/`tryAddFactory`/`replaceFactory`, `ConstructorType | undefined` for
`addHostedService`'s ctor overload. `add`/`tryAdd` already took `implementerType` this way — the
array-taking verbs were the residue. Each verb stores the node it is handed, verbatim, as `implementerType`
(`libraries/di.core/src/Registration/Registration.ts`) — there is no derivation step and no
separate stored-signatures member; a reader wanting a registration's parameter rows reads
`implementerType.args` directly (§170).

The builder chain (`withSignature(...paramTypes)`, `withSignatures(...rows)`,
`libraries/di.core/src/builder.ts`) is the ONE place a naked array of `Type | string` stays
first-class, as an authoring convenience — it mints the anonymous callable those rows describe,
filed under the type being registered (`PendingRegistration.#constructorType`/`#functionType`), and
that minted node becomes the stored `implementerType` exactly like a hand-supplied one.

**Convention, not enforcement**: the composed type's own instance/return slot carries the SERVICE
address (the same type the verb's first argument names), never the implementation's own concrete
type — the container reads nothing from that slot, so this is a spelling convention every call site
in this repo now follows, not a checked invariant.

`typefor<T>()`'s value-argument overload derives a registration's whole implementation type
directly from the class or factory value being registered — `typefor<typeof Widget>()` is how an
author spells `addClass`'s third argument by hand, deriving through the same shared layer every
value-observing call reuses (§171). There is no separate primitive and no retired `[[...]]` array
form left to migrate.

_Claude-directed 2026-08-13, executing the owner's §144 ruling._

## §156 — typefor emits through a project-wide const table, by default

A `typefor<T>()` call site emits a reference to a named const rather than the `Type.*` factory tree
it derives; the consts live together in one generated module the build materializes at the emit
root. `"rhombus-std": { "typefor": { "emit": "hoisted" | "inline" } }` picks the form, defaulting to
`hoisted`. The mode rides the PROJECT because the shared `./ttsc` descriptor is what every consumer
dedupes to one spawn and one cache key — nothing that varies per consumer can live there. It is read
through `ResolveConfig`, the one entry point every rhombus-std config reader shares, so a project may
declare it in the package.json marker or in any file that marker `extends` — including the
`rhombus-std.json` a markerless package.json reaches by default.

The table is a DAG: a node interns under its canonical token spelling, children intern before
parents, and a composite const references its member consts by name, so no subtree is spelled twice
and the number of consts equals the number of distinct derived types. A const's name is `$` plus
that spelling with every non-alphanumeric character replaced by `_`, trimmed to its last 40
characters, plus a short hash of the full spelling for any spelling that was not already entirely
alphanumeric — a pure function of the spelling, so naming is stable across builds and independent of
which file reached a type first.

Parity is exact and checked: expanding every const back into its call sites reproduces the inline
emission byte for byte (`tests/typefor.ttsc.e2e`). The runtime already interns structurally
identical types to one object, so the choice moves where a tree is written and never what it
evaluates to.

The generated module is build output. It lands in the program's `outDir`, which for every
lowering-enabled package is the per-file stage directory the plugin-free bundle pass consumes — so
the two `examples/*.with-transformer` builds now stage before they bundle, like every library.

_Owner-directed 2026-08-13 (owner: hoisted is the default; zero redundancy in DAG form,
deterministic collision-free naming, build output rather than committed source)._

## §157 — A bare-hole signature slot delivers the closing type; an instance of it is inexpressible

In an open registration, a signature slot that IS a generic-hole node receives the BOUND CLOSING
TYPE NODE. It is never an instance of that type and never a registration lookup: an implementation
whose type parameter erased at runtime has nothing else to work from, which is what lets `Logger<T>`
name its category and `LoggerProviderConfig<T>` find its section.

A hole standing INSIDE a larger slot keeps the ordinary reading — the slot is a type expression, the
hole closes into it, and the closed expression names a service the engine resolves. So one signature
can carry both readings, `[[%T, Holder<%T>]]` delivering the type for the first slot and a `Holder`
instance for the second.

The hole spells as `Type.generic(label)`, and it reaches a signature either written there directly
or derived from the implementation type — `Type.ctor(ILogger<%T>, [[ILoggerFactory, %T]])` yields a
signature whose second slot is the bare hole — so the two surfaces agree on what a slot means.

An instance of the BARE closing type is therefore deliberately inexpressible. The escape is to ask
for `IServiceProvider` beside the delivered type and look the instance up with it. No new `Type`
kind carries the distinction: the slot's own shape is the whole of it, read before substitution.

That ordering is what the engine's shape follows from. The registry hands the lowering the
registration as authored plus the bindings its match captured, rather than a registration already
substituted — substituting first closes a bare hole into an ordinary type and erases the very
distinction the rule turns on.

_Owner-directed 2026-08-13._

## §158 — A plan belongs to the manifest it was built from; a chosen answer that fails, fails the resolution

Plans are cached against the manifest. A resolution carrying additional registrations — a latebound
call's arguments, entering as registrations for that walk alone — is resolving a DIFFERENT,
ephemeral composed manifest: it never reuses a manifest-only cached plan, and its own plan never
enters the shared cache. The additionals are the most recent registrations in that composed
manifest, so they win the addresses they answer.

Union member choice follows the same boundary. It is decided per-manifest, against the full
registration universe of the resolving call, so a call argument supplying a second member makes a
union ambiguous that the manifest alone settles cleanly.

Choice is settled at plan time and never revisited: once a member is chosen, its RUNTIME failure
fails the whole resolution. There is no fallthrough to another member — a union's self-supplying
literal is the fallback for an ABSENT service, not for a broken one.

_Owner-directed 2026-08-13._

## §159 — The inline matcher anchors on the marker-named declaration, not the checker's binding

A `rhombus-std` marker `inline` entry names a declaration site: package, exported type, member. That
triple is the anchor for both call-site matching and the emit sweep.

Resolving an entry walks the marker's SURFACE — the named type and every type it transitively
extends — and asks each for its own member of that name. It never asks the named type for its
PROPERTY of that name: a property lookup answers with one declaration set, and an interface reaching
two same-named members through two `extends` clauses keeps one and hides the other, so the sugar
declaration a marker names can be entirely invisible to it. A marker naming a member that exists
nowhere on the surface is a load-time error, never a skip.

Call-site matching is two-armed. The checker's binding is consulted first, because it alone says
WHICH overload of a member the author reached. When the bound declaration falls outside every
marker's mapped set — the shape a hidden same-named sibling produces, and the shape a call that
binds to nothing produces — the marker decides instead: the callee name is the entry's member, the
call's shape is one the entry's sugar body accepts, and the RECEIVER carries the marker's named
type. The last two are what keep anchoring by marker from degrading into matching by name.

The emit sweep anchors on the same triple. Its member table holds every marker member whose surface
this program carries, not the subset that resolved to something inlineable — an entry whose sugar
declarations are absent is precisely the case where nothing can lower, so every call to it is
residue, and keying the table off what resolved is what made that case silent.

Resolving one entry is three-way: ABSENT (the marker's package is not in this program — the entry
contributes nothing, not even to the sweep), ACTIVE (a declaration the body serves), UNMATCHED (the
surface is present and declares the member, but no declaration matches the body's shape — nothing
inlines, the shape still reaches the sweep).

## §160 — One open `IOptions<$T>` registration serves every options type; its base slot is the offer

`IOptions<T>` is registered ONCE, open, and answers every closed request. There is no composed
second address and no per-type `IOptions` registration: `addOptions` names the BARE `T`, and every
pipeline slot — configure, post-configure, validate, change-token source — keys off that same bare
`T`.

The registration's signature carries both readings §157 allows:

```ts
const hole = Type.generic('$T');
const openOptions = Type.imported('IOptions', '@rhombus-std/options', [hole]);
Type.func(openOptions, typefor<IServiceProvider>(), hole, baseFactoryType(hole));
```

The bare `hole` slot delivers the CLOSING TYPE NODE, so the implementation learns which `T` closed
it and derives that type's pipeline slots. That is what makes reload work from one registration: the
change-token sources it finds are the ones registered for the closing type, so `Options.watch`
re-runs the pipeline for the right `T` on every fire.

`baseFactoryType(hole)` is a hole standing INSIDE a larger slot, so it closes into
`baseFactoryType(T)` and resolves as an ordinary dependency. That slot is the OFFER: `addOptions` is
what registers it, so a `T` nobody called `addOptions` for leaves the open registration unlowerable
and `getService(IOptions<T>)` answers `undefined`. One registration therefore serves every options
type without answering for types it was never given.

The two `addOptions` forms differ only in what fills that slot. A base factory registers as itself;
the wrap form registers a factory over `T`, so the base is whatever `T` resolves to. Both then run
the same assembly, which is why a wrapped and an assembled value are the same kind of thing
downstream.

`validateOnStart` is the one slot that cannot key on the bare `T`: `StartupValidator` resolves each
target and reads `.value` off it, so the flat target list holds the resolvable `IOptions<T>` address.
It is composed inside the verb, never at a call site.

_Claude-directed 2026-08-13, executing the owner's standing options ruling._

## §161 — `tokenfor`/`tokenof` leave the authoring surface

The two token primitives are gone from `primitives.extras`. Their last call site was the
`addOptions<T>()` sugar body, which composed `IOptions<T>`; once one open registration serves the
family §160 the sugar derives only its own bare `T`, and `typefor` plus the `Type` factories cover
every derivation the libraries make. Nothing in `libraries/`, `examples/` or any unit test names
either primitive.

The Go `nameof` stage that lowers them is NOT retired with them, because it still has live
consumers of its own: `tests/primitives.extras.ttsc.e2e` pins its lowering byte-parity across ten
type shapes, and `tests/declare-by-depending.ttsc.e2e` uses a `tokenfor` call as the observable
proving whether a host spawned at all. Both declare the primitive locally rather than importing it,
so both stayed green through the removal — the stage is reachable only from those fixtures now.

Retiring the stage is therefore a separate pass, and a larger one than a call-site sweep: it means
rehoming the declare-by-depending probe onto `typefor` (whose emit is a `Type.*` call tree, not a
flat string, so the fixture needs a `Type` import and different assertions), deciding whether the
byte-parity suite moves to `typefor` or goes, and only then deleting the stage and the
composed-generic machinery that exists solely to feed it.

## §162 — A CLOSED augmentation set's `satisfies AugmentationSet<Receiver>` const is inert without its own `applyAugmentations` call

`satisfies AugmentationSet<Receiver>` only shapes the object literal; it installs nothing. The
`declare module` block only merges the type onto the receiver's interface; it installs nothing
either. For a CLOSED receiver, the const's members reach the prototype exclusively through an
explicit `applyAugmentations(ConcreteClass, TheConst)` call in the same file — omit it and every
member type-checks, the barrel re-export still evaluates the module, and the method throws
"is not a function" at the first call site, since nothing ever ran `Object.assign` (or equivalent)
onto the class prototype. A file that only exports the const and never calls `applyAugmentations`
looks complete on read-through — the missing line has no compile-time signal.

_Claude-directed 2026-08-13._

## §163 — The derivation layer is shared vocabulary, not owned by any one primitive

`typefor`'s value-argument overload (`typefor(ctor)` / `typefor(factory)`) derives a
`Type.ctor(...)` / `Type.func(...)` node from a runtime constructor or factory's own construct or
call signatures — the instance/return type followed by each parameter's own type, one row per
signature the declaration carries. The classification and emission that derivation runs on are
their own shared layer, not folded into `typefortransform`: `tokens.DeriveTyped` (classification)
and `typeemit.EmitDerived` (emission) live under `transforms/internal/tokens` and
`transforms/internal/typeemit`, over the same Func/Ctor/Tag layer that sits above `DeriveTypeF`'s
named/literal/placeholder tree. `typefortransform` keeps only its own accessor-folding peephole
(`.return`/`.args`/etc.), built on the shared functions rather than owning the classification
itself.

The old array/slot machinery this replaced — `Signal`/`tokenSlot`/`factorySlot`/`unionSlot`/
`literalSlot`/`typeArgSlot` and their per-parameter classification — has no equivalent in the
current engine: every one of those forms is now just an ordinary `Type` node, resolved generically
wherever a `Type` is resolved, rather than pre-digested into a flat runtime shape a bespoke consumer
had to know how to read.

_Claude-directed 2026-08-13, executing the owner's §155/§157 direction._

## §164 — A dependency's type may be a general union or a nullish singleton, not only a named type

`tokens.DeriveTyped` derives a general (non-pure-literal) union into `Type.union(...)` over each
member's own derivation, and the bare `undefined`/`null` singletons into their own
`Type.typeLiteral(...)` leaves — extending derivation past `DeriveTypeF`'s literal-union-only
special case, which existed for the RETIRED flat-token renderer's needs, not this engine's. An
optional parameter (`dep?: T`, carrying the implicit `T | undefined`) is the ordinary case this
unlocks; without it, an optional constructor dependency — common, not an edge case — had no
derivable shape at all.

Members render non-nullish first, the nullish singleton(s) last, regardless of the checker's own
member order — the convention every other optional-value spelling in this engine already follows.
A `true`/`false` literal PAIR inside a larger union collapses back to the single wide `boolean`
member they stand for (the checker flattens `boolean` into its two literals when it sits inside a
union); a lone boolean literal elsewhere is unaffected.

A REST parameter (`...deps: [A, B]`) is deliberately NOT covered: its own type is the tuple/array
itself, and `DeriveTyped` has no tuple-expansion case — a rest-parameter constructor reports
`codeUnderivableToken` rather than misrepresent the signature's arity. This is a pre-existing gap in
`typefor`'s own value-argument derivation, not something this classification introduced; closing it
is a separate, larger derivation-engine question.

_Claude-directed 2026-08-13, executing the owner's §155/§157 direction._

## §165 — A factory-typed dependency is a plain `FunctionType` argument; no special injected-callable slot

A constructor parameter whose type is a plain function type (`(dep: IDep) => IThing`) derives as an
ordinary nested `Type.func(returns, ...argTypes)` node — the SAME derivation any function-typed
value gets, nothing signature-position-specific. The landed resolution engine (`PlannerVisitor`,
`libraries/di/src/internal/Plan/`) already handles this generically as a synthesis fallback:
`visitFunc` builds a `LateBoundPlan` whose invocation re-enters the engine to resolve the
function type's OWN return type, with the call's own arguments registered as value registrations for
the function type's OWN parameter types (`RealizeVisitor.visitLateBound`) — address-keyed, not
positional. This is a real, tested mechanism (`tests/di.test/test/plan-cache.test.ts`,
`open-registration.test.ts`), landed independently of this primitive.

The retired token-string engine's `factorySlotFor`/`factorySlotForType` special-casing — reading
INTO a declared inline function type's own parameters to synthesize a `{ type, params }` slot
threading a produced concrete class's "caller-supplied holes" — has no equivalent need under the
new engine: resolution is address-keyed against the whole manifest, not positionally threaded
through a fixed pipeline, so there is no longer a "declared arity must cover N holes and no more"
constraint to validate. The §4.5 factory-signature-mismatch diagnostic that checked exactly that
constraint (`codeFactorySignatureMismatch`, 990003) is retired alongside the slot form it validated
— it checked a shape that no longer exists, not a shape that still needs checking.

_Claude-directed 2026-08-13, executing the owner's §155/§157 direction; the resolution-model
reasoning traces to the landed engine, not a fresh ruling._

## §166 — A factory value's OWN directly-holed parameter is a known derivation gap, not a crash risk

`typefor(factory)` where `factory`'s own parameter directly names an open-template hole
(`(store: IStore<$<'1'>>) => ...`, the hole written straight into the parameter's annotation rather
than arriving through a class's own generic instantiation) fails to derive: the checker resolves
that parameter's type differently for an arrow-function-literal parameter than for an
otherwise-identical constructor parameter of a class, and `tokens.DeriveTyped` reports it
underivable rather than guess at a node. The call is left un-lowered with a `codeUnderivableToken`
diagnostic — the same safe degradation every other underivable shape gets, never a malformed
partial tree and never a crash.

This is narrow: a factory registered under an OPEN service token is a class-only-registration error
on the (retired) di-direct path, so a hole surfacing through a factory's own parameter was already
documented as reachable only via a standalone `typefor` call, never through an actual open
registration. Closing it is future work, not blocking — the ctor path (a hole arriving via a class's
own generic instantiation, `Repo<$<'1'>>`) derives correctly today.

_Claude-directed 2026-08-13, executing the owner's §155/§157 direction._

## §167 — Value-driven `getService`: hand it a `ConstructorType`/`FunctionType` node and the value it describes

Two overloads on `getService` take the node the value's own signature would derive to, alongside
the value itself: `getService<R>(type: ConstructorType, ctor: Ctor<any[], R>): R` and
`getService<R>(type: FunctionType, func: Func<any[], R>): R`. `R` is inferred from the value's own
signature. Neither registers anything; every call builds fresh, so two calls for the same value
never share a result even when that value is separately registered elsewhere.

**The node's kind dictates construction versus a call — there is no runtime discriminant.** A
`ConstructorType` node constructs; a `FunctionType` node calls. This retires the layered
class-syntax/prototype-descriptor sniff, the call-then-rescue retry, and the `RESOLVER_TYPE`
dependency shim an earlier draft of this door carried — the node already says which one applies
and already carries the real parameter types, so there is nothing left to sniff or rescue.

**Dependencies resolve from the node's own parameter rows, not a fixed one-entry signature.** The
node and value are wrapped in a throwaway `Registration` (`ctor` or `factory`, matching the
node's kind) carrying the node itself as its `implementerType` — the SAME reading `addClass`/
`addFactory`'s long overload already gives a composed impl type (§155) — resolved via the engine's
`additionalServices` channel against a manifest composed for that one call, under the node itself
as its own address, and discarded after. This is real dependency resolution, not reflection: the
node's parameter types are what the caller wrote (or derived) them to be, never inspected from the
value at runtime.

**The two overloads are declared directly on `IServiceProvider` (`@rhombus-std/di.core`)**,
alongside its base `getService(type: Type): any` member — one interface, three signatures, one
ordinary TypeScript overload merge, so an interface-typed caller sees all three exactly like a
concrete-`ServiceProvider`-typed one does. `libraries/di/src/ServiceProvider.ts` repeats the same
signatures on the class itself for the implementation (matching how it already widens the base
form to accept a token string too), but nothing there merges them onto the interface — that
already happened where they're declared.

**Reaching that declaration home required a real fix in the Go inline transform, not a workaround.**
A first attempt at the direct-on-`IServiceProvider` shape broke di.extras' pre-existing, unrelated
zero-argument `getService<T>()` sugar outright — any build pulling in di.extras failed with
`INLINE_DISCRIMINATOR_MISMATCH`, reproduced with di.extras completely unmodified. The actual cause
(`transforms/internal/inlinetransform/resolve.go`'s `anyDeclarationTakes`) had nothing to do with
declaration merging: it decides whether a sugar overload's declaration is merely absent from a
program (silent) or present-but-mismatched (a hard authoring-fault error) by comparing ONLY
type-parameter count between the sugar body and every declaration reachable from the marker's
surface. `getService<R>(type: ConstructorType, ctor: Ctor<any[], R>): R` carries one type parameter
— the same count as di.extras' own `getService<T>(): T | undefined` — so once `IServiceProvider`
carried it, the check saw "a declaration with the sugar's type-parameter count exists" and
concluded the sugar itself must be present and merely misspelled, even in a program where
di.extras' own declaration was never loaded at all. The fix compares value-parameter count
alongside type-parameter count: an unrelated overload essentially never shares BOTH by accident,
where sharing only type-parameter count is common (a lone generic parameter is the ordinary shape
for a sugar overload and an explicit-node one alike). A Go regression test
(`TestResolveMemberUnmatchedDespiteArityCollidingOverload`, `resolve_test.go`) pins the shape red
before the fix, green after.

**The authoring sugar this door was meant to pair with is held.** Nothing in this entry describes
that door; it ships separately.

_Owner-directed 2026-08-13._

## §168 — Callable nodes carry their overloads as parameter rows

`ConstructorType.args` and `FunctionType.args` (`libraries/primitives/src/Type/Type.ts`) are typed
`TypeSignatures = ReadonlyArray<readonly Type[]>` — one ROW per overload, each row that overload's
parameter types in declaration order. A callable that is not overloaded carries exactly one row;
one taking no parameters carries one EMPTY row (`[[]]`, never `[]`). `Type.ctor`/`Type.func` refuse
an empty `args` array outright — a callable answering to no call has no spelling, so the factory
throws rather than mint one, catching the `[[]]`-vs-`[]` slip directly at the authoring boundary.
The alias lives in `primitives` beside the node interfaces it types and `di.core` re-exports it, so
every consumer names the same shape.

Every callable factory opens through two doors. The POSITIONAL door takes the instance/return type
first and the whole row array second: `Type.ctor(instance, args: TypeSignatures)` and the `Type.func`
sibling over `returns` — `Type.ctor(box, [[string]])` for one row, `Type.ctor(box, [[]])` for a
constructor taking nothing, `Type.ctor(box, [[string], []])` for two. The OBJECT door takes one
literal naming every field at once (`Type.ctor({ instance: box, args: [[A, B], [A]] })`), since the
object door names exactly the node's own fields. A file-internal, unexported alias in
`Type.ts` — `type Spec<T extends Type> = Omit<T, 'kind' | TypeBrand>` — names that shape once and
derives it from the node itself, so the object door and the node can never drift apart and the
exported roster carries no per-factory spec interface.

`Type.adopt` is the door underneath every other one: handed a node written out as plain data —
every field it publishes, `kind` included, minus the intern-table brand (`RawType<T>`) — it
canonicalizes, freezes and interns it, and hands back the canonical instance, so `===` decides its
equality exactly as any other factory's result does. It's the door a tree arriving from outside
takes — a value revived from JSON, one a cast produced, the tree the parser reads out of a token —
and the mechanism every other factory already shared; `adopt` names and publishes it rather than
adding a second one. It is also the ONE semantic door: a visitor whose every case is a factory
call, so whatever a factory canonicalizes, collapses or refuses applies to a revived node. The
parser owns grammar alone — it parses a token literally into `RawType` data and `Type.from(token)`
is `adopt(parseLiteral(token))` — so the grammar cannot drift from the factories. `Type.from`
takes a string only; plain data goes through `Type.adopt` directly, one input per door.

Interning identity includes the rows: the intern key brackets each row separately, which is what
keeps a callable's one-empty-row shape distinct from every other row shape it could carry.

_Claude-directed 2026-08-13, executing the owner's 2D-overloads ruling._

## §169 — The token grammar spells overload rows with semicolons, inside the one parameter position

`Type.from`/`Type.stringify`'s wire grammar (`libraries/primitives/src/Type/internals/parser.ts`,
`StringifyVisitor.ts`) mirrors the flat/structured door pair: a callable's parameter rows occupy
the SAME parenthesized position a single signature always used, separated by `;` — `(A, B) => R` is
one row, `(A, B; A) => R` is two. `new (A; ) => I` is a constructor answering to a one-argument call
and a no-argument one. A leading `;` spells a leading empty row: `(; A) => R` is a no-argument row
followed by a one-argument row.

Because the separator sits INSIDE the existing parenthesized position rather than opening a new
one, every single-row token is byte-identical to what it always spelled — `Type.from`/
`Type.stringify` round-trip a one-row callable exactly as before, and only a genuinely overloaded
callable's token grows the `;`. `Type.stringify` always emits the arrow form (`(...) => R` / `new
(...) => I`), never the reserved `Func<...>`/`Ctor<...>` spelling, so a round-trip through
stringify never has to choose between the two.

The reserved spellings carry rows the same way, the head separated from the first row by its own
comma: `Func<R, A, B; C>` names return type `R` over two rows (`[A, B]` then `[C]`), and `Ctor<I, A;
B>` names instance type `I` over two one-argument rows. `Ctor<I; A>` is the leading-empty-row
spelling — no comma between the head and the `;`, so the constructor's first row is empty (its own
no-argument overload) and its second is `[A]`.

_Claude-directed 2026-08-13, executing the owner's 2D-overloads ruling._

## §170 — The registration carries the implementer's whole type; an intersection means an intersection

A file-internal generic base (`libraries/di.core/src/Registration/Registration.ts`)
carries what every registration has: `interface Registration<Kind, Implementer, ImplementerType
extends Type> { kind; address; implementer; implementerType }` — the address a registration
answers to is named `address`, never `type`. Only three aliases reach the public surface:
`CtorRegistration<Scopes>` is the base at `'ctor'` / `Ctor` / `ConstructorType`, intersected with a
scope member; `FactoryRegistration<Scopes>` is the same shape at `'factory'` / `Func` /
`FunctionType`; `ValueRegistration` is the base at `'value'` / `unknown` / `Type`, carrying no scope
member at all — a value IS its own instance, so there is no construction for a lifetime to govern.
Both intersections are wrapped in `Flatten` so a hover reads one member list rather than an `A & B`
expression.

The payload member is `implementer` on all three kinds, and `implementerType` is its type —
`ConstructorType`, `FunctionType`, and the value's own `Type` respectively — with no separate
stored-signatures member; every reader wanting a registration's parameter rows reads
`implementerType.args`. The three static factories `Registration.ctor` / `.factory` / `.value`
stay distinct rather than collapsing to one dispatcher, because how the container reaches a service
is the CALLER'S INTENT and is not derivable from the implementer's own type — a function registered
as a value must be handed back, never called. `op.ts`'s `equals` compares `implementerType` by
`===`, since the intern table already decides `Type` equality — two registrations naming the same
callable node ARE the same registration, structurally. The registration verbs' public parameter is
named `implementerType` throughout; no public API spells the abbreviation "impl".

The builder's hand-roller door (`libraries/di.core/src/builder.ts`) mints the anonymous callable its
rows describe, filed under the type being registered: `withSignature(...paramTypes)` gives one row,
`withSignatures(...rows)` gives several — both spend the SAME `implementerType` slot `withType(implementerType)`
spends, so a `Pending` registration takes exactly one of the three doors onto it.

Native rows are the only encoding of an overload set now, so `IntersectionType` no longer stands in
for one anywhere on the registration surface: every registration verb, `withType`, and
`addHostedService`/`addMetricsListenerType` take a constructor or function type outright rather than
a union with `IntersectionType` — an intersection means an intersection (`A & B`, both required at
once), never an overload set spelled the wrong way.

The resolution engine reads `implementerType.args` the same way: `Plan.ts`'s row choice is
longest-row-first, first-fully-resolvable-wins — the first parameter row, walked longest to
shortest, whose every parameter resolves to a plan node is the one the engine builds, so an
overloaded registration prefers its most-specific answerable row over a shorter one that also
resolves.

_Claude-directed 2026-08-13, executing the owner's 2D-overloads ruling._

## §171 — `typefor` is the single value-observing derivation door

`typefor<T>()` / `typefor(value)` / `typefor<typeof C>()` all derive a `Type` tree through the ONE
shared derivation layer (`transforms/internal/tokens.DeriveTyped`, `transforms/internal/
typeemit.EmitDerived`) — observing a class or factory value's own callable shape is `typefor`'s
value-argument overload, not a separate primitive. `DeriveTyped` walks EVERY construct or call
signature a declaration carries, not just the first, so an overloaded declaration derives one
parameter row per overload — `typefor<typeof Widget>()` is how an author spells a class or factory's
whole implementation type as `addClass`/`addFactory`'s third argument, standing in for a hand-rolled
`Type.ctor(...)`/`Type.func(...)`.

The emitted text is rows-always, matching the factory's positional door (§168):
`typeemit.EmitDerived`'s `signatureShaped` helper always emits `Type.ctor(instance, [[...]])` /
`Type.func(returns, [[...]])`, one row per overload the declaration answers to, whether the
declaration carries one call signature or several — the same call a hand-writer would compose,
spelled automatically.

_Claude-directed 2026-08-13, executing the owner's 2D-overloads ruling._

## §172 — A member name contributed by two `extends`-only `declare module` blocks needs a direct duplicate on each side

A member name that two packages both contribute to the same receiver, each through its own
`extends`-only `declare module` block, does not overload-merge: TypeScript's own-member-shadows-
inherited-member rule leaves only one side's signature visible on the interface-typed receiver — the
other, though still installed at runtime by the augmentation registry, is unreachable from a caller
holding the interface type. The same shadowing applies when the colliding member's other side is the
receiver's own primary (non-`declare module`) declaration, not another augmentation.

For every member name that collides this way, each contributing `declare module` block duplicates
that member's signature(s) — copied verbatim from its member-map interface, no doc comment on the
duplicate — directly in its body, beside the `extends` clause. A block whose contributed member never
collides keeps its `extends`-only empty body. With every colliding side declaring its own signature
directly, TypeScript's same-name-across-partial-declarations merge (the same mechanism that already
applies to the receiver's own primary declaration plus its augmentations) folds them into one overload
list, and the interface-typed receiver sees every form.

Landed for the di.core ↔ di.extras collision set on `Manifest` (`add`/`addClass`/`addFactory`/
`addValue`/`tryAdd`/`tryAddClass`/`tryAddFactory`/`tryAddValue`/`replaceClass`/`replaceFactory`/
`replaceValue`/`removeAll`, both sides duplicated) and on `IServiceProvider`
(`getRequiredService`/`getServices`, both sides; `getService`, extras side only — the base forms are
primitives' own primary declaration, never a `declare module` block) — plus the options.augmentations
↔ di.extras.options `addOptions` collision (options.augmentations side only: di.extras.options'
`addOptions<T>()` block was already a direct declaration, not `extends`-only, so it needed no change).
Every other `extends`-only augmentation in the repo was checked and found non-colliding — disjoint
member names on a shared receiver merge via `extends` as written.

Found as a side effect, left untouched: `@rhombus-std/di.extras.options`'s rolled
`dist/bundle/index.d.ts` carries no top-level import or export statement — only its `declare module`
block — which makes the file a global script rather than a module in TypeScript's eyes, so the block
declares a fresh `@rhombus-std/di.core` module instead of augmenting the real one, once another file
in the same program also needs di.core's real exports. A `rollup-plugin-dts` output defect, separate
from the overload-collision shape this entry addresses.

_Owner-directed mechanics ("duplicate their signature into the interface in 'declare module'"),
Claude-executed 2026-08-13._

## §173 — The envelope carries the consumer program's own TypeScript diagnostics, collected once

The Go host type-checks the whole consumer program to run its stages — the checker runs regardless —
but `noEmitOnError` is left off (the host always force-emits), so a type-broken program built "green":
the program's real bind/syntactic/semantic diagnostics were computed and then dropped, and any visible
symptom was whichever spurious stage diagnostic happened to fire on the malformed AST instead of the
actual error.

`driver.Program.Diagnostics()` (bind + syntactic + semantic, `NoEmit`-declaration filtering and
sort-and-dedup already applied by the vendored driver package) is called exactly ONCE, program-wide,
right after `ApplyLinkedPlugins` and before the per-file stage loop — not from inside that loop, so the
same program-level error is never repeated once per file. Each diagnostic is filtered to `IsError()`
(skipping suggestions/messages) and converted with a `"TS" + numeric code` code, matching `tsc`'s own
display convention (`TS2322`, `TS2554`, …) and staying disjoint from every stage's own string codes
(`STAGE_PANIC`, `FIXED_POINT_EXHAUSTED`, …).

The envelope diagnostic shape gained optional `line`/`character` fields, matching the `ttsc` package's
own public `ITtscCompilerDiagnostic` contract byte-for-byte in field name — no plugin diagnostic
populates them today (none carry a computed line/column), but a diagnostic that does now flows its
position through unchanged. No change was needed on the `@ttsc/unplugin`/`ttsc` npm side: its
`TtscCompiler.transform()` already flips a result to `"failure"` — and `selectTransformedSource` already
throws, and `bun.mjs`'s `onLoad` already propagates that throw as a build error — driven purely by
`diagnostics[].category === "error"` in the parsed envelope, with no per-code special-casing. Putting a
program's TS errors in the same array with `category: "error"` was the whole fix on that side.

_Owner-ruled ("fix it"), Claude-executed 2026-08-14._

## §174 — An augmentation's implementation namespace is the one place its shape is written

An augmentation is a namespace of exported function declarations. That namespace carries the real
parameters, generics, declared overloads and docs, and the receiver's members DERIVE from it:

```ts
export namespace ServiceScopeFactoryServiceAugmentations {
  export function createAsyncScope(this: IServiceScopeFactory): AsyncServiceScope {
    throw new NotImplementedError('IServiceScopeFactory.createAsyncScope');
  }
}

declare module '@rhombus-std/di.core' {
  interface IServiceScopeFactory extends Flatten<typeof ServiceScopeFactoryServiceAugmentations> {}
}
```

There is no hand-authored member-map interface and no `AugmentationSet2`: with the implementation
serving as the declaration, a type pairing the two has nothing left to check. `AugmentationSet<R>`,
`MergeStrategy` and `MergeStrategies` stay — they type the erased registry surface and the
collision resolvers, neither of which the namespace subsumes. The runtime is untouched, because a
namespace of function exports compiles to a plain object and `installSet`'s `Object.entries` loop
cannot tell the two apart.

**A chaining verb names its own `Self`.** A namespace function may not spell `this` as a return type
(TS2526), so it takes `<Self extends Receiver>(this: Self, …): Self` and returns that — genuinely
polymorphic, and not special to a generic receiver. Where a generic receiver's own type argument
must also travel, the function carries it too: `<Self extends Manifest<S>, S extends string =
string>(this: Self, …): Self`.

**Where one namespace serves two unrelated receivers, `Self`'s constraint is structural.**
`IConfigBuilder` and `config`'s `ConfigBuilder<T>` are not assignable to one another — the latter's
`build()` returns `T` — so a member map merged onto both constrains `Self` to a small named
structural type declared beside it, spelling exactly the members the bodies touch.

**A colliding member duplicates its signature in the `declare module` block, verbatim.** Two
`extends` clauses never merge into an overload set (§172), so a name arriving from another
contributor or from the receiver's own primitive is declared directly as well — a character-for-
character copy of the namespace function's signature, its own type parameters and its `this`
parameter included. Re-scoping that copy to the receiver's type parameters is TS2430.

One consequence worth recording: `AugmentationSet2` mapped every member's return to `unknown`, so
no augmentation body was ever return-checked. Deriving from the implementation turns that checking
on, and it found real gaps — a `tryGetValue(key)[1]` read returned as a generic `T`, untyped
rest-spread dispatch in `addFilter`, a two-type-argument call to a one-parameter
`registerAugmentations`. It also exposed five verbs declaring `this: DefaultManifest<string>`, which
put a concrete class in the public `Manifest` surface and broke any caller holding the interface;
they take `this: Manifest<string>` now, which is all their bodies ever used.

_Owner-delivered MO, Claude-executed 2026-08-14._

## §175 — The implementation IS the declared face the inline stage matches against

Face and body are one node, so serving is EXACT: same type-parameter count, same value parameters
by name and order. Nothing is relaxed.

A body that absorbed its parameters into a rest has no face to compare against — it would serve any
declaration of equal type-parameter count, including one it has nothing to do with. Neither the
call, the declaration, nor the body distinguishes a coincidental collision from the genuine target;
only authorial intent does, and that is not in the data. So the ambiguity is removed at the source:
**no implementation takes a bare rest**, and a rest-shaped one is refused where it is read
(`INLINE_REST_BODY`), naming the member. A genuinely variadic member keeps a leading NAMED parameter
and only then a trailing rest, which serves nothing but an identically-spelled declaration.

**An omitted optional tail is omitted in the emit.** A call that stops short of the implementation's
optional parameters leaves them unbound, and an argument-position reference to an unbound parameter
in the trailing run drops out — `services.addClass<ILogger>(ConsoleLogger, impl)` emits
`services.addClass(TYPE, ConsoleLogger, impl)`, not three trailing `undefined`s, which is the parity
invariant doing its job. A reference that survives the trim (ahead of a supplied argument, or
outside an argument list) would emit a dangling identifier and is reported instead
(`INLINE_UNBOUND_PARAMETER`). For the same reason the emit sweep matches an arity SPAN — required
parameters through whole list — rather than an exact count.

_Claude-decided 2026-08-14, executing the owner's MO ruling._

## §176 — Receiver-driven inference stops where an explicit type argument starts

The `<Self extends R>(this: Self, …): Self` shape binds `Self` — and any receiver type argument
riding with it — from the receiver, but ONLY when the call site writes no type argument of its own.
TypeScript fills the remaining type parameters from their DEFAULTS rather than inferring them once a
call supplies a partial type-argument list.

`di.extras`' tokenless sugar is the case where that bites: its whole point is that the caller writes
`<T>`, so nothing else in the list can be inferred. Its members therefore cannot carry the
receiver's `Scopes` — `scope` is `string` and the return is `Manifest`, where the token-taking verbs
on `di.core` keep `Manifest<S>`:

```ts
export function addClass<T>(this: Manifest, ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: string,
  key?: string): Manifest {
  return (this as any).addClass(typefor<T>(), ctor, implementerType, scope, key);
}
```

This is the boundary of the shape, not a defect in it: any augmentation whose caller writes an
explicit type argument gives up receiver-driven inference for the rest of the list.

_Claude-decided 2026-08-14; flagged to the owner as an authoring-surface consequence._

## §177 — The Go nameof stage retires; typefor is the sole primitive lowering stage

`tokenfor`/`tokenof` were already gone from the TS authoring surface (§171: `typefor` is the single
value-observing derivation door) — `@rhombus-std/primitives.extras` exports only `typefor`, and no
library source anywhere in the repo still imports the retired pair. What survived was the Go engine
side: `transforms/internal/nameoftransform` (the flat-string token lowering stage, ~2700 lines),
`tokens/composed.go` and `tokens/produced.go` (its composed-generic and produced-type derivation
helpers), and the `ComposedTypeArg`/`Composed` machinery in `inlinetransform` that fed a composed
generic use to it — kept alive only by test fixtures that hand-declared local `tokenfor`/`tokenof`
stubs to exercise the stage, since no real consumer minted one anymore. All of it is now deleted, and
the canonical stage table drops to `mergesynth (pre-pass) → inline → typefor → schemaof`.

Three probes depended on the stage and were rehomed onto `typefor` rather than deleted outright:
`tests/declare-by-depending.ttsc.e2e` (the host-spawn observable), `tests/mergesynth.ttsc.e2e` (the
merge-strategy synthesis witness, whose `IAlpha` registration fixture used `tokenfor`/`tokenof` as its
real augmentation-token argument), and `transforms/internal/stdhost/inlinevaluearg_test.go` (the
waiting-sugar / rebuilt-value-argument crash pin, previously exercising both `tokenfor` and `tokenof`
as its two `ValueArg` consumers — now a single typefor-only scenario, since there is only one consumer
left). `tests/primitives.extras.ttsc.e2e/nameof-parity.test.ts` — the stage's own byte-parity oracle
over ten type shapes — was NOT a clean delete: a coverage comparison found three shapes (package-public
barrel resolution, a root re-export of a deeply-declared type, and defaulted-generic-alias handling)
that no typefor suite exercised, because `tokens/packages.go`'s membership/alias logic is checker-level
and rides `*.ttsc.e2e` parity suites against real packages rather than unit tests. Those three shapes
were ported into a new `tests/typefor.ttsc.e2e/test/package-shapes.test.ts`, asserting `Type.imported`
trees instead of flat tokens, and the now-redundant suite (and its dedicated CI shard) was deleted.

`ServiceBaseTokenFor`/`KeyedTokenFor` in `tokens/holes.go`, and the `tokenfor`/`tokenof` entries in
`inlinetransform`'s `knownPrimitives` map (and its ESLint mirror, `PRIMITIVE_HOMES`), were left in
place: they compile, they're covered by their own existing unit tests, and removing them meant
rewriting ~48 occurrences across six Go test files that use `tokenfor`/`tokenof` purely as example
primitive names for exercising the inline stage's matching/registration mechanism in isolation, never
its lowering. A source-written `tokenfor`/`tokenof` call still inlines and registers today; nothing
lowers it, so it now always survives to the emit sweep as `INLINE_UNLOWERED_PRIMITIVE` rather than
silently doing nothing — flagged rather than fixed, since closing it is a bounded but separate cleanup.

Documentation was corrected where it directly described deleted machinery or non-existent primitives
as current: `docs/features/transformer-architecture.md`'s pipeline diagram, primitive table, and
several worked examples; `libraries/primitives.extras`'s README and `package.json` (the package that
used to house `tokenfor`/`tokenof`, rewritten around `typefor`'s actual `Type`-returning contract); and
this file's own digest. `CLAUDE.md`'s and `docs/libraries/*.md`'s scattered older `tokenfor`/`tokenof`
mentions were left as a separate, pre-existing documentation-currency gap from the earlier TS-surface
retirement (§171) — out of scope for this entry, flagged for its own audit pass.

_Owner-directed (task-tracked, "Go nameof stage retirement"), Claude-executed 2026-08-14._

## §180 — Matching: same kind always; assignability within a kind; identity at identifiers

A request matches a candidate only WITHIN a kind — there is no cross-kind assignability: a ctor
never answers a func, and an `Array<T>` registration never answers an `Iterable<T>` request (one
registration must not silently rewrite every collection injection site — the aggregation fallback
serves those). Within a structural kind the comparison is assignability over the node trees,
recursing into child positions; at the identifier kinds the tree's knowledge ends and the
comparison is interned identity (`===`; tags keep their own rules). A generic hole is the one
deliberate exception to the kind discipline: a hole BINDS whatever sits at its position —
binding, not assignability. A callable candidate serves a requested callable when EVERY requested
signature row is served by SOME candidate row — surplus candidate rows are harmless extra
capability. That is the type-level relation only; which row the engine CONSTRUCTS through is a
separate value-level choice (rows sorted longest-first, first row whose looked-up values are all
present wins).

Precedence at lookup: an exact-identity hit wins outright; the `Iterable<T>` aggregation fallback
answers collection requests otherwise, and only an exact registration of that same type preempts
it. Among plural within-kind-assignable candidates the most recent registration wins, consistent
with recency everywhere else.

_Owner-ruled 2026-08-14, Claude-recorded._

## §178 — `schemaof`'s leaf members share typefor's hoist const table; its own structure stays inline

A `schemaof<T>()` expansion member that stops at a name, literal, or nullish singleton — the same
leaf shapes `typefor<T>()` derives — is spelled through the project's shared const table when the
project hoists, rather than always writing its `Type.*` factory call at the call site: the two
primitives pass the SAME `*Hoist` to their stage constructors, so a type either one reaches interns
to one const regardless of which primitive reached it first. The object/tuple/union structure
`schemaof` composes AROUND such a member stays inline unconditionally — that structure is this
stage's own, not a type a hand-writer would address by name, so it carries no const of its own even
when every leaf inside it does.

`typefortransform`'s per-file `hoistEmitter` — previously typefor-private — is exported as
`HoistEmitter`, with a `NewHoistEmitter` constructor and `Node`/`Imports` methods, so a sibling
primitive's own leaf emission can share the registry through the identical handle typefor uses; a
`nil *Hoist` still selects INLINE emission for both primitives, matching the emission a project
without the default declares.

_Owner-directed via task #40 (the hoisting guarantee — one const per distinct interned node
referenced anywhere in the project's lowered output — reads across every primitive that derives a
`Type.*` tree, not typefor alone), Claude-executed 2026-08-14._

## §179 — Row matching implements §180's every/some doctrine; callable nodes drop their dead quantifier list and the `Type` suffix

`SatisfiesVisitor`'s row comparison reads exactly as §180 states it: every condition row must be
served by some proposed row, surplus proposed rows harmless. `ConstructorType` and `FunctionType` no
longer carry a `genericArgs` member — nothing at a structural callable's request site can spell
"populate these holes ahead of matching", since generic binding already happens by tree-position
unification against the holes themselves, and substitution into an implementer is referential through
the interned `GenericType` nodes. The member survives only on the identifier kinds (`GlobalType`/
`ImportedType`), where it is the positional constructed-argument list a request actually supplies.

The factories, the stringify/parse token grammar, and every derived-openness/derived-string walk over
a callable drop the field and its quantifier-prefix spelling together, keeping the round trip intact.
The value-level construction-row selection (longest-satisfiable row wins, a separate layer from
this type-level relation) is untouched by either change.

`ConstructorType.instanceType` and `FunctionType.returnType` rename to `instance` and `return`, so
every `Type` kind's member names agree in dropping the redundant `Type` suffix — a node's own `kind`
already says what it is. `return` is a legal PROPERTY name (`{ return: x }`, `node.return` both
compile) but not a legal bare identifier, so the positional `Type.func` factory's first parameter —
and any local binding that would otherwise destructure or hold the return type on its own — spells
`returns` instead; `instance` needs no such dodge and renames cleanly everywhere, parameter included.
The typefor accessor-folding peephole (`transforms/internal/typefortransform`) recognizes the new
property names in place of the old ones — an author who writes `typefor(C).instance` or
`typefor<F>().return` gets the same compile-time fold as before, under the new spelling.

_Owner-ruled, Claude-executed 2026-08-14._

## §181 — An abstract constructor is its own kind

The node space carries two constructor kinds: `ConstructorType` (`kind: 'ctor'`) for a
constructor `new` targets directly, and `AbstractConstructorType` (`kind: 'abstract-ctor'`) for
one it never does — each with exactly `instance` and `signatures`, no flag member anywhere. A
slot that must be able to construct its node spells `ConstructorType` and refuses the abstract
kind by plain assignability — invalid registrations are inexpressible, and no runtime check
backs the refusal (admissibility is type-only; an untyped caller gets ordinary JS behavior). A
position accepting either spells the union. Each kind pairs with its own factory —
`Type.ctor(instance, signatures)` / `Type.abstractCtor(instance, signatures)`, spec-object doors
included; no boolean selector argument exists.

The token grammar is unchanged: `abstract new (signatures) => instance` spells the abstract kind,
the keyword an ordinary contextual name recognized only immediately before `new (` — everywhere
else `abstract` reads as an ordinary global type name, exactly as `new` itself already does. The
prefix maps to the kind at the writer and reader, so the round trip holds both directions.

Matching stays identity-modulo-holes: the two kinds are distinct nodes, so an abstract pattern
answers only an abstract subject and the reverse, with no flag comparison anywhere. In canonical
member order `abstract-ctor` ranks directly after `ctor`.

`typefor`'s Go derivation reads a construct signature's declaring class off its symbol and checks
the `abstract` modifier through the ttsc ast shim's `GetCombinedModifierFlags`/
`ModifierFlagsAbstract`, minting the kind accordingly; `TypeFor<T>` narrows a concrete class to
`ConstructorType` before testing the abstract shape, since every concrete constructor also
answers it. A bare abstract-constructor type literal with no backing class declaration still
derives concrete — see §183.

_Owner-ruled, Claude-executed 2026-08-22._

## §184 — Minimal scope/dispose placeholder: least-code choices, not design rulings

Per the owner's least-code directive (task #46): implement the NotImplementedError-stubbed
scope/dispose surface just enough to make the examples run and flip the scope-intrinsic baseline
red tests green, taking whichever side of any genuinely open fork costs the least code, and
recording every such choice here rather than treating it as settled. The real scope design belongs
to the parked session (task #5, `docs/di2.scope-notes.md`); nothing below should be read as
answering the forks that session lists.

**What moved off NotImplementedError.** `ServiceProvider.dispose`/`disposeAsync`; `IServiceScope`/
`IServiceScopeFactory` gained a real implementation (`libraries/di/src/internal/ServiceScope.ts`);
`IServiceScope.isService`. `IServiceProvider.createScope` needed no change — its existing
implementation already delegated to `getRequiredService(IServiceScopeFactory)`, which now succeeds.
Left alone, still throwing: `ServiceProvider.tryResolve`/`resolveAsync`,
`IServiceScopeFactory.createAsyncScope`/`IServiceProvider.createAsyncScope` — no red test or example
reaches them, so nothing was built for them.

**`IServiceScopeFactory` is recognized structurally, not registered.** `PlannerVisitor` answers a
request for it the same way it already answered `IServiceProvider` — by name and declaring module,
with no manifest entry required — and `RealizeVisitor` hands back a `ServiceScopeFactory` bound to
the walk's own engine and provider. This is the existing pattern for `IServiceProvider`, reused
rather than invented, and it is what let `createScope`'s current implementation start working
without being touched.

**A lifetime tag gates caching; its VALUE is ignored.** A ctor/factory plan node whose registration carries
any lifetime caches into whichever scope is asking, keyed by that registration; a plan node with none
realizes fresh every time. There is no matching-scope-by-tag search, no ancestor lookup, and no
distinction between different tag strings — every registration in the repo today tags `'singleton'`
and nothing else, so this is the cheapest gate that already satisfies all of them. Multiple named
scope kinds, tag-mismatch handling, and nested/ancestor scope chains are all untouched.

**The cache key is the answering registration, not the bare requested type.** A single address can
carry several registrations — many hosted services under one token is the case the baseline tests
exercise — and each needs its own cache slot; keying purely by the requested `Type` (the literal
reading of the parked notes' "keyed by the requested type") collapsed them into one. A
`Registration` object is stable across every separate plan build that reaches it (the engine
holds one `Registry` over one set of registration objects for its whole life), so keying on it instead
satisfies §142's resolve-one/resolve-all sharing invariant while still giving every registration its
own slot. `ScopeCache`'s key parameter widened from `Type` to `unknown` in
`libraries/di.core/src/ServiceScope.ts` to carry it — the interface's shape, not its behavior; no
existing caller took a dependency on the narrower type.

**Disposal cascades from the provider through its opened scopes to their cached values.**
`ServiceProvider.dispose`/`disposeAsync` walk every scope the provider's engine ever opened, most
recently opened first; each scope disposes its own cached values the same way, calling whichever of
`Symbol.dispose`/`Symbol.asyncDispose` a value carries and skipping a value with neither. A direct,
unscoped `getService`/`getRequiredService` call never caches anything, so it leaves nothing behind
for this walk to reach — consistent with the "frameless provider" the hosting package's own `Host`
already documents. Per-scope registrations, scope-level `Symbol.dispose` reachable from the public
`IServiceScope` surface, and disposal ordering guarantees beyond most-recent-first are all
untouched.

**The provider a scoped dependency receives is the root provider.** Resolving through a scope hands
an `IServiceProvider`-typed dependency the same provider the scope itself was opened from, not a
view bound to that scope — a nested resolution reached through it does not share the outer scope's
cache. The "SP = (engine, scope) binding minted at the plan node" idea the parked notes lean toward
is the more complete answer; this is the cheaper one, taken because no red test exercises the
difference.

_Claude-authored under the owner's least-code directive (task #46), 2026-08-14 — minimal
placeholders taken to get something running, not design rulings; task #5 remains the authority on
the scope model itself._

## §185 — The nine baseline reds resolved at the wrong address; the open `IOptions<$T>` design (§160) stands

The `caching.memory`, `logging.config`, and `augmentations` suites (eight tests) all failed the same
way: `UnsatisfiableError: cannot satisfy <pkg>:<BareOptionsType>`. Every one of them called
`getRequiredService`/`getService` on the BARE options type — `MEMORY_CACHE_OPTIONS_TYPE`,
`Type.from('test:FakeProviderOptions')`, `LOGGER_FILTER_OPTIONS_TYPE` — and expected an
`IOptions<T>`-shaped `{ value }` back.

§160 already settled the addressing: `addOptions(tType, …)` OFFERS `IOptions<T>` by filling `T`'s
base-factory slot, but the bare `T` itself is never registered as a resolvable address — only the
one open `IOptions<$T>` registration is, and it answers `IOptions<T>` requests by their closing type.
Resolving the bare type was therefore never going to work; nothing registers it. The registration
shape and the engine's open-template resolution both match the design as recorded — this was a test
defect, not a production one. Each failing assertion now resolves at the composed `IOptions<T>`
address instead: the packages that mint one already export an accessor constant
(`MEMORY_CACHE_OPTIONS_ACCESSOR_TYPE`, `LOGGER_FILTER_OPTIONS_ACCESSOR_TYPE`) built the same way
`caching.memory`'s own factories resolve their options, and the ad hoc `FakeProviderOptions` test
composes its address with `options.augmentations`'s exported `optionsAddressType`.

The ninth red, `hosting.test`'s `createDefaultServiceProviderOptions` unit, was unrelated: the
function's own doc comment says scope AND build-time validation are Development-only, but the
implementation only ever set `validateOnBuild`. `validateScopes` now follows the same
`isDevelopment` value.

## §186 — Async resolution is plan-node behavior

The container has no async type kind and no async resolution machinery of its own: asynchrony is
plan-node behavior. `getServiceAsync` wraps the synchronous resolution in a `Promise` and
forwards; everything reachable asynchronously is reachable through `getService`. A dependency on
`Promise<T>` or `AsyncIterable<T>` is spelled with the ordinary global generics — there is no
dedicated node kind for either. The parts that interact with scope — the hoist walk consulting
the scope cache per async plan, per-occurrence placeholder labels, and the concurrent-miss
double-instantiation question — are held in docs/di2.scope-notes.md for the scope design session;
none of them changes the plan-node principle.

_Owner-ruled (pre-compact session record), Claude-recorded 2026-08-14._

## §183 — The signature-level abstract flag sits inside `ttsc`'s own repository, not a consumer hook; the hoist table's Node mirror dropped the flag entirely

The residual gap §181 names — a bare abstract-constructor type literal with no backing class
declaration — needs the checker's own general notion of abstractness,
`checker.Signature.Flags() & SignatureFlagsAbstract`. `SignatureFlags` isn't aliased anywhere in the
ttsc shim, and the two tools that would add it — `tools/gen_shims` (extends per-package coverage
through `extra-shim.json`, for symbols already reachable off an aliased type) and
`tools/shim_audit -fix` (completes an enum family once its type alias exists) — both live inside
`ttsc`'s own source repository and run against `ttsc`'s own checkout to produce what ships in the npm
package. Neither is a hook this repo's build invokes, so closing this gap needs an upstream `ttsc`
contribution or a standing Go-module fork of the shim package, not something addable from the
consuming side.

`typeforhoist.Node`, the const table's own mirror of a derived tree, had no `abstract` field —
`hoistNode`'s `DerivedCtor` case built a `typeforhoist.Ctor` carrying only the instance type and rows,
so every HOISTED-mode ctor const rendered as concrete regardless of what `DeriveTyped` had derived.
INLINE mode was unaffected, since it emits straight off the `Derived` tree `typeemit.EmitDerived`
walks; HOISTED is the project default (§28), so this was the path every real build actually takes.
`Node` and `Ctor` now carry `abstract`, folded into the canonical key so a concrete and an abstract
constructor over the same instance type and rows still intern to two distinct consts, and the
rendered `Type.ctor(...)` call carries the trailing `true` only for the abstract one — the parity
invariant §181 already commits to.

_Owner-directed via task #48, Claude-executed 2026-08-14._

## §187 — The value door for resolution is the two-argument `getService(node, value)`

A caller who already holds the constructor or factory it wants built asks for it directly:
`getService(type, value)` takes the callable's own node alongside the callable itself and hands back
what it builds. The one-argument `getService(type)` stays what it is — a question about a
registration, which absence answers with `undefined`.

The node dictates construction. A `ConstructorType` is `new`ed, a `FunctionType` is called, and
nothing else decides: no runtime discriminant, no class-sniffing, no attempt-then-retry. The two
faces are declared directly on `IServiceProvider` rather than only on the concrete provider, so a
caller holding the interface reaches them — a member reached only through an `extends` clause is
invisible to that caller even though it is genuinely there.

Dependencies resolve for real. The node carries the parameter rows the callable takes, so the
provider synthesizes a `Registration` for `value` under the node — the node standing as its own
implementer type — and resolves it through the engine's `additionalServices` channel. `value` is
realized exactly as a registered constructor or factory is, against a manifest composed for this one
call and discarded after; the row-selection doctrine picks the construction row. What follows is that
the result is caller-owned: the call registers nothing, caches nothing, and a later lookup of that
same node still finds nothing. Two calls build two results. A dependency the manifest cannot reach
throws rather than arriving `undefined` — the caller has already said what to build, so an
unreachable dependency is a broken graph, not an absent service. An abstract implementer type is
refused by the registration factory's own guard, which this door inherits rather than bypasses.

The authoring face is `getService(SomeClass)` / `getService(someFunction)`: `typefor`'s value form
derives the callable's own node — a class arrives as the `ConstructorType` it is — and the sugar
lowers to the two-argument member, byte-for-byte what a hand-writer would have spelled. It lives in
its own namespace beside the tokenless `getService<T>()` rather than joining it, because an inline
body serves exactly the declarations whose parameters it names: the tokenless face takes none and the
value face takes one, so a single implementation cannot answer for both. Two `inline` entries
therefore share the member name, which is also why the emit sweep tracks every declared shape of a
member rather than a single one — residue in either arity is residue.

The call site writes a type argument only where the body consumes one. The inline stage recovers a
type-argument binding — written explicitly or inferred from a value parameter — for exactly the type
parameters a body's own primitive calls spell as a type argument (`typefor<T>()` consumes `T`); a type
parameter a body feeds only to a value-argument primitive (`typefor(value)`) consumes nothing and is
never recovered, so the call site need not write one either. The value door's body passes its own
parameter through `typefor(value)`, consuming nothing, so `getService(SomeClass)` and
`getService(someFunction)` lower with no type argument written — exactly the pair a hand-writer would
have spelled. The tokenless `getService<T>()` consumes `T` through `typefor<T>()` and keeps requiring
a type argument the call site can supply.

_Owner-ruled via task #19, Claude-executed 2026-08-14._

---

## §188 — The manifest primitives are public `add`/`remove`/`replace`; an augmentation's block face is receiver-spelled and its namespace is plain implementation

`Manifest<Scopes>`'s own body declares three primitives — `add(registration)`, `remove(registration)`,
`replace(registration)` — and `DefaultManifest` implements them under those names. They are the
substrate every registration verb composes from and carry no marker of privacy, because a caller
holding a `Registration` has a legitimate reason to reach each of them.

An augmentation set contributing chaining members to that receiver splits the two jobs. The
NAMESPACE is implementation: it writes the receiver at its widest (`this: Manifest<string>`, plain
`string` scope parameters, `Manifest<string>` returns) and carries no `Self`/`S` type parameters.
The `declare module` BLOCK is the caller-facing face and is RECEIVER-SPELLED: the interface's own
type parameters occupy parameter positions (`scope?: Scopes`), the return is `Manifest<Scopes>`, and
there is no `this` parameter. A `this` return is wrong on this receiver whatever the mechanism: the
chain is immutable, so every verb yields a fresh node rather than the object called. A member with a
leading explicit type parameter keeps it (`addOptions<T>`, `configure<T, Deps>`) and loses nothing
else — with the return naming `Scopes` rather than an inferred `S`, an explicitly written type
argument no longer costs the caller its scope union. Where the block declares every member of its
namespace, `extends Flatten<typeof TheNamespace>` has nothing left to derive and goes.

A sugared shape whose entire body forwards to a primitive is not written: the primitive's own
declaration is the whole story for it. What remains of `add` — the configure lambda, the
constructor, the factory — shares a name with the primitive on `DefaultManifest`'s prototype, so the
registration supplies a merge strategy: a lone `Registration` routes to the primitive, and every
other shape to the sugar, which is also what keeps the sugar's own closing `this.add(registration)`
from re-entering itself. The strategy is hand-written rather than left to merge synthesis, because a
package's authored source must install correctly with no transformer in play.

The concrete class pays for the shared name: a `DefaultManifest` narrowing `add` to the registration
shape alone is not a `Manifest`, so the class declares an open second signature beside the
primitive's. The precise sugared faces are readable on `Manifest`, which is the type callers hold.

_Owner-ruled 2026-08-15, Claude-executed._

---

## §189 — The compile-time type machinery is the toolkit's; `obj` carries the `Object.*` precision

`@rhombus-std/primitives` carries no type-level module of its own. `Flatten` is imported by every consumer straight from `@rhombus-toolkit/type-helpers`, and the precise `Object.keys`/`values`/`entries`/
`assign`/`fromEntries` result types live on that package's `obj` module as WRAPPER FUNCTIONS —
`obj.keys(x)` at exactly the call sites that want the precision — with no `ObjectConstructor`
augmentation anywhere: a global augmentation imposes the sharpened signatures on every file of every
consuming program, where the wrapper is opt-in per call. Call sites that never needed the precision
keep the stock `Object.*` statics. The supporting machinery (`UnionToTuple`, the counters, the
index-wise array merge) serves those types inside `type-helpers` and is not part of primitives'
surface.

The registry keys its per-token bags as plain `Map<string, Contribution[]>` — no dedicated
multimap class exists in primitives.

_Owner-ruled 2026-08-15, Claude-executed._

---

## §190 — A declaration-site tag would replace the `*.extras` forwarding bodies; the bodies stand

Every type-driven sugar member in a `*.extras` package is an authored body whose whole content is
"derive the type, put it first, forward the rest" — four in di.extras' manifest set, three in its
provider set. They are near-identical by construction. That is a property of the shape, not a
defect: one body per member name serves all of that name's overloads, and the roster only grows when
a verb does.

The alternative is a JSDoc tag on the `declare module` face, replacing the namespace, the
`registerInlineBodies` call and the marker entry with one line:

```ts
declare module '@rhombus-std/di.core' {
  /** @rhombus-std/move-type-arg-to-first-position-call-of @rhombus-std/primitives.extras:typefor */
  interface Manifest<Scopes extends string> {
    add<T>(ctor: Ctor<any[], T>, ctorType: ConstructorType, scope?: string): Manifest<Scopes>;
    tryAdd<T>(ctor: Ctor<any[], T>, ctorType: ConstructorType, scope?: string): Manifest<Scopes>;
  }
}
```

It is domain-agnostic: the engine learns "call the named function on the type argument and place the
result first", while the function and its module are author-written text — nothing in the mechanism
knows a `Type` comes back. With no body anywhere it is a call-shape rewrite rather than an inlining,
so it belongs in the always-on primitive table beside `typefor`/`schemaof`, and termination rests on
the emitted call binding an untagged overload rather than on a substituted body being gone.

Two properties are worth keeping if it is ever built. The tag names no type parameter: "exactly one
type parameter" is its precondition, so binding is positional and a member declaring zero or two is
an error rather than a silent skip — which is also what lets one tag sit on a whole interface whose
members spell that parameter differently. And because the face declares the arity, the rewrite emits
a fixed-arity forward; every value-level scheme instead needs a variadic tail, which the substituter
has no binding for.

Three things stand against it. The tag's expression is a string, so a wrong one is caught by the
parity e2es and a lint rule rather than by `tsc`. `config.extras`'s `withType` forwards to a
DIFFERENTLY-named primitive (`withSchema`), so it needs a target-member component or keeps an
authored body. And the value-observing `getService<T extends Ctor>(value: T)` overload is a
different rewrite — argument, not type argument — needing a sibling tag; it is the one case where
per-overload tagging, which no value-level scheme can express, earns itself.

Nothing is planned against this. It is recorded because the reasoning is cheaper to keep than to
rebuild, not because the current bodies need replacing.

_Claude-recorded 2026-08-16; considered, not adopted._

## §191 — Matching stays exact-match-only; the assignability designs are parked, recorded here

Owner ruling 2026-08-19: for every use case, Type-node matching stays EXACT — no heritage walking, no
variance, no structural comparison, no constrained-hole enforcement. `AliasType` (an exported alias as a
name carrying its aliased node, the two readings chosen at the call site) was judged justified on its own,
then held with the rest of the rework — nothing from this thread is scheduled. The designs below were
worked out in full during that discussion and are parked behind consumers, not rejected; recorded so
the reasoning is cheaper to keep than to rebuild.

**The axis discipline that survived every round.** A node's identity is a reached-from NAME
(`name`/`from`/`typeArgs`), and nothing else ever enters it: not a union's membership (§ the
aliased-union tasklist item), not declared ancestry, not declaration form (interface vs class vs
alias — re-kinding names by declaration syntax was considered and rejected: it makes addresses
refactor-sensitive and demands knowledge a `Type.from` boundary caller cannot have). Descriptions
ride BESIDE identity, off-token, never consulted by interning or matching.

**Heritage (nominal ancestry) — parked behind a dynamic-registration consumer.** Shape: an optional
`heritage` description on named nodes — `{ extends: NominalType[] }` flattening inherits+implements
(a `form: 'interface' | 'class'` tag was considered and dropped: the satisfaction walk never reads
it). Deposited by derivation into the intern pool; a boundary `Type.from` string resolves into the
pool and picks up whatever description a `typefor` already deposited — the only way the dynamic path
ever sees ancestry. Merge rule: described and bare mints of one token unify; description is
additive. Validation scope: dynamic paths only, under a declare-to-be-validated contract (statically
authored registrations are already fully checked by tsc at the sugar faces — a nominal walk adds
nothing there and TS's optional `implements` under-reports conformance, so enforcement outside the
contract false-rejects).

**Variance — parked with it; it is a modifier on a relation, not a relation.** With exact-match the
flip collapses to equality, so variance only pays once heritage exists. Then: callables and
aggregates flip STRUCTURALLY (Function/Constructor args contravariant, returns covariant;
Array/Iterable elements covariant) — no schema; arbitrary named generics stay invariant unless a
declaration-side description supplies per-parameter variance as
`typeParams: { param: GenericType, variance?: 'in' | 'out' }[]` — the hole NODES themselves in the
row, shared referentially with every mention in the description, so existing label unification
binds them. Variance rides the pairing record, never the `GenericType`: the space is deliberately
quantifier-free (§152), a registration hole is self-declaring, and a decl/ref node split
(`GenericTypeRef`) was considered and rejected — it re-imports quantifier lists, needs scoping
rules, and the self-declaring DI hole forces the ref to carry its constraint anyway.

**Constrained holes** — `GenericType.extends?: Type`, token-rendered (differently-constrained holes
are different addresses). The `Hole` brand's constraint argument stays compile-time-only today;
the node field and its unifier check ride behind the same parking.

**Duck typing — considered, bounded, not planned.** A named member MAP (optionality spelled as
`| undefined`, no readonly — a registration is a handover, not a write contract) plus instantiation
substitution plus a coinductive seen-pairs cache yields a sound structural core; the honest label is
"TS-like over the described subset", never checker parity (mapped/conditional/template-literal/
indexed-access/`this`/unique-symbol stay out).

_Claude-recorded 2026-08-19; the whole rework is held — AliasType included — nothing scheduled._

---

## §192 — Exports go src-first in-repo; dist is the published surface only

The owner's charter for the exports rework names two requirements as the whole design space: the
editor experience is flawless regardless of build state (resolution, rename, find-refs — nothing
depends on `dist` existing), and type AND value identity hold throughout the dep graph — one
`Manifest`, one augmentation registry, one module instance per package, everywhere. "src-ref"
originally meant a package consumed AS SOURCE, with no build and no dist of its own; the export
system's custom conditions grew from a misreading of that term, and are symptoms, not requirements.

**The survey.** Every library's dev `.` export resolves dist for all runtime/type-facing conditions
plus a `source` condition (editor-only, activated by `tsconfig.editor.json`'s
`customConditions: ["source"]`) and — on the seven self-`declare module`-ing packages — a
package-unique `<pkg>-source` condition activated by that package's own `tsconfig.ci.json`, fixing
the TS2664 self-typecheck (a package cannot resolve its own public specifier to a dist that its own
build has not produced yet). One white-box seam rides beside it: `./private/*` (src, all conditions).
`publishConfig.exports` (pnpm-only publish) scrubs the seam and dev conditions; `scripts/derive-publish-config.ts` derives it mechanically. The ttsc token derivation reads the
exports map itself: a public entry (bare string or `default`-reachable) is a tier-1 token source
with dist targets twinned back to their `src/` stems (`EntrySourceStems`), `./private/*` is the
sanctioned non-public reach whose files mint `pkg/private/<path>` tokens, and any OTHER non-public
subpath reaching a file is a hard diagnostic.

**The decision: the conventional shape is src-first in-repo.** Every library's dev exports resolve
`./src/index.ts` for every consumer and every condition (`.` as a bare-string target); `main`/
`types` point at src; `publishConfig` carries the dist surface unchanged. All custom conditions —
the shared `source` and all seven `<pkg>-source` — are deleted: with src the uniform in-repo
resolution there is nothing left for them to disambiguate, and the TS2664 self-augmentation fix
falls out for free (a package's own `declare module` now resolves its own specifier to the same
source files its program is compiling). This is the pattern the requirements + convention pin:

- Requirement 1 is satisfied by construction — no program, editor or gate, resolves dist in-repo.
- Requirement 2 is satisfied more strongly than dist-referencing can: with exactly one in-repo
  resolution plane (src), the barrel and any deep import land on the same files and bun's module
  cache yields one instance per file. The bundle-vs-stage dual plane, and its double-instance
  hazard, cease to exist.
- The historical blocker is gone by architecture: augmented-receiver typing no longer needs a
  sealed rolled `.d.ts`, because a concrete class merges with an `interface X extends Manifest`
  declaration instead of an `implements` clause (§188-era shape), so a program seeing both a
  receiver's source and a `declare module` face over it stays clean.

**What the flip drags along, and how each lands:**

- **In-repo execution must lower at load time.** About two-thirds of the libraries call
  `typefor<T>()` at module top level; raw src throws un-lowered. A preload
  (`scripts/ttsc-preload.ts`) registers ONE bun plugin that dispatches each loaded file to its
  owning library's `tsconfig.ttsc.json` ttsc project (instances lazy, memoized) and passes every
  other file through. Generated per-package `bunfig.toml`s (`scripts/derive-preload-bunfig.ts`)
  carry it into `bun run` and `bun test`, since bun's config discovery is cwd-only. The publish
  build is untouched: stage-then-bundle stays, and the parity invariant (lowered == hand-written)
  is what makes running lowered-on-load src equivalent to running `dist`.
- **The wire format does not move.** `.` stays public (its src stem is the same stem the build
  program compiles); `./private/*` stays, non-public (`types`/`bun` → src, no `default`), so
  internal types keep minting `pkg/private/<path>` tokens. White-box suites import src through
  `./private/*` and the preload lowers it; `dist/stage` remains a build intermediate only. No
  transforms/ change.
- **Compile-scope typings travel with the source that needs them.** A consumer program compiling a
  dependency's src must see its `node:*` shims, so each src file importing a node builtin carries
  `/// <reference path="./node-builtins.d.ts" />`.
- **Authoring faces travel the same way.** A package whose src uses another package's `declare
  module` faces (`types: ["@rhombus-std/di.extras"]`) imposes that entry on any program compiling
  its src — consumers' gates add the same `types` entry.
- **The example apps run under bun.** Their built `dist/main.js` keeps workspace deps external;
  in-repo those now resolve src, which plain node cannot execute (decorators, un-lowered
  primitives). The e2e's build half still exercises the real stage-then-bundle pipeline; the run
  half switches `node` → `bun` with the preload. The plain-node published-consumer proof belongs
  to a packed-artifact gate (out of scope here; noted as the conventional home).
- **`derive-publish-config.ts`** learns the bare-string dev form (string entry on a publishable
  subpath → dist-swapped conditions object), keeping the scrub mechanical.

**Accepted costs.** Any suite that touches a lowering library now needs the Go sidecar (previously
only the ttsc e2es did); the shared content-keyed cache keeps that a once-per-machine cost. A
package's gate compiles its transitive dependency src, so an upstream break surfaces in downstream
gates — the live-types property, working as intended. `build-all`'s tiering is no longer
load-bearing for typecheck correctness (nothing in-repo resolves upstream dist anymore); it stays
as-is to keep publish builds ordered and the change surface small.

**Held, deliberately.** Renaming `./private/*` to `./src/*` would be marginally more conventional
naming but moves the engine's tier rules and the token namespace for zero requirement gain — not
taken. The editor whole-repo program (`tsconfig.json` per package, `include: ["../*/src/**/*"]`)
stays: src-first exports make resolution build-independent, but only a whole-repo program makes
rename/find-refs COMPLETE across packages that nothing currently open imports.

_Claude-recorded 2026-08-20; implements the owner's exports-rework charter (tasklist, "Exports
system — make it conventional")._

## §193 — The registration surface as landed: uniform three-argument verbs, the describe chain, ConstantType

The 2026-08-20 tasklist run landed the repattern the tasklist specified; this entry records the
landed shape and the two interpretive calls the run made where sources disagreed.

**The landed shape.** The flat verbs converge on `add/tryAdd/replace(address, implementer,
implementerType, scope?)`, with kind selection a total switch over
`ConstructorType | FunctionType | ConstantType`. `ConstantType` is a di.core value — a marker
carrying only its kind — because a callable registered AS a value derives a `FunctionType` exactly
like a factory does, so the call site is the only place the value/factory distinction exists. The
configure-lambda overloads, `withType`/`withSignature`/`withSignatures`, the one-of-three-doors
invariant and its runtime guard, and `IComplete` are gone. The chain opens at
`manifest.describe(address)`; a taken door yields a real `Registration` whose remaining
steps (`withLifetime`/`taggedAs`) are installed non-enumerably, so the node spreads, compares, and
registers as plain data. A keyed registration is a tagged ADDRESS; no verb takes a key argument.
di.extras carries eleven inline entries (flat verbs + value doors + `removeAll` + `describe` +
the three `get*` members); each sugar derives the address AND observes the implementer type,
and termination rests on the emitted call binding a different overload than the face. The
value-driven `getService(value)` door (§167) is deliberately un-shipped with the back-out; it
ships separately.

**Interpretive call 1 — aliased unions derive to a plain named node.** The tasklist's execution
plan summarized the L2 lane as "AliasType derivation + node + factory", while the body item
specifies the emission as `tag(imported('Type', '@rhombus-std/primitives'), key)` and rules "one
node, one reading, no node shape carrying both" — and §191 records the carrying-`AliasType` node
as judged-then-HELD. The run treated the body item as the specification and the lane summary as a
loose pointer: an EXPORTED alias derives to its name as the plain `ImportedType`/`GlobalType`
(export-list exports included), a local alias derives structurally, and no new node kind exists.

**Interpretive call 2 — the value doors are named, not observed.** The uniform-`add` sketch's
single rest body (`.apply`-based) is superseded by the ConstantType ruling: `addValue`/
`tryAddValue`/`replaceValue` are their own sugar members lowering to the three-argument form with
the marker, because one body per member name cannot discriminate a callable value from a factory.

**`TypeFor<T>` is the truthful union (owner ruling).** TypeScript carries no type-level
named-vs-structural discriminator, and an alias spelling derives to the alias's own address, so no
single-kind answer is honest for a branch an alias can stand in front of. The reading widens
instead of approximating: callables, arrays and tuples, unions, every literal (`undefined` and
`null` included, which is also what makes a brand like `Keyed<string, K>` land on its base), and an
exact `Iterable<E>` each type as `structural kind | NamedType`, and the caller checks `kind` before
reading the members only one of the two carries. Branches that are already honest stay narrow — a
wide scalar is a name either way, `never` and the unreadable fallback are the whole `Type`. The
value overload takes its own `TypeForValue<V>` variant of the same conditional, narrow in every
branch: observing a value reads the construct or call signatures it carries, which no alias can
hide.

_Claude-recorded 2026-08-20; the digest above (CLAUDE.md) was synced the same day._

---

## §194 — Matching is identity modulo holes; one MatchVisitor; `Type.satisfies` does not exist

`Type.match(candidate, constraint)` is unification and nothing else: is the constraint the
candidate with each generic hole filled in? Outside a hole, pattern and subject must be the SAME
interned node — compared structurally only as deep as the holes require, with `visit`
short-circuiting on interned identity at every level. A hole binds whatever subject fragment
stands in its place, and a label appearing twice must bind the same type both times. Every other
kind requires same kind + same scalars (`name`/`from`/`tag`/`value`/`abstract`) + pairwise
positional recursion — generic args, tuple members, union/intersection members (same count),
aggregate element, tag inner. Callable rows pair positionally too: same row count, row `i`
against row `i`, same arity, parameters pairwise, return/instance pairwise. There is NO
assignability anywhere — no width subtyping, no literal-widens-to-primitive, no member or row
search, no contravariant swap — so the walk has zero choice points and nothing to roll back.

One stateless `MatchVisitor` (`libraries/primitives/src/Type/visitor/MatchVisitor.ts`) implements
it, dispatching on the pattern side with the subject and the bindings threaded through the
`TypeVisitor` context slot. `matchType` is the sole entry, and its open-constraint guard stands:
a constraint holding a hole throws. `Type.satisfies` and the `SatisfiesVisitor`/
`PatternMatchVisitor` pair are gone — an API removal, not a rename: the assignability relation
they computed has no consumer. This lands U5 (decisions.user.md) and supersedes §180's
within-kind assignability and §179's every/some row doctrine; §191's exact-match ruling is the
direction it completes.

_Owner-ruled (U5); Claude-recorded 2026-08-22._

---

## §195 — Union and intersection members store in one canonical order: kind rank, scalars, children

`canonicalMembers` (`libraries/primitives/src/Type/factory/factories.ts`) sorts composite members
with a fixed comparator instead of the token spelling — TS7's own `CompareTypes` shape translated
to this vocabulary, diverging only by carrying no declaration-order or id residue: a rank per kind — holes first, literals
last — then the kind's own scalars (name/from/tag/value, literal values by category then value),
then children pairwise (fewer first, then position by position, rows likewise). Identity
short-circuits the comparison; no declaration order and no id residue enters it. Literals ranking
last is load-bearing: it is what leaves a literal member as a union's last resort (§196) without
any literal special-case in the engine. Every visitor iterates `members` as stored and stays
agnostic of the rule; the parser accepts members in any order and canonicalization lands both
spellings on the one interned node.

_Claude-recorded 2026-08-22._

---

## §196 — Resolution is one exact-answer loop; a union settles by its first resolvable member; `AmbiguousUnionError` is gone

`PlannerVisitor.visit` inlines the exact-answer loop for EVERY request kind, a union's own
address included: `Registry.matching(type)` yields the registrations answering exactly that one
address — closed registrations by interned identity, open ones by §194 unification, newest first,
no union spread — and the first match whose `Plan.fromMatch` builds wins, an unbuildable
answer falling through to the next. Only when no answer builds does the per-kind step run, as
decomposition or synthesis, so a registration for a composite beats its parts.

A union with no answer of its own settles by its FIRST RESOLVABLE MEMBER in canonical order
(§195): each member runs the ordinary visit — its own registrations, then its synthesis — and
the first that delivers wins (owner-ruled 2026-08-22). No ambiguity error, no literal
special-case — literals order last among members, which keeps a literal member the fallback of
an optional dependency, and a registered nullish member wins like any other.
Plural suppliable members are settled by member order, deterministically, not raised.
`AmbiguousUnionError` (di.core and the di re-export), `ServiceProviderOptions.unionAmbiguity`,
`CallSiteContext.unionAmbiguity`, and the Engine/hosting threading are all removed. §112's
plan-build-time choice stands — the settled member is baked into the memoized plan, and a chosen
member that fails to construct fails the resolution (§158) — while its ambiguity-raise clause is
superseded.

Collections are union-agnostic: `visitArray`/`visitIterable` assemble the element's own answers
in registration order plus the element's one synthesis as the tail — never a member spread, which
`visitUnion` alone realizes. The provider and scope-factory intrinsics compare by
interned identity against the one declaring-module `typefor` address (U7) — the dual-spelling
accommodation is dropped. The cycle guard is a `using`-scoped disposer: entering a type pushes it
for the extent of the visit and a repeat throws `CycleError`.

_Owner-ruled (the rewrite plan); Claude-recorded 2026-08-22._

---

## §197 — The value door refuses an open address without a callable root

`Registration.value` throws on an address that still holds a generic hole UNLESS the
hole sits under a callable root — a ctor or func at the top, its tag stripped. One erased
callable honestly is every closing of its holes (the callable's behavior does not depend on the
hole, so handing the same function back for every instantiation is exactly right — the open
`() => Whatever<%T>` registration pattern); one instance is not, since a value registered for
`Box<%T>` would be handed back as every `Box<X>` while being none of them.

_Owner-ruled (the rewrite plan); Claude-recorded 2026-08-22._

---

## §198 — Inline discovery from the marker call; ownership claims faces; selection is the checker's resolution

The inline stage discovers entries from TWO channels, merged with duplicates removed on
(type, impl, member): each `registerInlineBodies<Receiver>(Set)` marker call yields one entry per
exported set member (the receiver from the type argument, its own type arguments stripped; the
impl from the owning package plus the set identifier), and the `rhombus-std` `inline.entries`
list stays for every shape — including the floater, which only it can express.
`@rhombus-std/di.extras`, `di.extras.options` and `config.extras` publish by marker alone;
`primitives.extras` keeps its floater entry in JSON.

A declaration is claimed by OWNERSHIP: a face belongs to a body iff the face's source file's
package (the nearest enclosing package.json, so src and rolled dist answer identically) is the
entry's impl package — a publisher declares nothing onto a receiver that is not sugar. Within one
publisher, bodies pair with faces per overload: an exact-signature body serves the face spelling
its discriminator, a rest-shaped body blankets the rest, and the pairing is loudly complete in
both directions (INLINE_FACE_WITHOUT_BODY / INLINE_BODY_WITHOUT_FACE / INLINE_BODY_COLLISION).
Selection at a call site is the checker's resolution, full stop: the resolved signature picks the
body, the engine performs no overload resolution of its own, and the marker-anchored shape
fallback is gone. Rest bodies are permitted, never required: a trailing rest group and the blind
`arguments` set splice into call argument lists, through both the spread call form and the
`.apply` form, each normalized to the direct call a hand author writes with the receiver written
once.

_Owner-ruled (issue #365 + its spec revisions); Claude-recorded 2026-08-22._

---

## §199 — A second loaded copy of primitives or di.core fails fast at module load

`@rhombus-std/primitives` and `@rhombus-std/di.core` each stamp a process-wide sentinel at entry
evaluation — `globalThis[Symbol.for('<package>/instance')]` holding the loading module's URL. A
re-evaluation of the same copy is silent; a genuinely different copy throws immediately, naming
both module URLs and the deduplicate remedy. This covers at runtime the duplicate-copy hazard the
identity invariant worries about — a second copy forking the augmentation registry or `Manifest`
identity — while every package keeps plain `dependencies` (peer-dependency recategorization is
ruled out as user-confusing). The white-box `./private/*` seam and the ttsc preload resolve the
same files as the barrel and never trip it.

_Owner-ruled; Claude-recorded 2026-08-22._

---

## §200 — `ScopeFactory<Lifetime>` is a callable interface returning a provider

The well-known scope-creation address in di.core is an interface with a bare call signature —
`(...lifetime: LifetimeArgument<Lifetime>): IServiceProvider` — not an object with a
`createScope` method. The resolved value IS the verb: a caller names the variable and calls it,
and can pass it around first-class. The interface (rather than a `Func` alias) keeps the address
nominal for `typefor`. Creation args reuse `LifetimeArgument`, so omission at creation compiles
exactly when `undefined` is admissible in the vocabulary — the same assignability rule as
registration — and no name/label arg exists: creation-only config that is not lifetime
vocabulary is model-side, a richer factory type beside the well-known address. The return is
primitives' generic-free `IServiceProvider`; lifetime-typed refinement belongs to the
engine-typed sugar surface. A model implements it as a factory whose own signature lists its
deps (`(sp) => lifetime => …`), the registration's lifetime selecting the parenting policy; the
foreclosed class door is a non-cost for the model-author-only implementer audience.

_Owner-ruled; Claude-recorded 2026-08-22._

---

## §201 — `add` reads the implementer per kind; the named `*Value` verbs are the forcing door

`add` reads an implementer the obvious way per kind, at both layers. Sugar:
`add<T>(implementer)`'s observed kind picks the door — ctor → class registration under its
instance type, func → factory under its return type, non-callable → value under its own type.
Explicit surface: the implementer-type argument names the ctor/func doors, and the two-argument
shape is the value door. Both hold uniformly across `add`/`tryAdd`/`replace`. A callable meant as data cannot say so by its own type, so the named verbs
`addValue`/`tryAddValue`/`replaceValue(address, value)` force the value path — and stay total
over non-callables. No positional door marker exists. The static gate is primitives'
`ButNot<T, Not> = T & (T extends Not ? never : unknown)` — an assignability veto usable in a
parameter position, where `Exclude` could only filter union members — spelled
`ButNot<Value, Func | AbstractCtor>` on the value faces, the callable universe including
abstract classes. The static layer is the enforcement layer — runtime
dispatch is arity-driven, admissibility stays type-only. Kind selection at the token layer is
per-shape registered contributions routed by mergesynth guards, never a hand-written kind
switch. `remove`/`removeAll` stay kind-free: removal is identification, not construction, and is
served by address or held registration.

_Owner-ruled; Claude-recorded 2026-08-22._

---

## §202 — A verb that changes nothing returns the receiver

Every manifest registration verb preserves identity on a no-op: `_remove`/`_replace` return the
receiver when nothing matched, and the augmentation layer's reduce-style verbs already seed with
the receiver. `===` therefore answers "did this change anything", and — since plans cache
against the manifest — an unchanged manifest keeps its cached plans instead of silently forking
them. The guarantee is documented on the `Manifest` interface; `_add` always changes, so it is
always new.

_Owner-ruled; Claude-recorded 2026-08-22._

---

## §203 — The realize walk stays opaque to lifetime vocabulary; audit is an addon behind a shared `beginWalk` hook

`RealizeVisitor` names no lifetime, scope, or audit vocabulary of its own: each addon reads only
the one strand it contributed, and the walk's binding does the same. `Construction` and `Hooks`
carry their `State` generic with no model-imposed bound — `State = unknown` — so the state a
lifetime model threads stays purely the vocabulary it invents for itself, never a shape
the walk constrains. An injected opening or a `{state}` answer that names no state is not normalized to
some empty sentinel; it stays `undefined`, and the addon that produced it is the one that reads
its own absence back.

`LifetimeModelError` is minted by the lifetime models themselves, wrapping a throw from their own
hook — the engine passes the throw through and knows nothing of the error type.

The `beginResolve(request, injected)` hook joins the one shared `Hooks` roster rather than opening
a second door: hooks stay together for now, and a dedicated interception point is minted only once
a genuinely foreign domain needs one of its own. `beginResolve` opens each resolution and answers
the state it runs under; a hook nobody files against composes to the identity, so a build with
none pays nothing for it.

Audit is an addon, `audit-addon`, not engine machinery. It registers `Audit` the same way
any other registration would — the placement ladder runs registration, then addon, before ever
reaching for an engine change — threads its own frame chain through its own strand via `{state}`,
and supplies the audit instance from `beforeConstruct` at the `Audit` address. The
consequence is that audit is install-to-use: without the `audit-addon` addon installed,
resolving `Audit` is `Unsatisfiable` like any other unregistered address. The dedicated
`audit-addon` plan kind and its planner-side synthesis do not exist.

_Owner-ruled; Claude-recorded 2026-08-27._

---

## §204 — One aggregated engine handler; Starfish composes by fold; providers are state-transforming closures

The engine holds exactly one handler, born of aggregation, carrying all four members
(`beginResolve`/`beforeConstruct`/`canonicalize`/`afterConstruct`) — never a list the realize walk
iterates. Its `realize` is a straight script: the single fork it runs is whichever the caller
supplied or, absent that, the one it builds itself: no branch-per-addon, no dispatch table.

The door files per bundle, not per hook: `useHooks` takes one `Behavior` whose up to four members
each accept either a plain handler function or Koa-style middleware with a trailing `next`,
discriminated by the filed function's declared arity. Every contribution composes by fold, not by
list-and-iterate-at-call-time; the built chain sits outermost and the first-filed bundle
innermost, so a scope's keepers — filed first, per request — run closest to the construction and
an addon middleware observing through `next` sees a scope-cache answer come back.

A provider is one closure that decorates the walk: it injects its own state at resolution-open,
which means `beginResolve` is, structurally, a state transformer — it receives the incoming state
and answers the state the rest of the walk sees, never a side channel. An addon that needs a
private compartment invisible to sibling addons packs that compartment itself, in middleware form,
closing over its own state; the platform manages no slots, roster, or namespace on an addon's
behalf.

An addon contributes its permanent hooks as data on its installation; the builder composes them
once into the built chain, so hook count at registration time costs nothing at call time beyond
the folds already paid for — never a runtime layer the walk must additionally step through.

`scope` names only the lifetime models' own vocabulary; `walk` names only the realize visitor's
traversal. Neither hook, provider, nor addon machinery borrows either word.

_Owner-ruled; Claude-recorded 2026-08-27._

---

## §205 — Capture-at-mint closures; every resolution opens through `beginResolve`; ambient scoping stays parked

A latebound closure and an invoker closure each capture the state at the position they were
minted, not the state the whole resolution opened under, and re-enter through that captured
value on every call. The model's `{state}` re-threading is what makes the mint position the
honest ownership state: a singleton's factory closes over the root-threaded state once and
keeps it for the life of the container, while a scoped service's factory closes over its own
scope's state — so a cached holder never smuggles a first caller's state into a later one.

Every resolution opens through `beginResolve(request, injected)` — a fresh top-level ask, an
invocation frame, and a latebound call alike, re-entries included, never only the outermost one.
This is the ambient-adoption seam: an opener that reads ambient state decides there, and nothing
downstream may bypass the handler to inject state directly. An addon that packs its own
compartment into the threaded state therefore has to recognize a re-entry that hands its own
pack back as `injected` — `audit-addon` does this by remembering every pack it has minted and
unwrapping to the inner state before folding in a fresh compartment, so a re-entered resolution
never mistakes its own bookkeeping tuple for someone else's ambient value.

Ambient scoping itself stays parked. Browsers have no `AsyncLocalStorage`, and TC39's
`AsyncContext` is still Stage 2, so an ambient lifetime model has no portable primitive to stand
on today. It arrives, when the platform does, as an outside node/bun-only package shipping an
ambient lifetime model plus its companion addon, authored against `di.core` alone — `di` and
`di.core` themselves stay unchanged.

---

## §206 — Resolution is a decorator stack; every provider is a just-in-time skin; middleware is builder sugar

The resolution surface is a decorator stack with the engine as its terminus. A builder-fed
`MiddlewareServiceProvider` is the captured head of that stack — the layer a builder assembled from
its own registered middleware, sitting in front of the engine and nothing else. An empty builder
composes an empty chain, and elides to the bare engine: a provider with no middleware pays no
wrapping cost, and defaults live in builders, never in the core.

Every provider a caller holds is a skin: the empty augmented `ServiceProvider` surface, minted
just-in-time over an internal open-speaking layer underneath. The skin carries no state of its
own — it exists to give the caller the augmented public shape over whatever internal layer is
actually doing the speaking.

A scope is a per-scope factory minting its own skin, and the skin carries the whole lifetime
implementation hardcoded to its scope: its keeper hooks ride each request as per-request filings
down to the engine. Those keepers are scope-local: they die with the scope's provider, and they
are never a door registration — nothing installs a scope's keeping into the manifest, because
nothing outside the scope's own lifetime should ever reach it.

The scope provider's per-request seed is what opens the resolution's state: it answers the
captured state where one exists — a re-entering closure keeps the world it was minted in — and
its own scope otherwise. There is no second path to a resolution's state; every opening goes
through the aggregated `beginResolve`.

Middleware is authorship sugar on the builder (`use`) — a way to add to the chain without
touching a decorator by hand. Decorators are the composition idiom itself, and carry no registration
API of their own: a decorator is written and wrapped, never registered. Starfish carries `useHooks`
and `getService` — file on the door, resolve through the door — and `bind` and
`Binding` do not exist, here or anywhere in this stack.

_Owner-ruled; Claude-recorded 2026-08-27._

---

## §207 — The observing surface is vocabulary-blind; the threaded data is named `state`; the head stands apart

`Middleware` — the curried decorator of the provider contract a builder composes — stands
in its own di.core module. There is no internal protocol type: the thing a container resolves
through is a plain `IServiceProvider`, and the lifetime-model contract's attach receives exactly
that.

The addon and hook surfaces carry no lifetime generic. `Addon` and `AddonInstallation` are
non-generic, and an installation's registrations are `Iterable<Registration<any>>`: a generic
addon takes its lifetime as an argument (`LifetimeArgument`) precisely because it cannot know the
container's vocabulary, so a type-level ferry of that vocabulary buys nothing the model's own
runtime read doesn't already enforce with a better error. The observing types — `Construction`,
the four handler/middleware families, `Hooks`, the `Starfish` door — are likewise
vocabulary-blind: `Construction.registration` is `Registration<unknown>`, and the one party that
interprets lifetimes, the model, narrows structurally the way `LifetimePolicy.classify` does. The
`Lifetime` generic survives only where vocabulary is authored: `LifetimeModel` itself, the
manifest, the builder.

`LifetimeModel.install()` deliberately does not share the addon installation shape. The model's
attach takes more (the raw head, because the model mints every user-facing provider over it) and
returns more (the container); expressing the model as an addon would hand every addon the head.
The asymmetry is the privilege boundary, not an irregularity.

The per-resolution threaded data is named **state** — the `State` generic on the observing types
and `Construction.state`. 'Context' names nothing in this stack; `Interception.state` and the
`injected` parameter keep their names.

_Owner-ruled; Claude-recorded 2026-08-27._

---

## §208 — Control asks; the lifecycle-aware engine; behaviors as windows and frames; the model is the scope provider

One-arg `getService` is the only resolution surface in the system — public providers, middleware,
the door, and the engine alike. Per-request hook bundles (`Behavior`: the four optional members,
each a plain handler or a trailing-`next` middleware by declared arity) reach the engine as
**windows**, opened by calling `useHooks` on the door a **control ask** answers with: `Control<T>`
is a public di.core class — `constructor(readonly service: T)`, the carrier idiom
`IOptions<T>.value` already established — and its address is always derived,
`typefor<Control<Starfish>>()`, never hand-minted.

The engine owns its lifecycle in one branch, ahead of planning and hooks alike. A control ask
counts as nothing: it runs no hook, opens no window, reads no frame, and answers
`new Control(freshDoor)`; a control ask whose payload is not the door takes the ordinary
unregistered path — handed on through the engine's `next`. Beneath the engine only the chain's
terminus stands — every addon's middleware composes above it — and the terminus raises the generic
`UnsatisfiableError`. An unmarked ask is a request: it folds every
open window and whatever frame is filed for its own address into the built chain (built chain
outermost, the filed frame innermost, windows between), seeds state through the aggregated
`beginResolve`, and realizes. No plan kind knows a magic address: a plain `Starfish` ask is an
ordinary, unregistered — therefore unsatisfiable — address.

The door is volatile: minted only by the control branch, fresh per ask, thrown away after. Its
`useHooks` member opens a window on the engine itself, not on the door — active from the call
until the returned disposable runs, never one-shot and never scoped to the door's own life. A
provider-answered door is rewrapped so that resolving through it routes through the answering
provider — keeping, middleware, and memo intact — while the engine-minted door's own `getService`
runs at the terminus.

Middleware speaks the provider contract itself: curried single-arg `(next) => (request) =>
unknown`, composed once over the static terminus — so an installer-style factory that resolves
through its `next` at composition time runs exactly once. Control asks travel the chain as
ordinary traffic; a middleware may observe them and may make its own. Addons contribute
registrations, permanent hooks as data, and `atBuild`; nothing attaches imperatively.

The lifetime model IS the scope provider. `install()` yields an attach that mints the root
provider over the container's inner, and the scope-factory registration; each provider hardcodes
its scope, files keeper and probe per request as one address-keyed frame, seeds `injected ?? scope`
(a re-entering closure keeps the world it was minted in), keeps its scope's instances on the scope
object itself, and fronts a learned memo of top-level KEPT answers — a registration whose lifetime
keeps in no scope never enters it — that bypasses the whole chain only when no window is open. The
memo consults a di-internal window-awareness seam, `IEngineHooks.hasOpenHookWindow` (engine and
middleware provider alike), never a public member. Latebound and invoker closures capture the
aggregated hooks and state at mint; re-entries never touch the filed-frame list.

_Owner-ruled; Claude-recorded 2026-08-28._

---

## §209 — The door carries two members; a window stands until disposed; a scope's keeper rides an addressed frame, not a window

`Starfish` carries exactly `getService(address)` and `useHooks(bundle): Disposable`. The four
per-kind filing verbs do not exist: one method puts a `Behavior` bundle in effect, and the
`Disposable` it returns is the only way to take it back out. A bundle is active from the call that
installs it until the returned disposable runs — active-until-dispose, not one-shot — and a
resolution opened anywhere inside that window, including one opened from inside a construction the
window itself triggered, runs under it.

A one-stage surface won this over a two-stage split. A define-once/activate-per-ask design was
weighed and cut as speculative: its only conceivable consumer, per-request middleware hooks, has
no present need, and the audit addon (§203) already fits the plain install-and-observe shape one
stage gives it. Dispose is the only deactivation; there is no `deactivate` verb, because
identity-keyed removal would force a caller to hold a reference just to tear its own activation
down, and would just as easily let any other holder of that reference tear it down instead — a
per-activation disposable carries no such aliasing. A caller that discards `useHooks`'s return
without ever disposing it leaves the bundle active for the container's life; that is the code
doing exactly what it was told, not a leak to guard against.

`Engine.getService` snapshots every open window at entry, folding them into the one `Hooks` the
resolution runs under for its own life. A resolution that opens while a window is held — a
latebound closure invoked later, a re-entrant ask fired from inside a construction — keeps the
hooks captured at the position it was minted, however late it actually runs. The engine is
synchronous end to end throughout, so a promise-valued product passes through every hook opaque,
and no hook ever fires inside an async continuation.

The owner's ruling on how far a provider may reach is absolute and quoted verbatim: "NOTHING, no
data, no callstack, NOTHING may traverse into the engine concrete outside of
`IServiceProvider.getService(Type)`." Every provider standing over the engine — the middleware
chain, a scope's provider, the lifetime model's own `attach` — is wired at composition with a
plain `IServiceProvider` and nothing more; intersecting a provider's declared type with an
internal seam to smuggle a second member past the door is itself the violation, not a workaround
for one. The owner's own clarification draws the line the law needs to be usable at all: "the
control services aren't violations bc they themselves came from getService" — the engine's
machinery is reachable, but only by asking for it through `getService` like any other address,
never by holding a typed reference to the concrete `Engine`.

That machinery is two control services, not one, each its own address. `Control<IEngineHooks>`
answers the DEFINE stage — `useHooks(hooks): HookHandle`, pure minting: it folds a set of
`Behavior`s into one inert, reusable handle and touches nothing live. `Control<IEngineHookState>`
answers the STATE stage, extending `IActivatable<HookHandle>` with `hasOpenHookWindow`.
`IActivatable<Handle>` is the reusable shape of any setup-then-activate control surface: a
definition side mints a handle once, out of whatever vocabulary it speaks; `activate(handle):
Disposable` brackets one use of that handle, and disposing ends exactly that activation and no
other.

A `ScopeProvider` asks for both controls exactly once, at construction: it folds its keeper and
its probe into one handle through `IEngineHooks.useHooks`, then brackets every forwarded ask with
`using … = hookState.activate(handle)`. Fold order among activations is LIFO — the newest bracket
still open is the innermost, nearer the walk than one still enclosing it — with every public
window standing outside all of them and the built chain outermost still. Probing learns only what
its OWN scope kept, gated on `selectOwningScope(...) === scope`, so a construction a nested scope
owns never teaches the scope enclosing it anything. The traversal-attribution consequence this
still carries is re-derived from the brackets themselves, not from any address-tracking mechanism:
everything resolved while a bracket holds — a middleware's own rewritten forward, a pre-resolve
made through the container, `next` called twice — runs under it, because a bracket stands over the
engine itself and not over any one address; a `next` invoked after its own traversal has already
returned finds no bracket open, and resolves under nothing but the built chain and whatever public
windows remain.

A scope's learned-answers memo is bypassed outright while any window is open — the check is
`IEngineHookState.hasOpenHookWindow`, read before the provider ever activates its own handle —
while an activation for the scope's own keeping never inhibits it.

Seven questions stand open, not settled. `atBuild` hands every addon the raw `Engine` concrete
rather than a door — `installation.atBuild?.(engine)` passes the instance itself, and the
validation addon reads `engine.registry` straight off it — which is exactly what the single-door
law forbids, and undesigned: nobody has fixed it yet. A control ask a provider makes at its own
construction travels the same chain a plain resolution would, an owner ruling — controls travel
through the chain like anything else — whose measured consequence is that a middleware body runs
during `build()`, before the container exists to anyone, and a middleware that answers an
unrecognized address itself, rather than forwarding it, breaks `build()` outright; accepting that
or narrowing it is the owner's call, not yet made. The observing surface cannot tell "answered
from keeping, and by which scope" apart from "freshly constructed": `canonicalize` and
`afterConstruct` never run at all on a kept answer, only a middleware-form hook can even see that
an interception happened, and the learned-answers fast path bypasses every hook a build installed,
an auditor's included — if an auditor ever needs that visibility, a roster event is the
placement-ladder rung to reach for, not an engine change. `Scope.provider` is a public, mutable
field, written as a side effect of the `ScopeProvider` constructor rather than handed in. An
interception's `{ state: undefined }` is documented legal, yet the keeper reads its incoming
state unconditionally, so a hook upstream of it that answers exactly that crashes the keeper
instead of falling through. `Starfish.useHooks` and `IEngineHooks.useHooks` share one name for
opposite things — the door's version opens a window immediately and hands back its end, the
machinery's version only mints an inert handle for a different member on a different interface to
activate later — a rename-batch candidate. And a control's address derives from the type that
names it, `IEngineHooks` and `IEngineHookState` included, both living under an internal,
unpublished module path, so an error naming that address in text a published consumer can see
cites a specifier nothing outside the package can resolve.

_Owner-ruled; Claude-recorded 2026-08-28._

Addendum, same day: the augmentation install is the public wrapper's alone — only
`ServiceProvider`, the public-facing provider, carries `@augment(typefor<IServiceProvider>())`
(owner: "only the jit wrapped, public-facing ServiceProvider gets augmented"). The internal
implementers — `Engine`, `MiddlewareServiceProvider`, `ScopeProvider` and its bound starfish,
`VolatileStarfish` — install nothing, so the layered `resolve`/`resolveMany` verbs exist at
runtime only on the surface a consumer holds. And an interception's members are `result` (an
answer standing in for construction) and `state` (what the construction's dependencies resolve
under) — `instance`/`within` presumed use the value never promised (owner: "within makes
assumptions about how the state is going to be used"); the engine-product `instance` parameters
of canonicalize/afterConstruct keep their name, where it is accurate.

## §210 — Lifetime classification ranks numeric keeper tiers; the three-word vocabulary belongs to the standard model alone

`LifetimePolicy.classify` answers `{ tier, label } | 'unkept' | undefined`: tier 0 is the
container root and a higher tier a narrower keeper, `label` is the tier's human name for error
text, `'unkept'` means constructed per ask and kept by nothing (transparent to captivity in both
directions — never captive as a dependency, looked through as a consumer), and `undefined` means
the lifetime is model-defined and ranks only at runtime (owner: "undefined isn't opt-out, it's
model defined"). The validator flags a captive wherever a kept registration's subtree constructs
one kept by a strictly narrower tier, the nearest kept ancestor serving as the keeper context —
so a model with several nested tiers gets inter-tier captivity detection the words could not
express (owner: tiers "accomplish the same validation, but more generalized"; implemented on his
"fix the classifier if you're confident that it's correct"). `StandardLifetime` thereby stops
being the validator's vocabulary and lives beside the `standard` model in `di`, exactly as
`TaggedLifetime` lives beside `tagged`; di.core's `LifetimeModel.ts` keeps only
`LifetimeArgument`, `LifetimeModel`, `LifetimePolicy`. The engine-hook vocabulary
(`Construction`, `Interception`, the handler/middleware pairs, `Hooks`, `Behavior`) is not
lifetime material and lives in `di.core/src/hooks.ts` (owner: "the majority are not lifetime
related (just bc lifetime uses them doesn't count)").

Validation itself belongs to each model rather than to a shared addon reading this policy — see
§229, which is where the error's wording is answered.

_Owner-directed; Claude-recorded 2026-08-28._

## §211 — One stateful install list replaces Starfish; permanent vs scoped is only where useHooks is called

There is one hook door and one install model. `Control<IEngineHooks>` — now a public `di.core`
interface — is the single control the engine answers for hook access; `Starfish` is gone.
`IEngineHooks.useHooks(hooks: Behavior): Disposable` installs `hooks` immediately, over every
resolution the container answers from that point on, and disposing the answer uninstalls exactly
that install. Permanent installation and scoped installation are not two mechanisms — they are the
same call, differing only in where it is made and whether the disposer is ever run: held for the
container's life, or bracketed in a `using` block. The owner's own framing: "drop the starfish
interface. all hooks ALWAYS install immediately, and are ALL uninstallable via a disposer returned
from the useHooks call. permanant installation vs getService scoped is just in _where_ it's called
and _if_ it's disposed." And on the mechanism itself: "why don't you just keep a stateful array of
hooks on the engine, and dispose removes them the list referentially?"

The engine keeps exactly that: one `#installed: HookLayer[]`, seeded at construction from the
built chain's own behaviors, appended to by every later `useHooks` call, and spliced by referential
`lastIndexOf` when a disposer runs — the same disposer shape the removed `activate` used, now the
only shape there is. Folding a resolution's hooks is uniform LIFO: the most recently installed
layer stands innermost, closest to the construction, and the earliest-installed layer — the built
chain — stands outermost, `installed.reduceRight(layered, identity)`. There is no separate
"window" tier and no separate "activation" tier standing at different distances from the walk; an
install is an install, and its distance from the walk is purely a function of when it was made
relative to everything else still installed.

`ScopeProvider` asks for `Control<IEngineHooks>` once, at construction, and stores the handle
alongside its own `keeping` and `probing` behaviors — minted once, installed fresh around every
forwarded ask: `using _probing = hooks.useHooks(probing); using _keeping = hooks.useHooks(keeping);`
before `#inner.getService(address)`. Installing probing first and keeping second keeps keeping
innermost, matching the order the prior activation handle held its own entries in. Every control
ask now passes straight through this provider unchanged — there is no `Control<Starfish>` branch,
no `ProviderBoundStarfish`, no special case at all: "no special cases" is the standing rule, and
the single-door model means a control reaching this provider needs nothing done to it.

The scope's learned-answers memo now serves unconditionally, before any bracket is installed: "the
short circuit SHOULD bypass EVERYTHING, including hooks. later, if we need, we can add a
configuration option to disable it." A future opt-out is a config knob to add when a use case
demands it, not a branch to pre-build now.

Deleted: `Starfish` (di.core), `VolatileStarfish`, `IEngineHookState`, `IActivatable`, the
`ProviderBoundStarfish` class, `HookHandle`, `aggregateHooks`, `Engine#activate`,
`Engine#openWindow`. `aggregate-hooks.ts` keeps `hookLayer`, the identity chain, and the four
compose functions, and now exports one fold, `foldHooks`.

This also closes the private-specifier concern the hooks control ask used to carry: `IEngineHooks`
lived under an internal, unpublished module path, so an error naming that control address in text
a published consumer could see cited a specifier nothing outside the package could resolve.
`IEngineHooks` is now `di.core` public surface, so the address it derives from is one every
consumer of the package can already resolve.

_Owner-ruled; Claude-recorded 2026-08-28._

## §212 — The addon contract is `create(): { middleware, registrations }`; the lifetime model mints its own machinery the same way

An addon and a lifetime model both mint their contribution to a build through a member named
`create`, and an addon's hooks are named `middleware` — one hook shape, one verb, named the same
wherever it appears. The owner's own framing: "the 'addon' contract will now be
`di.useAddon(addon:{create():{middleware:Func<...>, registrations:Iterable<Registration<any>>});`.
lifetime model _could_ follow this pattern, but it's a special case bc the builder needs to
forward the generic arg to the registration builder (i.e. manifest). we need to get validation to
conform next -- let me look over what it does. go ahead and refactor the audit service into this
shape."

`Addon.create(): AddonInstallation` replaces `install()`; `AddonInstallation.middleware`
replaces its `hooks` member, `registrations` and `atBuild` keep their names and shapes.
`ContainerBuilder.withAddon` becomes `useAddon`, matching the verb an addon mints through.
`LifetimeModel.create()` replaces `install()` too, named in lockstep with the addon contract, and a
lifetime model folds into the addon list the same way anything else does: `usingLifetimeModel`
opens a builder and calls `useAddon` on the model itself. The `Lifetime`-generic-forwarding concern
the quote above raises dissolves the same way an ordinary addon's registrations already dissolve
it — `AddonInstallation.registrations` is `Iterable<Registration<any>>`, and the one call site that
knows what `Lifetime` is casts it there, same for a lifetime model as for anything else.

`auditAddon` conforms fully: its `create()` returns `{ middleware: {...}, registrations: [...] }`,
and its placeholder factory's error now names `useAddon` and `middleware` rather than the retired
`withAddon`/`hooks` spelling. The `validation` addon renames `install()` to `create()` and its
error text's `withAddon` mention to `useAddon` — nominal conformance only. It does not yet answer
through the addon-mint shape the way `auditAddon` does; the owner is reviewing what `validation`
should look like under this contract next, so `AddonInstallation.atBuild` stays in the contract
for now, read only by `validation`'s own installation, until that review lands.

_Owner-ruled; Claude-recorded 2026-08-28._

## §213 — An addon's `middleware` is a `Middleware`; `atBuild` is gone; a permanent hook installs itself through the same door a scope does

`AddonInstallation.middleware` is a `Middleware` — the ordinary request-grain kind the
builder already composes around the engine from `use()` — not a `Behavior`. The owner's own
correction: "yes, the member i named middleware is suppoed to be a middleware. didn't think i'd
need to say that." An addon wanting a permanent hook plants it itself, at build, through the same
door a scope's own keeping installs through: its middleware asks for `Control<IEngineHooks>`
through `next`, calls `useHooks` on what comes back, and returns `next` unchanged — stepping aside
once its install-time work is done. `auditAddon` is the shipped example; nothing about the
engine or the builder singles out "addon hooks" as their own kind of contribution any more — an
addon that wants one installs it exactly the way anything else would.

`atBuild` is deleted from `AddonInstallation`, and `Engine`'s constructor drops its `builtChain`
parameter — `#installed` now starts empty and grows only through `useHooks`, whoever calls it and
whenever. `use()` and `useAddon()` feed one middleware list in builder-call order, the first call
composing outermost; an addon's own middleware, if it mints one, takes its place in that same list
at the position `useAddon` was called, not a separate earlier-composing tier. Concretely, the
builder now stores one ordered list of thunks — one per `useAddon`/`use` call — each minting an
`AddonInstallation`-shaped value at build (`{ middleware }` alone for a plain `use()` call, the
addon's own `create()` result for `useAddon`); `build()` maps that list once, reads `registrations`
off every entry the way it always did, and reads `middleware` off every entry the same way,
composing them into the one chain `MiddlewareServiceProvider` already knew how to build. No
`atBuild` loop remains to delete anything from.

A second control answers the manifest a container resolves against: `typefor<Control<Iterable
<Registration<unknown>>>>()`, answered with `new Control(this.#registry.registrations)` — the
registry's own frozen array serves as the iterable, a read-only view built from public types alone.
`typefor` derived this spelling cleanly on the first attempt; the `Control<Manifest<unknown>>`
fallback the spec allowed for was never needed. `validation` is this control's first consumer: its
middleware asks for it through `next`, builds a fresh `Registry` from what comes back, and sweeps
that — `validateBuild` now takes a `Registry` directly, its `instanceof Engine` guard and the
`TypeError` it threw both gone, since nothing about validating a registration set needs the engine
concrete any more. The sweep logic itself (`captivePairs`, the classification walk) is untouched —
shape conversion only, pending the owner's own review of what the sweep does.

One internal accommodation the spec didn't name: `askForControl`'s `provider` parameter narrows
from `IServiceProvider` to `Pick<IServiceProvider, 'getService'>`, since a middleware only ever
holds `next` — a bare dispatch function, not an object carrying the augmented `resolve`/
`resolveMany` members `IServiceProvider` types as having. The function reads nothing but
`getService` either way; only its parameter's declared width changes, and every existing call site
(a real `IServiceProvider`) is trivially assignable to the narrower type.

_Owner-ruled; Claude-recorded 2026-08-28._

## §214 — The pipeline type is named `Middleware`, unqualified; the hook-stage names stay qualified

`ResolveMiddleware` is `Middleware` now — `libraries/di.core/src/ResolveMiddleware.ts` renamed to
`Middleware.ts`. The owner's own reasoning: "`ResolveMiddleware` is a bad name bc it has that
installer stage, optionally modifying the resolve pipeline. call it either DiMiddleware
(DIMiddleware? they're both kinda ugly) or just plan Middleware." `Middleware`, unqualified, is
what shipped: the container has exactly one pipeline type, so it needs no qualifier to tell it
apart from anything else in scope. The hook-stage names — `BeginResolveMiddleware`,
`BeforeConstructMiddleware`, `CanonicalizeMiddleware`, `AfterConstructMiddleware` — stay qualified,
since those four sit alongside four differently-shaped handlers on `Hooks`/`Behavior` and the
`Resolve`/`Construct`/`Canonicalize` prefixes are what tells one apart from another; nothing about
this rename touches them.

`Middleware.ts`'s own doc now states plainly what the type covers: a factory that composes once, at
build, and may do install-time work of its own there — planting a permanent hook, sweeping the
manifest — before answering the function each request runs through. Every consumer follows the
rename: the `di.core` barrel (alphabetical position moves from after `Audit` to between
`Manifest` and `Registration`), `Addon.ts`, `di.ts` (the `use()` member and its implementation),
`di`'s own barrel re-export, and `MiddlewareServiceProvider.ts` — whose own class name is untouched,
since it names what the class does (compose middleware around a provider), not the type it composes.

_Owner-ruled; Claude-recorded 2026-08-28._

## §215 — The head every provider tracks is a plain func; the model mints it through the same middleware every addon does

The container's tracked identity collapses to `Func<[Type], unknown>`, not an `IServiceProvider`.
The owner's own reversal, verbatim: "i think i want to change `LifetimeModel.create` to return a
normal middleware, and change the ServiceProvider ctor to `class ServiceProvider {
#getService:Func<[Type], unknown>; constructor(source:IServiceProvider|Func<[Type], unknown>);
}`. this reverses what i said before about 'decorator pattern being king'. the head that's being
tracked will be just a func, not an sp." `ServiceProvider` normalizes whatever it is handed —
`typeof source === 'function' ? source : address => source.getService(address)` — into one held
call, and every ask forwards through it; it remains the package's one `@augment` carrier.

`LifetimeModel.create()` answers the addon shape, `{ middleware?, registrations? }` — `attach` and
`scopeFactory` are gone. A model's `middleware` composes exactly like any other: it receives `next`
(what `attach` used to receive as `inner`, renamed to match every other middleware's own parameter)
and answers what runs in its place. Choosing a lifetime model is the builder's first call, so its
middleware is the first entry in `di.ts`'s one middleware list — `[modelMiddleware, ...installations
.map(...)]` — and the standing rule ("first call composes outermost") places it outermost without
a special case for models at all. `registrations` files at the floor, exactly where `scopeFactory`
used to. `build()` folds that one list with `reduceRight` around `address => engine.getService
(address)` and hands the result straight to `new ServiceProvider(head)` — one mint site, unconditional,
closing the open wrap-coverage question `MiddlewareServiceProvider` used to leave: an empty
middleware list needs no identity-elision branch, since folding zero middlewares around the base
function returns that function unchanged. `MiddlewareServiceProvider.ts` is deleted; the fold it
existed for is the same three lines inline in `build()`.

`standard`'s and `tagged`'s root-scope machinery — mint the root, answer where a later ask sits
relative to it — was identical between them but for how a child scope's own constructor is called,
so it is now shared plumbing, `anchorRoot(kind, root)` in a new `models/root-anchor.ts`, returning
`{ middleware, enclosingScope, openChild }`; each model supplies only its own `openFrom` closure and
child-construction call. `noop` needed no change — `{}` already satisfied the new shape.

Two picks the owner left to my judgment, both flagged for his review rather than decided quietly:

_The `resolvesFrom` replacement._ `ScopeProvider` — the class that used to BE the per-scope
`IServiceProvider`, letting `instanceof ScopeProvider` answer "is this ours" — is gone; the class
dropping out of the provider-decorator role is the whole point of this ruling. What replaces it,
`ScopeBinding` (`models/ScopeBinding.ts`, renamed from `ScopeProvider.ts`), mints a scope's bracket,
its memo, and a `new ServiceProvider(dispatch)` face, and records the pairing in a module-private
`WeakMap<IServiceProvider, ScopeBinding>`. `resolvesFrom` keeps its name, per the brief, but its
signature changes from a type predicate (`container is ScopeProvider<S>`) to `S | undefined` — the
scope itself, when `container` is a face this module minted and it resolves from a scope of `kind`,
`undefined` otherwise. A caller wanting only the yes/no reads it as truthy; `root-anchor.ts`'s
`enclosingScope` wants the scope itself, so the richer answer serves both without a second lookup.

_The `scope.provider` face, and what it costs._ `Scope.provider` (read by `keeping`'s
`beforeConstruct` to answer an `IServiceProvider` slot) is now the `ServiceProvider` `ScopeBinding`
mints for that scope — the honest, augmented face, as ruled — rather than an internal object with no
`resolve`/`resolveMany` sugar. The concrete consequence: for the ROOT scope specifically, this face
is a DIFFERENT `ServiceProvider` instance than the one `di.ts`'s `build()` mints when it wraps the
final folded `head` — both close over the identical dispatch function underneath (so both resolve
every address identically), but they are not `===`. The smoke harness's two identity assertions on
an injected root-scope `IServiceProvider` (`x.provider === container`) had to become behavioral
checks (`x.provider.getService(K) === container.getService(K)`) to keep passing. This is a direct
reading of the ruling as given — "Container = `new ServiceProvider(head)`" is unconditional, no
special case reusing a scope's own minted face — but it is a real, observable shape change from the
prior single-object-per-root-container invariant, worth the owner's eyes before it settles.

Alongside the reshape: the interface `ChainAddon` renames to `Addon` — `libraries/di.core/src
/ChainAddon.ts` moves to `Addon.ts`. `AddonInstallation` keeps its own name; only the addon contract
itself was named `ChainAddon`, and nothing about what it describes changed. Every reference follows:
the `di.core` barrel (alphabetical position moves ahead of `brands`), `di.ts`'s `useAddon` parameter,
and both addons (`auditAddon`, `validation`).

_Owner-ruled; Claude-recorded 2026-08-28._

## §216 — The builder holds exactly two dimensions: registrations steps and addon steps, both replayed at build

`DefaultContainerBuilder`'s only private state is `#manifestSteps` (one `configureServices`
delegate per call — the registrations dimension) and `#steps` (one `useAddon`/`use` thunk per
call — the addon dimension, each minting an `AddonInstallation` when replayed). No `#lifetimeModel`
field exists. The owner's own two edits, preserved verbatim: `usingManifest` is
`return this.configureServices(man => man.add(manifest));`, and `usingLifetimeModel` is
`return new DefaultContainerBuilder<Lifetime>().useAddon(lifetimeModel);` — a lifetime model is an
addon, full stop, as §212 also records; nothing distinguishes it from any other `useAddon` call, and
`useAddon` itself just appends the thunk, with no destructuring at the call site.

`build()` replays both lists: `Iterator.from(this.#steps).map(step => step())` runs `addon.create()`
once per build, files each installation's registrations newest-first above the previous — the
model's own installation is always first, so its registrations land at the floor and every later
addon files above it — then folds `#manifestSteps` over that, mints the `Engine`, and
`reduceRight`s every installation's middleware around `address => engine.getService(address)`; the
model's own middleware wraps outermost purely by being the first installation. `usingManifest` no
longer discards prior configuration: forwarding through `configureServices` files the given stream
ahead of whatever is already configured, layering rather than replacing.

**`Manifest.add` gains an iterable overload, and it did not exist before this**:
`add(registrations: Iterable<Registration<Lifetime>>): Manifest<Lifetime>`, delegating to `apply`
so a multi-element stream keeps its own order at the front of the chain — what the owner's own
`man.add(manifest)` call binds to. `Manifest.ts` declares only the underscore-prefixed
`_add`/`_replace`/`_remove` as `DefaultManifest`'s real primitives; every public `add` shape,
singular included, already lived entirely in `Manifest-Registration-augmentations.ts`, confirmed by
reading that file before adding this one beside it, in its own `registerAugmentations` call next to
the single-`Registration` primitive.

_Owner-ruled; Claude-recorded 2026-08-28._

## §217 — Validation is three independently installable middlewares, one per check

The aggregate `validation(policy)` addon is gone; `validateUniversalAddresses()`,
`validateBuildability()`, and `validateCaptivity(policy)` replace it, each its own `Addon`, each
throwing its own `ManifestValidationError` over only its own failure kind. The owner's own ruling:
"there should be a validation middleware for each validation so that the user can custimize. we'll
prob make an 'options' surface in the di builder that selectively installs them, but not now.
commit validations soon as they fit that bill." That options surface is explicitly deferred — this
pass installs the three as ordinary addons, `useAddon`ed individually, nothing scaffolded toward
selecting a subset for the owner later.

`validateUniversalAddresses` rejects a registration addressed by nothing but a hole; needs no
policy. `validateBuildability` plans every closed address, failing the ones that don't build; needs
no policy. `validateCaptivity` walks every address that DID build for captive pairs, reading
lifetimes through the `LifetimePolicy` it takes. The shared plumbing — the manifest control ask
into a `Registry`, and enumerating every closed address's plan-or-error — is private to the file
(`registryOf`, `planClosedAddresses`); `validateBuildability` and `validateCaptivity` both consume
`planClosedAddresses`'s output, filtering to the error branch and the plan branch respectively, but
install and fail wholly independently of each other. The sweep logic itself — the captive-pair walk,
the tier classification — is unchanged, byte-for-byte where it isn't just reshaped around the split;
it is still awaiting the owner's own review of what it does, same as before the split.

`hosting` was the aggregate's only outside consumer, already gated red on a `withAddon` call site
that predates the `useAddon` rename — it adapts to the split when that package's own review lands,
not here.

_Owner-ruled; Claude-recorded 2026-08-28._

## §218 — `add` carries three overloads, `ButNot` forking the batch shapes; `apply` and `addMany` are both gone

`Manifest.add` is three overloads, one name: `add(registration: Registration<Lifetime>)`, unchanged;
`add(manifest: Manifest<Lifetime>)`, the order-preserving wholesale merge — `new DefaultManifest(()
=> concat(manifest, this))`, the stream's own order landing intact ahead of everything already in
the chain; and `add(registrations: ButNot<Iterable<Registration<Lifetime>>, Manifest<any>>)`, the
consecutive-adds fold `addMany` used to be — each filed in turn, the last ending up newest. There is
no `addManifest`; an intermediate design step minted one, and the owner overruled it: "actualy,
should we just overload add on Manifest for the order behavior?" then, settling it, "that's what
ButNot is for." `apply` is deleted outright, both overloads, face and implementation — "get rid of
apply, i never sanctioned that. do the work at the callsite." `addMany` stays deleted, renamed into
`add`'s own consecutive-adds shape, per the owner's original framing: "either way, only one should
exist. `add` is better if it's safe. need to make sure the `add<T>(value)` version in extras doesn't
hog."

**The runtime dispatch cannot tell `add(manifest)` from `add(registrations)` at all — proven, not
assumed.** A throw planted in each contribution showed the `Manifest`-shaped handler never fires,
for any call, including one whose STATIC argument type is `Manifest<Lifetime>` outright (`usingManifest`
itself). Every call to `add` with one iterable-shaped argument lands in the consecutive-adds
contribution, full stop; the separate `Manifest` contribution exists for the static overload set to
have a corresponding implementation and stays correct if the dispatch is ever fixed to actually
route to it, but today it is dead code. What makes the merge behavior real is the owner's own
sanctioned mechanism: "the iterable overload can do an instanceof test to be extra safe" — the
consecutive-adds body opens with `registrations instanceof DefaultManifest`, and reroutes to the
identical order-preserving merge when it fires. The guard is a concrete-class test, not a structural
one: a third-party `Manifest` implementation that isn't a `DefaultManifest` instance would fall to
consecutive-adds instead of the merge — accepted, and now documented rather than silently true. The
same throw-per-contribution technique confirms a bare `Registration` also lands in the
consecutive-adds contribution by default, not the dedicated `add(registration)` one — harmless, since
`concat`'s accept-permissive single-value handling plus the `_add`-direct fold answer it correctly
regardless.

`ContainerBuilder.usingManifest`'s parameter narrows from `Iterable<Registration<Lifetime>>` to
`Manifest<Lifetime>` — **a public builder signature change, flagged**: its own contract ("iteration
order is registration order, exactly as a `Manifest` iterates") is the order-preserving merge, which
only the `Manifest` overload's static type binds crisply; a bare array handed to the old signature
would have compiled fine while silently taking the reversing consecutive-adds path. Line 66 keeps
the owner's own original spelling, `man.add(manifest)`; now that `manifest` is statically a
`Manifest<Lifetime>`, that line binds the merge overload.

Made safe: `di.extras`'s type-driven value sugar, `add<ServiceType>(value: ButNot<ServiceType, Func
| AbstractCtor | Registration<any>>)`, extends its exclusion to `ButNot<ServiceType, Func |
AbstractCtor | Registration<any> | Iterable<Registration<any>>>` — both the `declare module` face
and the `ManifestRegistrationValueAugmentations` marker body; a `Manifest` is itself an
`Iterable<Registration<any>>`, so it is covered by the same exclusion without a further change. No
ttsc e2e fixture exercises the bare single-argument `add<T>(value)` sugar form with a plain value
(every fixture touching the value shape goes through the explicit `addValue<T>()` door instead), so
nothing in the parity suite changes.

**A real dispatch bug, found and fixed along the way, not just a rename.** Giving `add`'s
consecutive-adds body `addMany`'s old fold exposed that a bare `Registration` handed to `add` was
ALWAYS routing to the iterable overload at runtime, never to the single-`Registration` one; the two
have shared this ambiguity since the iterable overload was introduced. It stayed invisible because
the iterable body used to delegate to `apply`, which built its result with `concat`, whose own
accept-permissive design (`isIterable(p) ? p : [p]`) silently treats one non-iterable item as a
one-element sequence — masking the mis-route by accident rather than resolving it. A body that
genuinely iterates has no such forgiveness and threw outright; a first fix that only wrapped the
argument in `concat` for the same forgiveness still recursed infinitely, since the fold's own
`man.add(registration)` call hits the identical mis-route on every element. The fix: `add`'s
consecutive-adds body, and `tryAdd`'s identical fold, both call the manifest's own `_add` primitive
directly instead of re-entering the ambiguous `add` — the same primitive `add(registration)`'s own
handler already calls. `replace` and `tryAdd`'s other internal recursions were checked and are not
ambiguous the same way (neither has a competing overload sharing its argument shape).

**Executable proof, not code reading** — three smoke cases: `add(aManifest)` on a source whose own
newest wins the merge; `add(anArray)` on the same two registrations, where the array's LAST element
wins instead (consecutive-adds); and a `Manifest` assigned to a variable statically widened to
`Iterable<Registration<...>>`, forcing TypeScript itself to bind the consecutive-adds overload,
still landing on the order-preserving merge at runtime — the exact case the `instanceof` guard
exists for, proven rather than reasoned about.

`addMany`'s dependers — `options.augmentations`, `caching.memory`, `logging`, `logging.config` —
are untouched and go red on this; they are the owner's own gated adaptation zone, migrating their
`addMany` manifest-merges to `add(manifest)` when their own review lands — their existing usage was
silently order-reversing relative to what `add(manifest)` gives, so the migration is a correctness
fix for them too, not just a rename. `di.core/README.md` still names both `addMany` and `apply`,
left as-is for the same reason — prose, not code, outside this pass's scope.

_Owner-ruled; Claude-recorded 2026-08-28._

## §219 — A scope's memo learns only the address its own dispatch was asked for; a noop container's injected provider is the augmented face

`ScopeBinding`'s learned-answers memo commits only a construction whose address AND instance both
match what its own `dispatch` call actually returns — address alone is not enough. `#dispatchedAddress`
holds the address the innermost `dispatch` call on the stack was asked for; `#pending` holds the
`[address, instance]` pair `probing`'s `learn` callback proposes for it, provisional until `dispatch`
compares it against its own `next(address)` return value and commits it to `#learnedAnswers` only on
a match. Both fields shadow and restore around a nested `dispatch` through the same binding the same
way, in the same `finally`, so a unit of work opened from inside another still proposes under its own
address and instance, exactly as before. A construction reached along the way with a different
`populatedAddress` than the dispatch it was reached under — a collection member sharing its element's
address, a nested address a `use()` middleware answers specially at the top level — is never even
proposed. But address match alone isn't proof the proposal IS the dispatch's answer: a lazily-drained
collection (`visitIterable`'s deferred realize, running through hooks captured at an earlier,
unrelated dispatch) can realize an element sharing the CURRENT dispatch's own address while that
dispatch is still on the stack, coincidentally matching on address while proposing an instance nobody
asked for. The identity check is what refuses that proposal while still committing the dispatch's own
real answer. Two consequences follow, accepted: a `use()` middleware that decorates its own address is
never fast-pathed here — the raw instance `probing` sees is never the decorated instance the
middleware hands back, so the memo never commits and the middleware keeps running on every ask, with
correctness intact regardless since this memo bypasses everything for what it does learn — and a
union-addressed ask never memoizes at all, since `populatedAddress` is the resolved member, never the
union asked for; perf-only, since the scope's own instance map still answers it correctly.

A `noopLifetimeAddon()` container's injected `IServiceProvider` slot is the engine's own augmented face now, not
the bare `Engine`. `Engine` merges in `resolve`/`resolveMany` at the type level, but only the public
`ServiceProvider` wrapper carries the `@augment` install (§209's addendum), so an `Engine` handed
out directly threw `TypeError` the moment anything called the augmented verbs on it. `RealizeVisitor`
mints one `ServiceProvider` per `Engine` the first time anything asks, cached in a module-level
`WeakMap<Engine, ServiceProvider>` — one stable face per engine across every construction that
reaches it, not a fresh wrapper each time. `RealizeVisitor.ts` was already committed as owner-approved
before this fix; this is a post-approval change riding the same commit as the memo fix.

Cheap hardening from the same review: `auditAddon`'s `beforeConstruct`/`canonicalize`/
`afterConstruct` used to destructure `construction.state` as its own pack unconditionally; all three
now check `isOwnPack` first, the same guard `beginResolve` already used, and pass the construction
through unchanged when the state isn't this addon's own — nothing to contribute, nothing safe to
unwrap. `Engine.useHooks`'s disposer guards its `lastIndexOf` result before splicing, so a
hypothetical miss can't remove an unrelated layer at the same index. Left alone, both noted rather
than fixed: the `{state: undefined}` keeper crash recorded open in §209, and `resolvesFrom`'s
cross-container discrimination, which has no live path to reach today.

Of the concerns this verification pass raised, one is resolved and two stay open. The `noopLifetimeAddon()` face
fix — an injected `IServiceProvider` slot answering the engine's own augmented face rather than the
raw `Engine` — is accepted as shipped: "pending your in-flight changes, everything is approved."
Still open, awaiting the owner: `resolvesFrom`'s `WeakMap` keys the public `face`, and
nothing distinguishes a provider's own identity from the container it resolves from if two bindings
ever shared a face; and `Audit`'s placeholder registration body's wording ("the audit-addon
addon answers this at construction") reads as an implementation note rather than caller-facing
guidance.

_Owner-ruled; Claude-recorded 2026-08-28._

## §220 — `IServiceProvider` splits into a public tier and an `IServiceProviderInternal` primitive tier

The provider contract is two interfaces, not one — each self-contained, neither extending the
other. `IServiceProviderInternal` declares the single primitive, `getService(address: Type): any` —
what every internal implementer of resolution actually IS, and what every internal caller of
resolution is typed to hold. `IServiceProvider` declares its OWN `getService`, the same signature,
independently — what `resolve`/`resolveMany`/the latebound overloads merge onto via `declare
module`, the augmented, consumer-facing tier. The two are structurally compatible by having the same
member, which is all assignability ever needed — an `Engine` (typed `IServiceProviderInternal`)
still assigns wherever `IServiceProviderInternal` is asked for, and a `ServiceProvider` (typed
`IServiceProvider`) still assigns wherever either is asked for, purely on shape. Duplicating rather
than extending means the public face's own declaration never routes through the internal type at
all — reading `IServiceProvider`'s own `getService` doc answers a consumer's question completely,
without a jump to a second, differently-audienced interface first — and each carries a doc voiced
for its own reader: `IServiceProviderInternal`'s speaks to an implementer (what internals pass
around), `IServiceProvider`'s speaks to a consumer (`resolve` as the everyday name for the same
answer). Owner ruling, verbatim, in two passes: first, "create IServiceProviderInternal. move
getService to it. set IServiceProvider to extend IServiceProviderInternal. change engine to
implement the internal one. change ServiceProvider to take the internal one in ctor. switch all the
internal points that currently lie. IServiceProvider only in public facing spots." — then, amending
the `extends` shape specifically: "IServiceProvider DUPLICATES the getService declaration instead —
two self-contained interfaces, structurally compatible (which is all the assignability needs). Give
each declaration its own-voiced doc."

`IServiceProviderInternal` lives in `IServiceProvider.ts` beside `IServiceProvider` rather than its
own file — the two are one contract split into two tiers, and reading them side by side is more
useful than a barrel entry apart. `Engine` now `implements IServiceProviderInternal` (its own
`interface Engine extends IServiceProviderInternal {}` merge narrows to match) — it no longer types as
carrying `resolve`/`resolveMany`. An `Engine` handed out directly used to type-check as a full
provider while throwing at runtime the moment anything called an augmented verb on it (§219); now
the type says exactly what the value can do. `ServiceProvider`'s constructor takes
`IServiceProviderInternal | Func<[Type], unknown>` —
every provider it wraps only ever needs to be asked, never itself carries the augmented verbs it's
about to be handed. `askForControl` — the one place a control ask reaches into whatever it's given —
takes `IServiceProviderInternal` outright now, dissolving the `Pick<IServiceProvider, 'getService'>`
wart its signature carried: that `Pick` existed only to say "I only need `getService`" without a type
that said so on its own; now one does.

Everywhere else `IServiceProvider` appears in `di`'s internals, it was already the public tier
honestly: `build()`'s return, `keeping`'s `state.provider` answer and `Scope.provider`, the
scope-factory faces' `openScope(): IServiceProvider`, `resolvesFrom`'s `container` parameter, the
models' `openFrom` factory parameter (the same value `enclosingScope` and `openChild` thread through
`root-anchor.ts` — a user's own factory receives the wrapped face, never the internal engine), and
every `typefor<IServiceProvider>()` address — the address always names the public face; no address is
ever minted for the internal type. `ScopeBinding.ts`, `root-anchor.ts`, and `RealizeVisitor.ts` were
swept and came back clean on inspection — every `IServiceProvider` reference in each was already one
of these public-facing spots or a `typefor` address, not a getService-only internal lie; `di.ts`'s
`build()` likewise only touches `IServiceProvider` at its own public return, with `Engine` and plain
function types carrying every internal step in between. **`IServiceProvider` only in public-facing
spots** is the standing rule going forward.

The wrap into the public face is minted just-in-time at each handout, never cached for identity — no
`ServiceProvider` anywhere carries a `===`-stability guarantee. Owner: "we always wrap with
ServiceProvider JIT." `RealizeVisitor.ts`'s `engineFaces` `WeakMap` and `faceOf` are deleted;
`visitServiceProvider`'s fallback answers `new ServiceProvider(this.#engine)` inline, fresh on every
construction that reaches it, rather than the one-per-engine cache it minted before. The rest of `di`
was swept for the same pattern and came back with one genuine exception, left as-is: `ScopeBinding`'s
stored `face` is not a handout cache but the scope's own identity — `resolvesFrom` keys its `WeakMap`
on that exact object to recover which scope a caller-held container resolves from, so a caller handed
a fresh wrap on every access would break that lookup the moment it asked twice. Flagged for the
owner as the one judgment call this sweep found, rather than folded into the JIT rule by assumption.
No smoke case leaned on a provider object's own identity — every existing assertion compared resolved
values or scope-kept instances, never a provider reference itself — so nothing needed rewriting to
stay behavioral.

_Owner-ruled; Claude-recorded 2026-08-28._

## §221 — `Behavior` owns its own composition

`Behavior.compose(behavior, inner)` — a namespace merged onto the `Behavior` interface, both now in
their own `Behavior.ts` — is the one exported member: `behavior` standing over `inner`, each of the
four hooks `behavior` wrote composing over `inner`'s own and a member it left off passing `inner`'s
straight through. The four per-hook composers and the middleware-vs-handler arity check live in the
namespace alongside it, unexported. `hooks.ts` keeps the rest of the vocabulary the two files once
shared — the handler/middleware aliases, `Construction`, `Interception`, `Hooks` — and carries its
own namespace merge, `Hooks.identity`: the chain that supplies nothing, changes nothing, and passes
state straight through, the same value `aggregate-hooks.ts` once held under that name.
`aggregate-hooks.ts` is deleted outright — `foldHooks` (single-use) inlines at its one call site in
`getService`: `this.#installed.reduceRight((inner, layer) => layer(inner), Hooks.identity)`.
`HookLayer` has exactly one remaining use once `foldHooks` is gone — the `#installed` field's
annotation — so the type itself inlines too, `Array<Func<[inner: Hooks], Hooks>>`, its doc carried
onto the field: each layer is the chain standing outside whatever it's handed, held by identity as
the token `useHooks`'s disposer looks up to remove exactly the one it installed. The `const layer`
local inside `useHooks` stays a named binding — `push` and the disposer's `lastIndexOf` both need
the same identity to hand back later, so it isn't a spot an anonymous expression can take its place.
`Behavior` was already an interface, so no alias-to-interface conversion was needed for the merge.

_Owner-ruled; Claude-recorded 2026-08-28._

## §222 — The eight hook alias types are gone; every signature spells inline

`BeginResolveHandler`/`BeginResolveMiddleware`, `BeforeConstructHandler`/`BeforeConstructMiddleware`,
`CanonicalizeHandler`/`CanonicalizeMiddleware`, and `AfterConstructHandler`/`AfterConstructMiddleware`
don't exist. The owner weighed several naming shapes for the eight and settled on the most direct
one himself, then delegated the pick outright: "choose the answer you like best and do it. proceed
with plan." `Hooks`' four members spell their handler-form signature directly —
`beginResolve: Func<[request: Type, injected: State], State>` and so on — the one place the
signatures and their per-hook docs live, `canonicalize`'s built-only/no-thenable remark folded in
from where `Behavior` used to carry it. `Construction` and `Interception` move into the `Hooks`
namespace — `Hooks.Construction<State>`, `Hooks.Interception<State>` — the owner's "do it for hooks"
ruling; `hooks.ts`'s top level is now the `Hooks` interface and namespace alone.

`Behavior` is derived, not hand-spelled, per two more owner directives: "make a mapped type for the
koa pattern and type the compose functions properly -- no casts" and "make a generic generalized
version for the first half of all those compose functions." `Koa<Handler>` is the koa pattern as a
conditional type — a handler's middleware form is the same signature with a trailing `next`,
standing for everything beneath the layer: `Handler extends Func<infer Args, infer Answer> ?
Func<[...Args, next: Handler], Answer> : never`. `Behavior<State>` is the mapped type over `Hooks`'
own shape, each member optional and widened to its handler-or-middleware union: `{ readonly [K in
keyof Hooks<State>]?: Hooks<State>[K] | Koa<Hooks<State>[K]> }` — an interface converts to a type
alias to hold it, alias and namespace coexisting the same way `Type` already does in `primitives`. A
standalone implementation of one member, predefined before it's assigned, is typed the same
indexed-access way either interface always allowed — `Hooks['beginResolve']`,
`Behavior['beforeConstruct']`.

`Behavior.compose` is castless. `ownsChain` is a typed guard, `hook is Middleware`, so both its
branches narrow on their own; one generic helper, `composeMember`, covers the uniform first half of
all four composers — absent, middleware, or handler are the same three-way branch for every hook,
with `next.length` standing in for the per-hook handler arity the four now-deleted aliases used to
carry as a magic number (verified equal to each handler's own declared arity in all four cases). An
absent hook is the first branch, `if (!hook) { return next; }`, so `compose`'s own body drops its
per-member ternaries for four plain assignments — the guard lives once, at `composeMember`'s top,
and the four per-hook second halves (how a HANDLER combines with `next`) never see an absent one.
`audit-addon.ts` restructures per the owner's own observation: its four hooks predefine together as
one `Behavior<unknown>` object literal — contextual typing carries each slot's shape without a
per-member alias annotation, each hook's doc sitting directly above its own property.
`classifying-hooks.ts`'s `ConstructionHooks<State>` and `ScopeBinding.ts`'s `ownScopeKeeps`/
`RealizeVisitor.ts`'s `#realize` name `Hooks.Construction<State>` where they need the shape
explicitly; `ScopeBinding.ts`'s `keeping` gives its `beginResolve` arrow explicit parameter types
where the union contextual-types an anonymous function ambiguously otherwise.

_Owner-ruled; Claude-recorded 2026-08-28._

## §223 — Two disposal boundaries

The policy for unkept disposables — those a model keeps nothing for — is **model-defined**:
"that'll be LifetimeModel configuration, or different LifetimeModels. bottom line is it will be
model defined." Never engine policy.

A callable outliving the scope it was minted in collides with nothing of that scope's, because
nothing built from a latebound argument is ever kept in one. §230 carries the rule and the reason.

## §224 — The keeper caches the make's product, promise included; the async double-make race dissolves by construction

A scope's cache stores whatever the make returned — a promise product included; the model is fully
async-blind and never insists on settled values. A promise plan's product is its boundary's own
wrapping promise, minted and stored in one synchronous run-to-completion block, so concurrent walks
share one promise and double-instantiation is impossible by construction. The governing invariants,
owner-stated: promises hoist to their nearest parent promise; realization stays synchronous
throughout; a promise needing dep promises becomes a node in the hoist tree collecting its deps'
awaits.

This supersedes the in-flight single-flight map and the adopt-or-store write-back from
`docs/di2.scope-async.requirements.md`'s addendum — with one make and one settle continuation per
product, both are dead machinery. A gather hit on a settled cached promise costs one microtask,
consistent with "the sync/async distinction is decided by plan structure, never by cache state."

Standard-model rejection policy (Claude-defaulted, flagged for owner override): at store, a thenable
product (a thenable-protocol check, never `instanceof Promise`) gets a rejection handler that evicts
the entry — failures never cache, retry works; concurrent holders still share that rejection, deduped
per walk.

Also ruled the same day: the `di.extras` `resolveAsync` sugar entry is licensed; docs, tests, and
examples for the async lane are deferred until the code is owner-reviewed (priority: review-ready
ASAP).

_Owner-ruled 2026-08-28, Claude-recorded._

## §225 — Instance disposal lives entirely in the lifetime model; the engine is untouched

Disposal is contained wholly to the scope blackbox and the existing hook seam — the engine carries no
new contract and no new vocabulary, no change of any kind. Two lines of
`docs/di2.scope-async.requirements.md`'s Disposal/Engine-hardening sections are overridden by this
ruling: the disposed latch that section put on the engine-minted root provider moves model-side, and
the per-registration disposal vocabulary is NOT engine-defined.

The disposed latch: the model's own minted provider objects and keeper refuse any ask after teardown;
a latebound re-entry hits the captured scope model and gets the same refusal. Nothing sits at the
engine door.

No dispose members on `ServiceProvider` or the func-head surface: root teardown is resolution-driven,
mirroring `createScope` — the model registers its own teardown-bearing surface, and its scope objects
(root included) carry `Symbol.dispose`/`Symbol.asyncDispose` as model-minted values.

The release vocabulary rides the LIFETIME DATUM — the model's own total property — rather than any
engine-defined field: no `externallyOwned()`/`withRelease()` verbs, no `Registration` field, zero new
manifest surface. The standard model widens its own datum type to carry release policy (an
external-ownership opt-out, a release override such as return-to-pool).

No `DisposedError` in the `di.core` taxonomy: the standard model throws its own disposed-scope error,
surfaced via `LifetimeModelError` (`.cause`) — the `ScopeTagUnmatchedError` precedent.

The rest stands as specced: the keeper tracks at make time with no new hook, since it performs every
make and its disposal knowledge is total by construction; value registrations bypass the model and
are never tracked. Standard-model policy: LIFO release of a scope's kept instances,
reference-deduped; children-before-parent cascade; unkept/transient instances untracked,
consumer-owned (transient-disposable policy stays model-defined). `asyncDispose` is preferred over
`dispose` per instance; a synchronous dispose meeting an async-only disposable throws loudly naming
the instance's address; a promise product the container never awaited — delivered as a promise by a synchronous
`resolve` — is out of the scope's reach and is not released at all, its holder owns what settles;
a promise product the container itself awaited (`resolveAsync`, or any boundary it settled) puts
the settled value in reach, is released by `asyncDispose` awaiting it and releasing that value,
and is an async-only disposable to a synchronous dispose, which throws as above. A second
dispose is an idempotent no-op; release failures aggregate, never abort-on-first.

Implementation queues behind the async lane, in the lifetime model.

_Owner-delegated 2026-08-28 (behavior Claude-owned, owner reviews patterns/style; always
model-defined; containment owner-ruled), Claude-designed._

## §226 — The instance cache keys as-registered, never as-requested

The unit of "single" is the ANSWERING REGISTRATION: the instance cache keys on the registration's
identity, paired with its capture bindings for an open registration — `ILogger<A>` and `ILogger<B>`
close one registration into distinct instances. The requested spelling never splits the key. This
supersedes `docs/di2.scope-async.requirements.md`'s line that the request key is the as-requested
type.

Why the request cannot be the key: delivery-mode decoupling makes one registration reachable under
many spellings — `T` via the boundary fallback and `Promise<T>` name the same singleton; a union
settling on a member shares it with the direct member ask; an aggregate's element plan node shares it with
resolve-one. Keyed as-requested, each pair double-makes one singleton registration.

The wrap direction caches the sync registration's instance, never the wrapping promise — the wrap is
plan-node structure, minted per plan node over the shared instance.

Two memos deliberately stay request-keyed and do not conflict: the plan memo (plans are per-request
structure; registrations are disambiguated inside plan trees, never by the plan key) and the scope's
learned memo, a request-keyed shortcut aliasing the registration-keyed truth — one product memoized
under several spellings is harmless.

_Owner-ruled 2026-08-28, Claude-recorded._

## §227 — Every addon threads its own private state; the walk carries an engine-owned VisitorContext

Every installed behavior/addon has its own PRIVATE threaded state. The `VisitorContext` the realize
walk threads is IMMUTABLE end to end, and the states it carries are BLACKBOXES the driver moves and
never reads into. The states member is not a keyed map — a terrible immutable carrier, since a
wholesale copy per derivation loses structural sharing — but a FROZEN POSITIONAL ARRAY, one slot per
fold position, minted together with the hook chain from one snapshot of the install list: each
wrapper the compose fold mints closes over its own index, and the chain+states pair travels and is
captured together, latebound included, so positions never dangle — a later install or dispose
re-folds the NEXT resolution while an in-flight walk keeps its own captured pair. A behavior object
installed twice gets two slots natively, one per fold position. `VisitorContext` also carries the
latebound call args and the boundary's hoisted map as an engine transient. This supersedes
`docs/di2.scope-async.requirements.md`'s line that no separate context token exists, and retires the
single-opaque-state channel.

Derivation is `states.with(index, answered)`, batched per construction into one derived context the
dependency subtree realizes under. No behavior can observe or clobber another's — the crash class
where an upstream `{state: undefined}` reaches the keeper (§209's open item) dissolves structurally
rather than by guards.

The state-envelope pattern — an addon packing its compartment over "whatever sits beneath",
recognized by identity and unwrapped around every hook — is dead machinery under positional slots:
the audit-addon addon keeps only its frame chain and view, its hooks becoming plain slot reads.

A boundary's plug walk derives a child context carrying its own gathered map — no fresh visitor per
boundary — and a latebound closure strips boundary transients from its captured pair, so its future
call never sees an old hoisted map. States are PER-RESOLVE VOLATILE: born at `beginResolve`, dead at
resolution end; durable state lives on the scope object or the behavior's own closure, never in the
slots. A latebound capture extends its own walk's states for re-entry — that walk's world, never
shared forward.

Implementation rides branch `refactor-di-visitor-context` off the async head, landing after the async
review.

_Owner-ruled 2026-08-29, Claude-recorded._

## §229 — Captivity validation is model-owned middleware; there is no generic validator

Scope captivity — a longer-lived keeper holding a shorter-lived dependency — is structurally
impossible when the threaded state is used correctly: a keeper's dependencies resolve under the
state its own construction was threaded, so the model that keeps them decides their ownership.
Anywhere that does not hold is the lifetime model's own business, never the engine's and never a
generic addon's — the same ownership §228 already settled, carried through to its consequence.

There is therefore no cross-model lifetime-tier abstraction and no shared validator:
`LifetimePolicy` (`di.core`) and `validateCaptivity(policy)` (`di`'s validation addon) are removed.
Each lifetime model decides whether it needs a validator at all.

The standard model needs one: its tiers (singleton over scoped over unkept) are fixed, so a
singleton→scoped edge is decidable from the plans before anything resolves. The standard model's
own module owns that validator, exports it as a middleware — an addon where it needs services
registered — and the model's main addon (`standardLifetimeAddon()`) composes it in by default — validation is on unless the composer removes it. At
runtime the standard model's behavior is two independent switches, both on by default: `validateOnBuild`
runs the build-time sweep, and `validateScopes` makes a scoped ask arriving under root state
throw a model-local `ScopedAtRootError`, surfaced through `LifetimeModelError`; with `validateScopes` off, root keeps the instance. The standard
model always matches its reference implementation's behavior — an owner ruling, never a Claude
default.

The tagged model needs none and cannot have a correct one: tag nesting is decided at runtime by
which tags get opened under which, so no static order exists; its runtime refusal
(`ScopeTagUnmatchedError` when no ancestor carries the tag) is the whole mechanism.

`hosting` installs the standard model's addon and inherits its validator rather than installing
`validation(standardValidationPolicy, …)`.

_Owner-ruled 2026-08-30, Claude-recorded._

## §230 — The resolution door carries a request

`getService(Type)` becomes `getService(Request)` for the middleware chain and the engine;
`IServiceProvider` keeps its own signature. `ServiceProvider` allocates one `Request` per call and
puts itself on it, and it is the only `IServiceProvider` implementation.

```ts
interface Request {
  readonly type: Type;
  readonly serviceProvider: IServiceProvider;
  [key: symbol]: unknown;
}
```

The index signature declares the mechanism without naming any contents, so a core type carries no
lifetime vocabulary while an addon still attaches what it needs, under a symbol it exports. A string
key would be reachable by anyone who types the same string with nothing recording that they did; an
imported symbol is reachable only through an import a reviewer can see. Attachment happens on the way
DOWN, before `next` — the object is shared with every layer beneath and with the engine, so a write
on the unwind is invisible to everything it was meant for.

The chain is folded by `di.build` and nowhere else. That is the builder's rule; everything past it
is the model's own business.

A lifetime model is a black box. Nothing in the door, the engine or the chain says how one organizes
itself, and they differ from one another — the tagged model is not built the way the standard one is.

The standard model's own choice is a pair. The middleware is the inner half: it installs the whole
implementation through `Control<IEngineHooks>` once, at fold time, and holds every cache in that
closure. The outer half is the single wrap its scope factory puts over the already-folded chain,
attaching the scope it closes over. `create()` returns the pair for the singleton scope too, so the
container's own provider is born attached and no unattached provider exists to be handed out.

`beginResolve` receives the request and reads the attachment once into the behavior's own slot;
every later hook takes it from `construction.state`. `injected ?? …` keeps nested resolutions
inheriting the enclosing scope, so the attachment is consulted only at the door.

Under that model, opening a scope therefore composes rather than installs. Nothing accumulates on the
chain, which is what makes an outer scope answering an inner scope's ask structurally impossible
there rather than governed by a precedence rule, and what stops per-node cost scaling with nesting
depth.

A scope never captures a value built from a latebound argument: the address is the cache key and it
does not carry the arguments, so a cached value would be handed to callers whose arguments could
never have produced it. The taint propagates upward — a construction is uncacheable when anything in
its subtree consumed a latebound argument — and it is a static property of the plan tree. A request is
captured for the whole lifecycle of the `getService` that opened it, latebounds constructed under it
included, so a latebound call carries the request it was minted under rather than meeting a new one —
which is what keeps a closure invoked through some other provider filing its untainted dependencies
into the scope it was minted in.

`Invoker` stays. Spelling a late registration as a branded argument was refused: a temporary
registration produces a value the cache cannot honestly key, so an instance built from a registration
that exists for one frame would be handed out afterwards to asks that could never have produced it.

_Owner-ruled 2026-09-01, Claude-recorded._

## §231 — An unregistered object or tuple type synthesizes when every member resolves

All of them or none — one unresolvable member leaves the whole shape unsatisfiable rather than
half-built, which is the rule tuple synthesis already applied to its members. `visitObject` composes a
shape from its own properties on the same terms, and `#answer`'s existing order does the rest: a
registration for the shape itself answers first, and only a miss falls through to building one.

A NAME is a name: a named type resolves nominally, through a registration, and never composes from
its members. Matching is identity modulo holes — no assignability, no width subtyping, no member
search — and letting a named shape fall back to its members would be that analysis by another route.
The difference is only the fallback. Registrations answer first for every address alike — `#answer`
consults the registry before ever reaching a kind's own synthesis — so an anonymous shape is
registerable exactly like a named one, and interning is what lets a registration made against one
spelling be found by the same shape spelled somewhere else. What a named type lacks is the fallback:
a miss ends there, where an anonymous shape goes on to compose from its members. A utility type lands
on whichever side its alias leaves it, with no special case either way.

Optional properties are carried as a union with `undefined`, since `ObjectType.members` holds no
optional flag and `Type.isOptional` already defines optional as exactly that union. The union's
literal fallback is what keeps an unresolvable optional property from failing the whole shape.

Synthesis from shape requires the members to reach the planner. A named shape derives by its own name,
which discards them, so a name resolves through a registration and never through synthesis; an
anonymous one does not derive at all. Structural derivation in `typefor` is therefore the gap that
gates this, not the planner.

`visitTag` refuses for a reason of its own: synthesizing a tag would fall back to its base, so a keyed
address would silently resolve to the unkeyed service. `visitCtor` and `visitAbstractCtor` have
nothing to answer — a constructor value cannot be composed from a signature, only carried by a
registration, and handing back a closure that constructs is what `visitFunc` already returns.

_Owner-ruled 2026-09-01, Claude-recorded._

## §232 — The transformer's node vocabulary mirrors the `Type` union

The Go side generates TypeScript `Type` expressions, so it carries one node vocabulary with one kind
per member of that union and children of the same node type. A container's member can then be any
kind, because there is no poorer half to fall into.

Two partial vocabularies split along a seam with no meaning on the TypeScript side — one the tree
form of a string walk, the other a classification layered over it — left `Tag` in both, `Undefined`
and `Null` redundant with `Literal`, `Union` implemented twice incompatibly, and `Object`,
`Intersection` and `List` absent. The cost was not academic: a container's members were typed by the
poorer half, so the walk a container recursed through was dictated by a field type rather than by the
shape being derived — a tuple slot that was a general union refused the whole tuple, and a callable
slot derived as a service token where the same type inside a union derived correctly.

The invariant this buys: a derivation refusal means exactly one thing — `Type` cannot express this
shape. Every refusal is justifiable by naming the missing `Type` member, and refusals stay loud
rather than becoming silent approximations.

_Owner-ruled 2026-09-01, Claude-recorded._

## §233 — A bare `typefor<T>()` derives correctly inside a substituted body; the `tokenfor`/`tokenof`/`nameoftransform` trio is retired

§146's gate is cleared. A real project compiled through the actual `ttsc` host — `add<ServiceType>(implementer)`
and `addValue<ServiceType>(value)`, whose sugar bodies call nothing but a bare `typefor<ServiceType>()` —
lowers exactly as a hand-writer would spell it:

```ts
services.add($di_reg_app_private_app_IFoo_3a8ff602b3, Foo, $vate_app_Foo_di_reg_app_private_app_IDep_7befee0871,
  'singleton');
services.addValue($di_reg_app_private_app_IBaz_bf0fe67954, bazValue);
```

where `$di_reg_app_private_app_IFoo_3a8ff602b3` is the hoisted `Type.imported("IFoo", "di-reg-app/private/app")`
const — the same address a hand-written `typefor<IFoo>()` at that call site derives, and the same the
`tests/di.registration.ttsc.e2e` parity suite already pins byte-for-byte against the explicit form. No
`typefor<`/`typefor(` survives the emit, matching every other substituted-body call site in `di.extras`
(`resolve<T>()`, `tryAdd<T>()`, `describe<T>()`, …), which already rely on the identical bare-call shape.

`tokenfor`/`tokenof` carried no live definition to retire — `primitives.extras` exports only `typefor` and
`schemaof`, and the Go `nameof` stage was already gone (`ed69175f`). What remained was residue: the
`tokenfor`/`tokenof` entries in the inline stage's `knownPrimitives` allow-list and the matching ESLint
`PRIMITIVE_HOMES` table, a `tokenof` mention in the artifacts doc comments, and `tokenfor` used throughout
the Go inline-transform unit tests as a stand-in primitive name. All of it is gone; the Go tests now use
`typefor` (or, where a fixture needed two distinct sibling primitives, `typefor` + `schemaof`) as their
stand-in instead.

_Claude-verified 2026-09-01, closing §146's gate._
