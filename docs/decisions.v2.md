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

- `signatureof` (DI dependency-signature extraction) → `di.transformer`, which peers on `di.core`, so it returns di.core's real `DepSignatures` / `DepSlot` directly. The former primitives-side mirror (`DepSlotLike` / `FactoryRefLike` / `UnionLike` / `LiteralRefLike` / `TypeArgRefLike`) is deleted.
- `schemaof` (config `Schema` from a type) → `config.transformer`, which peers on `config` and already owns the `ts.Type`→`Schema` codegen + the `OPTIONAL` import injection.
- `tokenfor` STAYS in `@rhombus-std/primitives` — it is the one primitive called in RUNTIME source (`registerAugmentations(tokenfor<T>(), …)`), so every runtime package must import it. That runtime call-site is the discriminator between a universal primitive and an authoring-only one.

Consequences: the inline BODIES and their `rhombus-std` `inline` markers move to the transformer packages too — a runtime package cannot depend on its own transformer (the reverse of the real edge) — which deletes the old "inline.ts excluded from the runtime bundle" gymnastics; runtime packages stay clean. The Go inliner gate becomes a `knownPrimitives` name→home-module map (multi-package). This dissolves the prior schemaof blocker with no gate-widening and no hoisting of config's `Schema`/`OPTIONAL` into the zero-dependency leaf.

Implementation notes: a primitive cannot be self-imported by its own package name (bun's isolated linker makes no self-symlink → `tsc` fails), so an inline body imports its own package's primitive RELATIVELY (`./signatureof.js`); the gate scanner and the `inline-authoring` eslint rule accept the home-module specifier OR a package-relative one within the primitive's own package. A consumer or fixture of a moved primitive must depend on the transformer package (it peers on the runtime, so it isn't reachable from a runtime-only dep graph). Landed #246 (signatureof); schemaof → config.transformer is the follow-up. _Owner-directed 2026-07-18._

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
3. **Bag = `Multimap<string, [fn, merge?]>`** per token: each contribution pairs its fn with its
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

## §72 — Every runtime library is dist-referenced

A library's `.` export resolves its type-facing conditions and `bun` to the rolled `./dist`; none resolve to `./src`. A self-augmenting core resolves its **own** compile back to source through a package-unique `<pkg>-source` custom condition listed first on the `.` export (so it can `declare module` its own barrel before its dist exists). The `./_/*` subpath is the only src-resolving export (§83). _Owner-approved._

---

## §74 — `tokenfor` and token derivation

`tokenfor<T>()` is declared in `@rhombus-std/primitives` with a throwing body (a call reaching runtime means the transformer wasn't wired). The transformer lowers it to a token identifying where `T` sits in the exports graph — the package barrel for a publicly-exported type (`pkg:Type`), the `_` subpath for a tests-only one (`pkg/_/file:Type`). It keys on export **membership**, not on-disk path, so a package's own build and an external consumer derive the identical token. The primitive `nameof<T>()` was renamed to `tokenfor<T>()`; the pipeline stage id `nameof` is unchanged. _Owner-approved._

---

## §83 — The `_` export is for tests and `tokenfor` only

Each library's `./_/*` subpath maps to `./src/*` and is publish-scrubbed, so it is reachable by exactly two things: that library's own white-box tests (which import through it), and `tokenfor`'s token form for a type reachable only through it (`pkg/_/file:Type`, §74). Nothing in shipped code imports through `_`. _Owner-approved._

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

## §97 — White-box surfaces: `tokens` and `private`; strict token derivation

Every library exposes `./tokens/*` as the token/type surface, and each surface's condition set is
**minimal and role-encoding**: `./tokens/*` carries only `types` → `./src/*.ts` — no `source`, no
`bun` — so the surface is mechanically unimportable at runtime, enforcing compile-time-only use by
construction. Lowering packages additionally expose `./private/*` as the typed runnable-internals
surface: `types` → `./src/*.ts`, `bun` → the package's per-file lowered stage emit — a build
implementation detail, not part of the rule; the alias and the disk path are independent. The root
`.` export carries `types` + `default` (plus a self-augmenting core's `<pkg>-source` condition
first, §72) — no redundant `bun`/`import` keys. `./tokens/*` and `./private/*` are both in-repo
only: `publishConfig` rewrites `exports` down to `.` alone, and `files` excludes the stage emit
directory.

Token derivation for an exports-mapped file matches the **shortest** subpath among export entries
carrying a `default` condition — public, where a bare-string target counts as carrying one — with
ties broken lexicographically; the root `.` export is the shortest possible case, deriving the bare
`pkg:Type` form. If no public entry reaches the file, `./tokens/*` — deliberately default-less, the
one sanctioned in-repo internal surface — derives `pkg/tokens/<path>:Type`. If neither reaches it, a
hard diagnostic names both fixes (export the type publicly, or expose its file via `./tokens/*`).
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

The primitive STAGES a family's sugar leans on — inline and signatureof, alongside nameof and
mergesynth — are family-neutral machinery under `transforms/internal/*`, surfaced through
`primitives.transformer` (its `ttsc.stages` set, plus the `./inline-ttsc` / `./signatureof-ttsc`
single-stage override descriptors). A family's own `*.transformer` (di.transformer,
di.transformer.options, config.transformer) owns only its per-family sugar: the phantom typings, the
`rhombus-std` `inline` BODIES (§91), and its own stage (`di` / `di_options` / `config`). This complements
§92's primitive-STUB homing — the stubs and their typings stay in their domain transformer; §104
records where the STAGE machinery lives.

