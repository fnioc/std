# Decisions (v2)

The live record of **owner-ratified** design decisions. Each entry keeps its original `§N`
id so existing `§N` citations across the codebase still resolve here. Entries arrive only two
ways: migrated from the retiring `decisions.md` on explicit owner approval, or recorded fresh
when the owner signals to save one. Kept terse on purpose — this doc is primarily for Claude's
use. Migration rules live in the block at the top of `decisions.md`.

---

## §92 — Authoring-only inline primitives live in their domain `*.transformer` package (no structural mirrors)

An inline-stage primitive that is ONLY ever called inside inline bodies (never in runtime source) is an authoring-time construct: it lives in its domain's `*.transformer` package, not `@rhombus-std/primitives`, and never as a structural mirror of the type it returns.

- `signatureof` (DI dependency-signature extraction) → `di.transformer`, which peers on `di.core`, so it returns di.core's real `DepSignatures` / `DepSlot` directly. The former primitives-side mirror (`DepSlotLike` / `FactoryRefLike` / `UnionLike` / `LiteralRefLike` / `TypeArgRefLike`) is deleted.
- `schemaof` (config `Schema` from a type) → `config.transformer`, which peers on `config` and already owns the `ts.Type`→`Schema` codegen + the `OPTIONAL` import injection.
- `nameof` STAYS in `@rhombus-std/primitives` — it is the one primitive called in RUNTIME source (`registerAugmentations(nameof<T>(), …)`), so every runtime package must import it. That runtime call-site is the discriminator between a universal primitive and an authoring-only one.

Consequences: the inline BODIES and their `rhombus.inline` markers move to the transformer packages too — a runtime package cannot depend on its own transformer (the reverse of the real edge) — which deletes the old "inline.ts excluded from the runtime bundle" gymnastics; runtime packages stay clean. The Go inliner gate becomes a `knownPrimitives` name→home-module map (multi-package). This dissolves the prior schemaof blocker with no gate-widening and no hoisting of config's `Schema`/`OPTIONAL` into the zero-dependency leaf.

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

## §74 — `nameof` and token derivation