The honest dep edge falls out: because a family transformer's inline bodies call the neutral
primitives (`tokenfor`/`signatureof`), that transformer genuinely requires the primitive stages, so
di.transformer, di.transformer.options, and config.transformer each declare
`@rhombus-std/primitives.transformer` as a `dependency`. That edge is what lets §103's host scan
reach the primitive stages for a family-sugar consumer: a library depending on di.transformer's
sugar gets inline+nameof+signatureof activated with no action of its own. The edge is build-graph
only — `primitives.transformer` ships no runtime JS, so it never enters a bundle.

_Owner-directed 2026-07-19 (the family-neutral-stage placement); the dependency-edge mechanics are
the implementation._

---

## §105 — Editor navigation resolves `@rhombus-std/*` to source via a `source` condition; runtime stays dist-ref

Cross-package IDE rename / find-references needs the editor's TypeScript program to see one unified symbol identity across packages, which means resolving `@rhombus-std/*` to **source** — dist-ref (§72) resolves the rolled `.d.ts`, dead-ending navigation at each package boundary. This is served without disturbing the runtime. Each package's `tsconfig.json` becomes an editor-only whole-repo program (`include: ["../*/src/**/*"]`, `customConditions: ["source"]`); the strict CI/build config moves verbatim to `tsconfig.ci.json`, and `tsconfig.ttsc.json`, the per-package `lint` scripts, and `build-lib.ts`'s typecheck repoint to it.

Each package's `.` export gains a `source` condition → `./src/index.ts` (first key), scrubbed from `publishConfig` so it never ships. Only tsserver activates it (via the editor `customConditions`); **bun ignores tsconfig `customConditions`** — it resolves the `bun` condition → dist — so the build and every `bun test` run the distributable byte-for-byte as before. `paths`-based src-refs were tried and rejected: bun DOES honor tsconfig `paths` at runtime, poisoning module resolution so library source executes with an un-lowered `tokenfor`.

This is a SHARED `source` condition, which §78 (v1) considered and rejected — but §78's concern was a downstream consumer's BUILD/GATE co-compiling a core's src; here `source` is set ONLY by the editor program, and neither the build nor the gate sets `customConditions`, so that harm cannot arise, and the whole-repo over-pull §78 avoided is precisely what the editor wants. src-refs stay internal-only (this editor program, the `<pkg>-source` self-compile condition, and the `./_/*` white-box subpath); dist-ref remains the sole runtime and publish primary.

_Direction owner-directed (export conditions; src-refs internal-only). The shared-`source` mechanism is an implementation call — pending owner confirm of shared `source` vs per-package `<pkg>-source`._

---

## §106 — Open-generic matching is `Type`-node unification; a generic hole is `Type.generic(label)`

Closing an open registration (`IRepo<%T>`) against a ground request (`IRepo<app:User>`) is `Type`-node unification, not string manipulation, and there is no separate token model to keep in step with it. `Type` (§137) is the whole vocabulary: a generic hole is its own node kind — `GenericType = { kind: 'generic', label: string }` — minted by `Type.generic(label)` and written `%<label>` in the token grammar (`libraries/primitives/src/Type/internals/parser.ts`'s `%` case), an arbitrary string label rather than a positional numeric index. `Type.isOpen(type)` (`libraries/primitives/src/Type/analyzers.ts`) reports whether a type still holds a hole anywhere; `Type.match(pattern, subject)` asks whether some instantiation of `pattern` extends `subject`, returning the label→`Type` bindings it captured; `Type.substitute(type, bindings)` replaces each hole the map names. All three are static members of `Type` (`libraries/primitives/src/Type/Type.ts`), each backed by a dedicated visitor (`SatisfiesVisitor`, `SubstituteVisitor`) over the one node tree every other `Type` operation shares (§111).

- **Holes are labels, not indices.** `Type.match` records one binding per generic label in the pattern, so a template may reuse or reorder labels freely; a repeated label must bind the same `Type` at every occurrence, which interning makes an `===` compare.
- **One grammar, one parse.** `Type.from` is the sole place a token string becomes a `Type`, for a registration, a request, or a dependency signature alike (§111) — there is no second, shallower classifier a hand-typed template's whitespace or hole spelling could disagree with.
- **The engine.** `Registry` (`libraries/di/src/internal/Registry.ts`) partitions a manifest once, at construction, into closed registrations (keyed by the interned `Type` itself, reached by `===`) and open registrations (kept in a list); `Registry#answering(request)` answers a closed hit by identity and an open hit by running `Type.match` against each open registration in turn, yielding a `ServiceDescriptor` already closed over whatever the match captured (`ServiceDescriptor.substitute`).
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

`Manifest<Scopes>` (`libraries/di.core/src/Manifest.ts`) is an interface extending `Iterable<ServiceDescriptor<Scopes>>`, and its own body declares exactly three members — `_add`, `_remove`, `_replace` — each returning a NEW manifest rather than mutating the receiver, so a call whose result is discarded registers nothing. `DefaultManifest` is the concrete, `@augment`-decorated class: an immutable decorator chain where `_add` prepends one descriptor via a generator that yields the new descriptor then delegates to the rest, so iteration order is newest-registration-first.

Every other registration verb — `add`, `addClass`, `addFactory`, `addValue`, `tryAdd` and its typed siblings, `replaceClass`/`replaceFactory`/`replaceValue`, `removeAll` — arrives through augmentation onto `Manifest`, in `libraries/di.core/src/augmentations/`. `add` is not replaced by the typed verbs; it coexists with them as a dispatching entry point taking a bare descriptor, a lambda that walks the per-registration builder (§109), or an implementation plus its composed call-shape type positionally. `addClass`/`addFactory`/`addValue` are separate convenience verbs that compose a `ServiceDescriptor` from a type, an implementation, and a `Signatures` array (`libraries/di.core/src/ServiceDescriptor/Signature.ts`), then forward to `add`. Builders that wrap a manifest and are configured by a caller delegate keep mutation-shaped ergonomics on top via a mutable-slot seam (§114). _Owner-directed (the immutable-chain, verb-carried-by-augmentation direction); the builder's slot mechanics (§109) are Claude's._

---

## §109 — The per-registration builder gates completion on the type system: an impl door, then exactly one call-shape door, then optional lifetime/tag doors

The two-argument `add(type, configure: Func<[Unstarted<T, Scopes>], IComplete>)` form hands the configure lambda a `PendingRegistration` typed as `Unstarted` — every step door still open, no `IComplete` in the intersection — and walks it through `libraries/di.core/src/builder.ts`'s `Pending<T, ImplNode, Scopes, Slots, Ready>` type: each slot still open (`'impl' | 'implType' | 'lifetime' | 'tag'`) contributes one interface to an intersection, so only the doors for open slots are callable. `asClass`/`asFactory`/`asValue` spend the `impl` slot and open `implType` (skipped by `asValue`, already complete once tagged); `withSignature(...paramTypes)` or `withType(implType)` spend `implType` — exactly one of the two, since taking either removes the slot the other also targets — and only this step flips `Ready` to `true`, adding `IComplete` to the intersection. `withLifetime`/`taggedAs` remain independently callable afterward without gating completion further. A lambda that never opens a call-shape door never reaches a value `add`'s overload accepts, so the gate is enforced by the type checker, not a runtime check.

`withSignature` is singular and variadic (`...paramTypes: Array<Type | string>`), taken at most once — there is no separate bulk-replace verb. A registration's whole call shape can also be named positionally, without the builder: `add(type, ctor, implType, scope?, key?)`, where `implType` is one composed constructable or function type — an intersection of them describes an overloaded implementation, one member per call signature (`callSignatures` in `builder.ts` reads them back apart). Sugar (`addClass<T>`, `addFactory<T>`, `add<T>`) derives `T` and, where relevant, `implType`, so the same builder ergonomics are available to a hand-writer and a transformer-driven caller alike.

_Owner-directed (the gated-completion, single-call-shape-door direction); the current slot/intersection mechanics are Claude's._

---

## §110 — Primitive naming: `-for` mints an identity, `-of` observes an existing one

A primitive's suffix says which half of the job it does. `-for` MINTS an identity for a type nothing
has stated yet: `typefor<T>()` mints `T`'s address, `tokenfor<T>()` its string token. `-of` OBSERVES
something the target already carries: `signatureof(ctor)` reads a constructor's own parameter types,
`tokenof(value)` reads a value's own type, and `schemaof<T>()` reads out the members `T` already
declares.

The pipeline STAGE ids are independent of the function names — the `nameof` stage lowers
`tokenfor`/`tokenof`, and nothing requires a stage to be named after the primitive it folds.

_Owner-directed (the -for/-of convention itself); the naming of each primitive against it is
Claude's, done as a dedicated PR per the owner's "name them right the first time" direction._

---

## §111 — One `Type` tree serves both the resolve side and the signature side

A resolve request and a dependency-signature slot are the SAME `Type` expression — there is no separate tree for one and not the other. `Type` (`libraries/primitives/src/Type/Type.ts`) is a single plain-data discriminated union, minted through interning factories (`libraries/primitives/src/Type/internals/factories.ts`), and every operation over it — `match`, `satisfies`, `substitute`, `stringify`, `validate` — is written once, as a dedicated `TypeVisitor<T>` subclass (`SatisfiesVisitor`, `SubstituteVisitor`, `StringifyVisitor`, `TypeValidatorVisitor`) dispatching one `switch (kind)`, not `accept`-on-node. Nodes stay plain data, so the immutable-update idiom keeps working, and a `ServiceDescriptor`'s dependency signatures (`TypeSignatures`, `libraries/di.core/src/ServiceDescriptor/Signature.ts`) are literally `ReadonlyArray<readonly Type[]>` — the same `Type` nodes a request is built from, closed over an open registration's captured bindings by `TypeSignatures.substituteSignatures`, which applies `Type.substitute` per parameter.

The wire format is the one grammar `Type.from`/`Type.stringify` run at the data-input/output boundary (§106) — there is no separate parse step for a signature versus a resolve target. _Owner-directed (the one-tree, parse-at-the-boundary direction); the visitor shape and node-as-plain-data reasoning are Claude's._

---

## §112 — A union dependency is chosen once, when the plan is built; nothing here falls through if the chosen member later fails to construct

`ToCallSiteVisitor` (`libraries/di/src/internal/CallSite/ToCallSiteVisitor.ts`) decides a union's member at PLAN-BUILD time: `#chosen`/`visitUnion` ask which registered or synthesizable member the union resolves to, and that choice is baked into the `CallSite` the engine memoizes per request (`Engine#planFor`, `libraries/di/src/internal/Engine.ts`). Realizing the plan later never re-asks the question — nothing in `CallSite`/`RealizeVisitor` catches a construction failure and tries the union's next candidate. Multiple members that could each answer the union raise `AmbiguousUnionError` at plan-build time (or take the newest, under `unionAmbiguity: 'newest'`); a literal member is the union's fallback when no other member resolves.

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
registration once, by `Type.isOpen(descriptor.serviceType)`, into a closed map (keyed by identity)
and an open list matched per request via `Type.match`. A registration mixing concrete args and
generic holes needs no special-casing, because `Type.match`'s unification is already fully
recursive over the whole tree — there is no separate all-holes rule to enforce or retire. §106
records the current matching mechanism; §141 records the `Type` taxonomy it walks.

---

## §125 — Overlapping open registrations are NOT ranked by specificity; the current registry resolves them by registration recency

`Registry#answering` (`libraries/di/src/internal/Registry.ts`) collects every open registration
whose service type `Type.match`es the request, and orders every answer — closed and open together —
by `rank`, the registration's position in manifest iteration order (newest first, since
`Manifest#_add` prepends). There is no specificity measure: two open registrations both matching one
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