`nameof<T>()` is declared in `@rhombus-std/primitives` with a throwing body (a call reaching runtime means the transformer wasn't wired). The transformer lowers it to a token identifying where `T` sits in the exports graph — the package barrel for a publicly-exported type (`pkg:Type`), the `_` subpath for a tests-only one (`pkg/_/file:Type`). It keys on export **membership**, not on-disk path, so a package's own build and an external consumer derive the identical token. _Owner-approved._

---

## §83 — The `_` export is for tests and `nameof` only

Each library's `./_/*` subpath maps to `./src/*` and is publish-scrubbed, so it is reachable by exactly two things: that library's own white-box tests (which import through it), and `nameof`'s token form for a type reachable only through it (`pkg/_/file:Type`, §74). Nothing in shipped code imports through `_`. _Owner-approved._

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

## §90 — One owner `ttsc` binary, runtime stage selection from a per-consumer declared list

The Go/`ttsc` build engine (§41) ships as **one owner binary**, `transforms/cmd/ttsc-std`, linking
every transform stage. A consumer's `tsconfig.ttsc.json` declares which stages it wants; the
binary parses that declared list at runtime and activates only those stages, always executing in
the hardcoded canonical order (nameof → di → di-options → config) — declaration order is
irrelevant. Every consumer's `ttsc` descriptor resolves to this same source dir, so `ttsc` dedupes
every consumer to one cache key and one spawn.

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

Typia/mergesynth (issue #213) stays scoped **in-repo-only** per §87: it runs as an in-process embed
inside a separate in-repo-only host variant, never in the published `ttsc-std` binary — the
published/external host stays typia-free and offline-capable.

Declare-by-depending (a marker that lets `ttsc` auto-discover a consumer's declared stages from its
dependency graph rather than a hand-authored list) is a supported nice-to-have, not a requirement
of this decision.

Mechanics — descriptor/source dedup, `--plugins-json` shape, the stage-selection error contract,
the publish story — live in `docs/features/transformer-architecture.md`, the canonical reference; this
entry records only the ruling. _Owner-approved 2026-07-16._

## §91 — Inline-stage matching is by symbol identity, not a string key

A `rhombus.inline` entry's `type`+`member` pair resolves through the checker to a symbol, once per
program: the type reference resolves to a module symbol, then to the merged member symbol that
TypeScript's declaration merging has already unified from every `declare module` augmentation of
the interface. Each call site independently resolves its own signature → declaration → symbol, and
the two sides match by that resolved symbol identity — never by a string key, canonical name, or
reconstructed token.

Four canonical-string-key designs were tried and rejected before landing here. A string key has to
be derived from some one declaration site, but the whole point of `declare module` augmentation is
that N separately-authored declarations of "the same" member collapse onto a single symbol — a
string reconstructed from any one of those sites can't know about the others, and drifts the moment
an augmentation changes shape. Symbol identity is what actually exploits the collapse; a string key
can only approximate it.

Scope stays workspace-only — never a published manifest, never a dist/JS resolution path
(consistent with §87) — and the certified grammar is narrow: interface member (`type`+`impl`+
`member`) and free function (`impl` only) are certified; class member and object-literal member are
specced but flagged uncertified. Matching goes one level deep, no recursion.

Full schema, the authoring lint, and the tripwires (rogue-duplicate, emit sweep) live in
`docs/features/transformer-architecture.md`; this entry records only the identity-vs-string ruling.
_Owner-approved 2026-07-17._

## §94 — Resolve-family sugar inlines via type-predicate primitives

The tokenless resolve family (`resolve<T>()`, `resolveAsync<T>()`, `tryResolve<T>()`) lowers
through the generic inline stage with plain certified bodies. Type-directed dispatch is expressed
**inside** those bodies via compile-time predicate primitives, never via context-sensitive matching
in the engine.

Two authoring-only primitives live in `primitives.transformer` (per §92's homing rule), shipped as
throwing stubs like `nameof`: `isSingular<T>(): boolean` and `singularValue<T>(): T` — "singular" is
the token grammar's term for a type with exactly one value: a literal, `null`, `undefined`, or
`void`. The canonical body is `isSingular<T>() ? singularValue<T>() : this.tryResolve(nameof<T>())`.
Resolving a singular type IS its value: a hand-written `tryResolve(nameof<'dev'>())` folds
identically, so the sugar and the explicit form share one semantics.

The inline engine constant-folds after primitive lowering — boolean-ternary dead-branch pruning,
run **before** the emit sweep so a pruned-branch primitive never trips it. A surviving unguarded
`singularValue<T>()` over a non-singular type raises a targeted diagnostic. The factory form
(`resolve<F>()` where `F` is a function type, lowering to `resolveFactory`) uses the same pattern
plus signatureof-shaped extraction in the true arm.

Implementation notes: the exact primitive names/signatures and the diagnostic wording are Claude's
call, applying §92's homing rule to this family. _Owner-directed 2026-07-18._

## §95 — `addOptions` sugar homes in its transformer satellite

The phantom `addOptions<T>()` typing, its certified inline body, and the `rhombus.inline` marker all
live in `di.transformer.options` (per §92); `options.augmentations` keeps only the runtime explicit
verbs. The compile-time guard stands: without the satellite in the program, the 0-arg form does not
typecheck — no compiles-then-throws.

The bespoke di-options lowering stage retires into the generic inline path: the body lowers to a
dot-call of the explicit verb (`this.addOptions(nameof<IOptions<T>>(), nameof<T>())`), so the
augmentation prototype wrapper and any merge dispatcher execute exactly as they would for
hand-written code. This requires the inline engine to support nested closed-generic type-argument
instantiation (`nameof<IOptions<T>>()`).

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

## §98 — Keyed sugar composes through `keyof` and a tail key parameter

A single authoring-only primitive, `keyof<T>()`, lives in `di.transformer` (lowercase — reserved
only in type positions, family-consistent with `nameof`/`signatureof`/`schemaof`, per §92's homing
rule). It lowers to the key of a `Keyed<T, K>` type argument (`'audit'`) and to `undefined` for a
non-keyed type. `nameof` over `Keyed<T, K>` derives the BASE token unchanged — base extraction, not
key loss — so `keyof` and `nameof` are two independent readings of the same phantom brand.

The explicit registration verbs each carry ONE signature with an optional TAIL parameter —
`add(token, impl, signatures, key?)`, `addFactory(token, fn, signatures, key?)`,
`addValue(token, value, key?)` — never an overload pair. The runtime composes the full token as
`[token, key].filter(Boolean).join('#')`, so any falsy key means "unkeyed" — unifying with
`resolve`'s existing `key = ''` default (§85), which stays unchanged.

A certified inline body passes `keyof<T>()` unconditionally in tail position; the emit drops a
trailing argument that lowered to the literal `undefined` (defaulted parameters fire on
`undefined`, and nothing reads `arguments.length`), so unkeyed lowered output stays byte-identical
to the pre-key form. Keyed registrations therefore lower through the generic inline path (§91,
§94) with no bespoke handler and no fence — `keyof` is just another primitive the same engine
folds.

_Owner-directed 2026-07-19._

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

The same recursive scan that activates stages also collects certified bodies (the `rhombus.inline`
markers, §91), including from the consumer package itself; a third-party sugar library's own
consumers receive the needed stages transitively, through that library's `*.transformer`
dependencies, with no action of their own. Explicit `tsconfig.ttsc.json` declaration (§90) remains
the override and opt-out path.

A plain consumer never authors a `rhombus.inline` marker. Authoring one makes a package a toolchain
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