The current engine (`Registry`, `Engine`, `ToCallSiteVisitor` — §106, §111, §112) has no scope or
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

**What §56 (v1) no longer describes.** §56 records three things landing together; the descriptor
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

## §136 — Augmentation members are `this`-based methods, installed verbatim

**An augmentation set member IS the prototype member.** Every set — `AugmentationSet<R>` and
`AugmentationSet2<R, M>` alike — is an object literal of plain methods whose receiver is `this`,
and installation assigns the authored function straight onto the receiver prototype:
`proto[name] = set[name]`, no forwarding thunk, no adapter. Function identity therefore holds
(`proto[name] === set[name]`), which makes two things meaningful that a wrapper made impossible:
re-installing the very same function is a detectable silent no-op (the double-install shape a
barrel + `./private/*` load produces), and an installed member can be recognized as its authored
source.

**Contextual `this` comes from explicit `this` parameters in the set types, not `ThisType<R>`.**
`AugmentationSet<R>` is `Record<string, (this: R, ...args: any[]) => unknown>`;
`AugmentationSet2<Rec, Impl>` maps each `Impl` member to `(this: Rec, ...args: Parameters<Impl[K]>) => any`.
An `& ThisType<Rec>` intersection reads better and was rejected for a checkable reason: an
intersection strips the implicit index signature of the mapped/`Record` type literal, and that
index signature is exactly what lets a concrete set satisfy the erased `Record<PropertyKey, Func>`
parameter the registry and the `registerAugmentations` sugar take. The explicit `this` parameter
gives an object-literal method the same contextual receiver with zero per-member annotation.

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

**Three verbs, one vocabulary.** A type-argument primitive does exactly one of three things, and its
name says which: `typefor<T>()` NAMES a type (a named type yields its interned `NominalType` address),
`schemaof<T>()` EXPANDS one (the members of the type it was handed), `signatureof(ctor)` OBSERVES a
runtime constructor. `tokenfor` / `tokenof` remain the string-token pair pending their own held
retirement. That is the whole transformable roster.

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
describable by the grammar but deliberately unimplemented — both open edges, pending certification
work.

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

- Contextual `this` typing on a set's members needs no per-member annotation, with one exception:
  contextual `this` does not propagate through a member's OWN generic type parameters, so such a
  member carries an explicit `this:` parameter instead of relying on the set type's contextual
  inference.
- The augmentation inventory — the roster a tool (a lint rule, a scan, mergesynth) needs to
  enumerate — is discovered from TWO sources, both counted as augmentations: `registerAugmentations`
  call sites, and any set typed against the augmentation-set types (`AugmentationSet` /
  `AugmentationSet2`) with no accompanying register call.

_Owner-directed 2026-08-13._

## §141 — di2's Type taxonomy: one flat node space, address vs. spec as usage, not identity

di2's `Type` is one flat node space with one public parent — no descriptor union, no overlapping
door unions. `TypeIdentifier = NominalType | GenericType | TagType` names the ADDRESS-ONLY kinds:
a pure reference can never self-construct. `NominalType = GlobalType | ImportedType` is the pair a
name is reached by — the ambient scope, or an import from a package that the node carries as its
`from`.

Every `Type` can be an ADDRESS: interning makes any node registrable and resolvable by `===`, so a
`ServiceDescriptor` may link absolutely any `Type` to an implementation. Every NON-identifier `Type`
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
   provider's fixed descriptor set, reading no runtime state). A failed construction is not cached;
   determinism makes rebuild-and-rethrow identical.
3. **Instances** are cached per scope, internally — `realize` interprets a plan's lifetime data
   against the asking scope, and scopes own their instance caches outright.

Every visitor serves the making of a `Type` or a plan, so those two memo layers absorb all
resolution-path caching; the standalone analyzers' memos (§141) serve build/registration-time gates
only. Plans hold no instances and scopes hold no plans — the layers meet only at `realize`.
Resolve-one and resolve-all share instance caches, so a scoped or singleton instance never
double-instantiates via the enumerable path.

Metadata never holds state: descriptors and plans stay pure, and instances live only in scope-owned
caches keyed by the interned request. The scope model adopts nothing from prior art without its own
justification, case by case.

_Owner-directed 2026-08-13._

## §143 — di2's descriptor impl description composes one node; the address stands in the instance slot

A descriptor's impl description is one composed node, not a separate registration-time check: sugar
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

The signature verb is `withSignature` (the owner delegated the naming choice; `using-` was the one
odd prefix and dies with it), SINGULAR and variadic: `withSignature(...paramTypes)`, exactly once
per chain. A multi-signature (overloaded) impl is expressed through `withType` with an intersection
of constructables — plurality lives in the composed node, not in the verb. Verb naming beyond this
is case-by-case; prefix uniformity is not itself a goal, and `taggedAs` — the one address-rewriting
verb — stands, since it looks different because it is different.

Every builder-carrying API also offers a positional overload taking everything at once: an
`implType` argument (one composed constructable node), never naked signatures — the
signatures-as-arrays spelling lives only in the builder's `withSignature`. A hand-composer of a
positional `implType` puts the address in the instance slot, the same documented convention as
above; sugar derives the precise node. Builders read as fluent English, and the positional twin is
the terse complete form.

The builder form is HAND-USABLE: `add(type, configure)` takes the address as the first positional
argument and the builder lambda second. The sugar form `add<T>(configure)` is exactly that overload
with the first argument derived and deleted — a one-argument-forward inline body whose parity with
the hand-written form is trivially visible — so builder ergonomics are never transformer-exclusive.

THE BUILDER IS GENERIC: its stages carry the service type `T`, and every impl door enforces
extension — `asClass(ctor: Ctor<any[], T>)`, `asFactory(fn: Func<any[], T>)`, `asValue(value: T)` —
the same constraint (§143) threaded through the builder path, not only the flat verbs. `T` defaults
to `any`: `add<T = any>(type, configure)`. Sugar derives `T` precisely; a hand-roller may spell it
(`add<IRepo>(…)`) for full enforcement, or omit it for `<any>` and no enforcement — opt-in safety,
consequences owned, no `Type`-surface change, no phantom.

The configure dialect offers `withType` AND `withSignature` after the `as`-verb, EXACTLY ONE of
which must be used — stage types make the completion state reachable only through one of them,
once, with a runtime guard backing the untyped caller. `withSignature(args)` supplies argument types
only, composing internally with the address in the instance slot; `withType(node)` supplies the
whole composed constructable, typed per the `as`-verb (`ConstructorType` for `asClass`, `FunctionType` for
`asFactory`) — sugar substitutes `withType` with the transform-derived precise node, and a
hand-writer reaches for `withSignature`. Deep signatures remain irreducibly deep; the object-overload
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
registration of the element. Binding is a property of the SYNTHESIZED descriptor-miss fallback
only: the synthesized `array` materializes at resolution, and the synthesized `iterable` is
late-bound, each element resolving at iteration time. A
registration answering at lookup under an aggregate address binds however its own descriptor binds
— the engine imposes nothing on it. A registration under an aggregate address answers at lookup
before synthesis, uniformly, with no reserved-name carve-out in the door and no warning machinery:
shadowing an aggregate is legal, and the consequences belong to the registrant.

`getServices(type)` forwards to the iterable aggregate through the one resolution door and never
throws or returns `undefined` for zero matches — the empty aggregate is the answer.

_Owner-directed 2026-08-13._

## §146 — di2's `IOptions<T>` is one open registration; the composed-generic derivation question is still open

`IOptions<T>` is served by ONE open registration in di2 — `IOptions<$T>` with a
placeholder-parameterized impl, the same mechanism the open logger registration already uses. No
call site composes `IOptions<T>` as a spelled type: the sugar body registers the per-`T` pipeline
pieces under a bare `typefor<T>()`, the open registration's `realize` reads its bound placeholder,
and a consumer's closed request (`typefor<IOptions<UserOptions>>()` at a call site) matches the open
registration through the ordinary match walk.

The consequence is that the composed-generic derivation question dissolves for this case — no
engine grammar extension, no new derivation path is needed — and the `tokenfor`/`tokenof`/
`nameoftransform` trio retires once the `addOptions` body is rewritten to bare `typefor<T>()`.

**Still open**: whether a bare `typefor<T>()` derives correctly inside a SUBSTITUTED body is
unverified — its sibling `tokenof<T>()` is witnessed working there, but `typefor<T>()`'s own
substituted-body behavior is the premise to probe before the trio retirement can proceed.

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
`tag` with `TagType` — and a spec interface pairs with its factory, so `Type.imported` takes an
`ImportedSpec`.

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

Handing a value over later is a property of the call site, not of the type being named. "A `T`
delivered later" is `Promise<T>` — the ordinary global generic that a `Promise<T>` reference already
derives to — so `Type.async` and the `Async<E>` wire spelling are gone with nothing replacing them.

`AsyncIterable<E>` factors the same way: an async sequence is a call site's iteration protocol over a
collection, and `AsyncIterable` is a real TypeScript name that spells as an ordinary global generic.
Its dedicated aggregate kind is gone too, and with no kind left to produce one, the engine's
async-iterable call site and its realization go with it.

`Type.iterable` and `Type.array` are the aggregates that remain, and they are the only addresses
carrying collection-resolution semantics. What survives untouched on the derivation side: an
`AsyncIterable<E>` reference derives exactly as it did, emitting the ordinary global generic and the
same token, and the arity trim that keeps a lib-declared `AsyncIterable`'s defaulted tail parameters
out of a derived address stays — that is derivation hygiene, not a kind.

_Owner-directed 2026-08-13._

## §152 — A signature carries its own quantifiers

`FunctionType` and `ConstructorType` hold a `genericArgs` list: the holes the signature itself
quantifies, in declaration order, empty for a concrete one. The name is shared with a nominal type's
constructed arguments and so is the meaning — these are what a request CLOSES, positionally.

Quantifying is part of the type. `<%T>() => app:Box<%T>` ranges over the hole; a signature that
merely mentions `%T` names one particular open type. Identity includes the list, so those two intern
as different nodes, and that distinction is the point of carrying it. Substituting a quantified hole
discharges its quantifier, so closing an open signature lands on the requested node itself rather
than on a look-alike.

The spec object is the door — a positional `Type.func(returnType, ...args)` call spells a concrete
signature — and the token grammar extends additively: a quantifier list is written in front of the
signature it binds, `<%T>(%T) => app:Box<%T>`, reachable through the arrow, `new` and reserved
`Func` / `Ctor` spellings alike. A token carrying no quantifiers spells exactly as it always did, so
the parity invariant binds unchanged.

_Owner-directed 2026-08-13._

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

Every manifest verb whose long overload used to take a naked `Signatures` array (`ReadonlyArray<
ReadonlyArray<Type | string>>`) as its dependency-signature argument now takes the composed impl
type instead — `ConstructorType | IntersectionType` for `addClass`/`tryAddClass`/`replaceClass`,
`FunctionType | IntersectionType` for `addFactory`/`tryAddFactory`/`replaceFactory`,
`ConstructorType | IntersectionType | undefined` for `addHostedService`'s ctor overload. `add`/
`tryAdd` already took `implType` this way — the array-taking verbs were the residue. Each verb
derives its stored `TypeSignatures` from the composed type via `TypeSignatures.fromImplType`
(`libraries/di.core/src/ServiceDescriptor/Signature.ts`): a `ctor`/`func` node yields its own `args`
directly, an intersection flattens one signature per member, and anything else throws — the same
"describes nothing callable" error the builder's `withType` has always raised.

The builder chain (`withSignature(...paramTypes)`, `Signatures.overrideSignatures`) is the ONE place
a naked signature array stays first-class — it is the hand-roller's door, unaffected. Descriptor
storage (`ServiceDescriptor.ctor`/`factory`, `TypeSignatures`) is unchanged; this is a verb-surface
spelling change, not a resolution-semantics one.

**Convention, not enforcement**: the composed type's own instance/return slot carries the SERVICE
address (the same type the verb's first argument names), never the implementation's own concrete
type — the container reads nothing from that slot, so this is a spelling convention every call site
in this repo now follows, not a checked invariant.

**Left open**: the `signatureof(ctor)` primitive (`di.extras`) still lowers, on the Go side
(`transforms/internal/signatures`, `transforms/internal/signaturetransform`), to the RETIRED
`[[...]]` array form — a pre-Type-native token-string derivation engine that predates this ruling
and was never updated for it. No current call path actually exercises it: the real `addClass<T>`/
`addFactory<T>` di.extras sugar (`ManifestServiceAugmentations`) only elides the TOKEN argument
(`typefor<T>()`) and forwards the rest positionally — it never calls `signatureof` — so
`tests/di.signatureof.ttsc.e2e`'s fixture (which hand-declares a bare one-argument `addClass<I>
(ctor)` override matching that forwarding body) never reaches the signatureof stage at all, and
passes without asserting anything about a third argument. Migrating `signatureof` to emit
`Type.ctor(...)`/`Type.func(...)` (reusing the value's own construct/call signature the way
`typefor(value)` already narrows it, `transforms/internal/typefortransform/derive.go`) is real,
scoped, remaining work — its two open questions are whether a factory-typed dependency argument
still needs the old engine's special "inject a callable" slot form or collapses to a plain
`FunctionType` argument, and how an open-template hole (`Typeof<T>`/`typeArgSlot`) spells as a
`Type` node, which is the closing-type engine lane's (§21) territory to settle first.

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
can carry both readings, `[[$T, Holder<$T>]]` delivering the type for the first slot and a `Holder`
instance for the second.

The hole spells as `Type.generic(label)`, and it reaches a signature either written there directly
or derived from the implementation type — `Type.ctor(ILogger<%T>, ILoggerFactory, %T)` yields a
signature whose second slot is the bare hole — so the two surfaces agree on what a slot means.

An instance of the BARE closing type is therefore deliberately inexpressible. The escape is to ask
for `IServiceProvider` beside the delivered type and look the instance up with it. No new `Type`
kind carries the distinction: the slot's own shape is the whole of it, read before substitution.

That ordering is what the engine's shape follows from. The registry hands the lowering the
registration as authored plus the bindings its match captured, rather than a descriptor already
substituted — substituting first closes a bare hole into an ordinary type and erases the very
distinction the rule turns on.

_Owner-directed 2026-08-13._

## §158 — A plan belongs to the manifest it was built from; a chosen answer that fails, fails the resolution

Plans are cached against the manifest. A resolution carrying additional descriptors — a latebound
call's arguments, entering as registrations for that walk alone — is resolving a DIFFERENT,
ephemeral composed manifest: it never reuses a manifest-only cached plan, and its own plan never
enters the shared cache. The additionals are the most recent registrations in that composed
manifest, so they win the addresses they answer.

Union member choice follows the same boundary. It is decided per-manifest, against the full
descriptor universe of the resolving call, so a call argument supplying a second member makes a
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
Type.func(openOptions, RESOLVER_TYPE, hole, baseFactoryType(hole));
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

## §161 — `tokenfor`/`tokenof` leave the authoring surface; their Go stage stays, pending its own pass

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

## §163 — `signatureof` emits a Type node; the derivation engine is shared, not typefor-owned

`signatureof(ctor)` / `signatureof(factory)` now lower to a `Type.ctor(...)` / `Type.func(...)`
node — the instance/return type followed by each dependency's own type, in order — matching
`TypeSignatures.fromImplType`'s reading (§155) and superseding the retired `[[...]]`
dependency-signature array the old token-string engine emitted.

The derivation reuses typefor's own type-classification narrowing exactly, because it now IS
typefor's narrowing: `deriveTyped`/`emitDerived` moved out of `typefortransform` into
`tokens.DeriveTyped` (classification) and `typeemit.EmitDerived` (emission), since a second
primitive now needs the same Func/Ctor/Tag layer over `DeriveTypeF`'s named/literal/placeholder
tree — the comment that once justified keeping it typefor-local ("only typefor does this
classification") stopped being true the moment signatureof needed it too. `typefortransform` keeps
only its own accessor-folding peephole (`.returnType`/`.args`/etc.), now built on the shared
functions. Both primitives derive an identically-shaped value identically: `signatureof(Foo)` and
`typefor(Foo)` produce the same node for the same `Foo`.

The signatureof stage's own remaining code is a thin caller: a construct/call-signature presence
check (mirroring the primitive's long-standing "not a constructable or callable value" gate,
silent — the emit sweep's concern) ahead of the shared derivation, and a kind check rejecting a
derivation that lands on Tag/Leaf instead of Ctor/Func. The whole array/slot machinery
(`Signal`/`tokenSlot`/`factorySlot`/`unionSlot`/`literalSlot`/`typeArgSlot` and their per-parameter
classification) is retired along with it — every one of those forms is now just an ordinary `Type`
node, resolved generically by the engine rather than pre-digested into a flat runtime shape.

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
`codeUnderivableToken` rather than misrepresent the signature's arity. This is a shared, pre-existing
gap (typefor's own value-argument derivation has never expanded a rest parameter either), not
something new to signatureof; closing it is a separate, larger derivation-engine question.

_Claude-directed 2026-08-13, executing the owner's §155/§157 direction._

## §165 — A factory-typed dependency is a plain `FunctionType` argument; no special injected-callable slot

A constructor parameter whose type is a plain function type (`(dep: IDep) => IThing`) derives as an
ordinary nested `Type.func(returnType, ...argTypes)` node — the SAME derivation any function-typed
value gets, nothing signature-position-specific. The landed resolution engine (`ToCallSiteVisitor`,
`libraries/di/src/internal/CallSite/`) already handles this generically as a synthesis fallback:
`visitFunc` builds a `LateBoundCallSite` whose invocation re-enters the engine to resolve the
function type's OWN return type, with the call's own arguments registered as value descriptors for
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

## §166 — A factory value's OWN directly-holed parameter is a known signatureof gap, not a crash risk

`signatureof(factory)` where `factory`'s own parameter directly names an open-template hole
(`(store: IStore<$<1>>) => ...`, the hole written straight into the parameter's annotation rather
than arriving through a class's own generic instantiation) fails to derive: the checker resolves
that parameter's type differently for an arrow-function-literal parameter than for an
otherwise-identical constructor parameter of a class, and `tokens.DeriveTyped` reports it
underivable rather than guess at a node. The call is left un-lowered with a `codeUnderivableToken`
diagnostic — the same safe degradation every other underivable shape gets, never a malformed
partial tree and never a crash.

This is narrow: a factory registered under an OPEN service token is a class-only-registration error
on the (retired) di-direct path, so a hole surfacing through a factory's own parameter was already
documented as reachable only via a standalone `signatureof` call, never through an actual open
registration. Closing it is future work, not blocking — the ctor path (a hole arriving via a class's
own generic instantiation, `Repo<$<1>>`) derives correctly today.

_Claude-directed 2026-08-13, executing the owner's §155/§157 direction._
