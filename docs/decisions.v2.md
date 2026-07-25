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
- `tokenfor` STAYS in `@rhombus-std/primitives` — it is the one primitive called in RUNTIME source (`registerAugmentations(tokenfor<T>(), …)`), so every runtime package must import it. That runtime call-site is the discriminator between a universal primitive and an authoring-only one.

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

**Superseded by §103:** `mergesynth` (#213) originally ran in a separate in-repo-only host to keep
the published `ttsc-std` typia-free. §103 folds it into the one binary — `ttsc-std` links typia (a
build-time plugin binary, never shipped runtime); the emitted JS stays typia-free plain JS.

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
throwing stubs like `tokenfor`: `isSingular<T>(): boolean` and `singularValue<T>(): T` — "singular" is
the token grammar's term for a type with exactly one value: a literal, `null`, `undefined`, or
`void`. The canonical body is `isSingular<T>() ? singularValue<T>() : this.tryResolve(tokenfor<T>())`.
Resolving a singular type IS its value: a hand-written `tryResolve(tokenfor<'dev'>())` folds
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

## §98 — Keyed sugar composes through `keyof` and a tail key parameter

A single authoring-only primitive, `keyof<T>()`, lives in `di.transformer` (lowercase — reserved
only in type positions, family-consistent with `tokenfor`/`signatureof`/`schemaof`, per §92's homing
rule). It lowers to the key of a `Keyed<T, K>` type argument (`'audit'`) and to `undefined` for a
non-keyed type. `tokenfor` over `Keyed<T, K>` derives the BASE token unchanged — base extraction, not
key loss — so `keyof` and `tokenfor` are two independent readings of the same phantom brand.

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
`rhombus.inline` BODIES (§91), and its own stage (`di` / `di_options` / `config`). This complements
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

## §106 — Open-generic matching is typed-`TokenNode` unification; the string grammar stays the classification boundary

Closing an open template (`pkg:IRepo<$1>`) against a ground token (`pkg:IRepo<pkg:User>`) is done by a typed token model (`di.core/src/token.ts`), not string manipulation. A token STRING stays the registration identity (§9's `Map<Token,…>` keys, §13's grammar); a `TokenNode` is its parsed view — a `ConcreteToken` / `HoleToken` / `ProviderToken` discriminated union with a canonicalising `parse`/`tryParse`, canonical `stringify`, directional `match` (unification), `substitute`, and a `specificity` metric. The engine (`ServiceProviderClass.#lookup`) now closes an open registration by `tryParse(ground) → match(template, ground) → substitute`, replacing the deleted `#matchOpen` / `#bindPattern` string routines.

- **Holes are labels, not indices.** `$N` binds by label, so a template may use non-sequential, reordered holes (`add<IFoo<$7, SomeType, $3>>(Foo<$3, $7>)`): `match` records a label→token map, a repeated label must bind consistently (canonical compare), and `substituteSignaturesByLabel` closes the carried dep signatures by that map — throwing `RangeError` on an unbound label so a gappy template (`IX<$1,$3>` depending on `$2`) stays a clean miss, not a crash.
- **Why typed, not the earlier regex/string idea.** A no-transformer author can write arbitrary whitespace and quote styles; the parser canonicalises both away in one pass, so semantically-equal tokens compare byte-identically. Decisively, a literal union serialises `" | "`-joined (space-pipe-space) byte-identical to the Go transformer's `strings.Join(members, " | ")`, so a re-derived union matches a transformer-spelled exact registration — regex over raw strings could not carry that guarantee across arbitrary user input.
- **The string grammar is retained, not deleted.** §13's `isOpenToken` / `parseToken` / `HOLE_PATTERN` / `closeToken` remain the open-vs-closed classification at registration and a public compat surface; `TokenNode` owns only matching + substitution. That split is what keeps behaviour byte-identical — exact-match/last-wins (§11), collections (§12), keyed tokens (`base#key`, §98), the provider intrinsic, scopes / captive-dep / validation / disposal, and every error at its exact throw site are all preserved.
- **Seal derives two frozen index maps** (`SealedManifest.registrations` exact + `openRegistrations` keyed by canonical `baseKey`) via toArray-at-seal in `ServiceManifestClass`.
- **Gated OFF (deliberate, no consumer yet):** partial closing (a concrete arg inside a template) and most-specific-wins template selection are implemented and unit-tested in `token.ts` (`match`'s concrete arm, `specificity`) but the engine keeps the all-holes open-registration guard and scans templates pure-recency. Enabling them is a one-guard-removal, ME-divergent follow-up. — **SUPERSEDED:** both are now live — the all-holes registration guard is retired so partial closing works (§124), and template selection is most-specific-first (§125). The string-grammar-as-classifier half is superseded too: `isOpenToken` reads the typed tree now (§127), so `materialise` and `#lookup` classify off `TokenNode` and the shallow scan survives only as the fallback for a token the tree grammar refuses.

Landed PR #265 (di.test 373 green + full CI gate incl. the `examples.app` e2e). _Design owner-directed_ (the typed-model, label-keyed, unification direction was owner-driven through the design conversation); the behaviour-preservation calls — keeping §13's string predicates as the routing boundary, the `" | "` serialisation fix, and gating partial-closing / most-specific-wins — are Claude's. _2026-07-20._

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

## §114 — A mutable-slot holder is the seam between an immutable manifest and a stateful builder

`ServiceManifest` is immutable (an iterable decorator chain; every verb returns a NEW manifest). Everything that _wraps_ a manifest and is configured by a caller-supplied delegate — `ILoggingBuilder`, `IMetricsBuilder`/`ITracingBuilder`, `IHostApplicationBuilder` — therefore cannot register "into" the manifest it was handed. The seam is a single MUTABLE SLOT: di.core exports `IServiceManifestHolder` (`{ services: IServiceManifest }`), a builder's `services` is that writable slot, and every builder augmentation does `builder.services = builder.services.addX(...)` and returns the same builder. Mutation-shaped ergonomics survive; the chain underneath stays immutable.

Two consequences are load-bearing:

- **Long-lived sibling builders SHARE one holder.** `HostApplicationBuilder` passes `this` as the holder to its `LoggingBuilder` and `MetricsBuilder`, so `builder.logging.addConsole()`, `builder.metrics.enableMetrics(…)`, and `builder.services = builder.services.add(…)` all land on one chain. Constructing them over a manifest VALUE forks the chain three ways and `build()` silently drops two of them. `LoggingBuilder`/`MetricsBuilder` therefore take `IServiceManifest | IServiceManifestHolder` and expose `services` as an accessor pair, not a field.
- **A short-lived builder is read back.** `addLogging(configure)` / `addMetrics(configure)` / `configureLogging` allocate a builder, run the delegate, and return `builder.services` — never the manifest they were given.
- **Per-configuration dedup keys on the BUILDER, not on `builder.services`.** The console sinks' `TryAddEnumerable`-idempotence `WeakMap` would otherwise see a fresh key on every call, since the manifest object changes with each registration.

`IHostBuilder.configureServices` / `configureContainer` become RETURNING delegates (`Func<[HostBuilderContext, IServiceManifest], IServiceManifest>`): a delegate is the one place with no builder to write through, so the manifest has to come back out. A void `Action` there is a silent-drop trap — it typechecks and registers nothing.

Build-config corollary: a package whose rolled `.d.ts` INLINES di.core forks `IServiceManifestBase` — the inlined copy carries di.core's own `declare module` self-augmentation, whose return types bind to the inlined interface, so `services = services.removeAll(t)` stops typechecking downstream. Every package that depends on di.core must keep it external in `rollup.dts.mjs` (this bit `@rhombus-std/options`).

_Claude's call (holder shape, shared-slot wiring, returning delegates), forced by the owner-directed immutable-manifest change; renumbered §107→§114 (#270/#271 took §107 on main)._

---

## §108 — Immutable decorator-chain manifest; `addClass`/`addFactory`/`addValue` replace `add`

`ServiceManifest` becomes an immutable, iterable decorator chain: every registration verb wraps its receiver in a new frozen node carrying exactly one entry (`yield* inner` then its own, so iteration order is authoring order), and NOTHING mutates — a call whose result is discarded registers nothing. The single ambiguous `add()` (discriminating class vs. factory by argument inspection) is replaced by three explicit verbs — `addClass` / `addFactory` / `addValue` — so the method name carries the discrimination instead of runtime arg inspection. `AddChain`'s slot algebra (`signature` / `signatures` / `scope` / `key`, order-free, each fillable at most once except the repeatable append slot) is the type machinery threading which chain face a call returns; see `docs/libraries/di.md` divergence 11 for the authoring picture and `libraries/di.core/src/authoring.ts` for the implementation. Builders that wrap a manifest and are configured by a caller delegate keep mutation-shaped ergonomics on top via the `IServiceManifestHolder` mutable-slot seam (§107). _Owner-directed (the immutable-chain + verb-split direction); the `AddChain` slot mechanics are Claude's._

---

## §109 — Gated fluent signature builder: `withSignature` appends, `withSignatures` replaces, sugar overrides

The plugin-less 2-arg `addClass(token, ctor)` / `addFactory(token, factory)` forms withhold the manifest face (`build` / `addClass` / `seal` absent from the returned type) until a dependency signature arrives — a mandatory-signature compile-time gate, not a runtime check. `withSignature(...slots)` opens the gate and is repeatable (APPENDS one more overload each call, strikes only the bulk `signatures` slot); `withSignatures(...sigs)` opens the gate as a once-only BULK replace (strikes both slots). Supplying a signature positionally (the 3+-arg overloads) starts the chain already ungated, and a positional signature can still take a `withSignature` append afterward (`addClass(t, c, [[…]]).withSignature('a')` is hand-writable — this is what keeps the di-direct Go lowering byte-parity, §113). `.as()` / `.withKey()` refine without opening the gate. Under the transformer's type-driven sugar (`addClass<I>(C)`), the signature is derived from the constructor so the chain is never gated — `withSignature<T>()` / `withSignatures<T>()` there are OVERRIDES onto the derived signature, not gate-openers, distinguished by the `Gated` type parameter on `AddChain`. Full mechanics: `libraries/di.core/src/authoring.ts`, `docs/libraries/di.md` divergence 11. _Owner-directed (the gate / append / bulk semantics settled in conversation); Claude's implementation._

---

## §110 — Primitive naming: `-for` mints an identity, `-of` observes an existing one

`nameof<T>()` is renamed `tokenfor<T>()` (it MINTS a token identity for `T`, never observed anywhere), and the two new derivation primitives introduced for the fluent signature builder follow the same rule: `signaturefor<T>()` (1-D, mints one overload's dependency slots) and `signaturesfor<T>()` (2-D, mints the whole signature set) mirror `withSignature` / `withSignatures`. `-of` stays for primitives that OBSERVE a property that already exists on the target: `signatureof(ctor)` (observes a constructor's own param types), `keyof<T>()` (observes a `Keyed<T,K>` brand), `valueof<T>()` (observes a literal type's value — the `.as<Scope>()` sugar's scope half). The pipeline STAGE id `nameof` is unchanged (the stage name, not the function — e.g. `primitives.transformer`'s `"stages": [..., "nameof", ...]`); only the authored function it lowers was renamed. Full mapping: `docs/features/transformer-architecture.md`. _Owner-directed (the -for/-of convention itself); the `tokenfor` rename and the two new primitives' placement are Claude's, done as a dedicated PR per the owner's "name them right the first time" direction._

---

## §111 — One `TokenNode` tree serves both the resolve side and the signature side

A resolve argument and a signature slot are the SAME expression shape, so `substitute` / `validate` / `stringify` / `match` are written ONCE over a single plain-data discriminated-union tree (`concrete | hole | provider | union | literal | factory`, `libraries/di.core/src/token/`) instead of the five parallel string-substitution routines the pre-immutable-manifest branch had. Nodes stay plain data (never classed) so the established immutable-update idiom (`{ ...n, args }` spread) keeps working; operations are a typed visitor base (`TokenRewriter` for rewrites, `TokenWalker<T>` for queries) dispatching one `assertNever`-closed `switch(kind)`, not `accept`-on-node. The wire format is UNCHANGED: parsing happens at the edges (`parse` / `stringify`) and the stored/emitted `DepSlot` keeps its original compact array-literal shape — the tree is a transient parsed view, never the ABI. Landed as the wire-stable slice of the redesign; `FactoryRef` staying flat (not yet every position a `TokenNode`) and the union-blow-up wiring are the deferred wire-changing remainder (§112). _Owner-directed (the unification + parse-at-edges direction); the visitor shape and node-as-plain-data reasoning are Claude's._

---

## §112 — Union blow-up to static overloads: abandoned, not deferred

An earlier plan blew a union dependency slot into cartesian overloads at registration time (`[[union(A,B),C]] → [[A,C],[B,C]]`) so union resolution could fold into ordinary overload selection and the per-param runtime union resolver could be deleted. This is ABANDONED, not merely deferred: the equivalence argument was wrong. Per-param `#resolveUnion` has a runtime fall-through a static overload set cannot express — a union member that IS registered but THROWS while building (or whose `Promise` rejects) falls through to the next member at RESOLVE time, while presence-based overload selection can only see registration-time shape. Keeping per-param resolution is therefore load-bearing (`union.test`'s GAP2/GAP4 and the async-reject case). `blowUpSignatures` (`token/slot.ts`) stays implemented and exported but is dead code, to be removed in a vestigial sweep; `Validator` does not reject `union` on the resolve side. _Flagged for owner review — this reverses an earlier "yes" on the blow-up given mid-session; Claude's finding, made while gating the token-tree-unification PR._

---

## §113 — Chain sugars (`.as` / `withSignature` / `withSignatures`) need di-direct Go recognizers, not just inline bodies

The general single-expression inline stage is not sufficient to lower the three chain-modifier sugars on its own, for two independent reasons: it substitutes only the OUTERMOST call in a chain, so inner modifiers (`.withSignature` / `.withSignatures`, and a `.as` preceding them) are never reached; and it is INERT once `di.core` ships dist-referenced (the real consumer mode has no `di.core`-source witness for the inline substitution to match against). The `di` Go stage therefore owns DI-DIRECT lowering for all three (the `.as`, `withSignature`, and `withSignatures` recognizers), routed through the same factored `valueof` / `signaturefor` extraction the inline path uses, so both paths emit byte-identical output. This reverses an earlier "general-inline-only, avoid bespoke Go" steer for these three sugars specifically — the di-direct recognizers are load-bearing and must not be deleted in a vestigial-code sweep. _Claude's finding (made while gating the fluent-signature-builder PR); flagged for owner review since it reverses the inline-only steer._ **Superseded by §115** — the fixed-point rewrite deleted the `di` Go stage and its recognizers; the loop reaches inner chain positions and the transitive-witness module-resolution fix makes the inline path active for di-direct consumers, so the chain sugars lower through inline bodies for both paths.

---

## §115 — Fixed-point loop replaces stage-order dependence; the enabling invariant is disjoint match sets

The transform engine runs one ordered set of primitive stages repeatedly, per file, until a pass
changes nothing (max 16 passes, loud `FIXED_POINT_EXHAUSTED` on exhaustion — never a silent cap),
instead of a single top-to-bottom sweep. Each stage matches only the OUTERMOST construct it
recognizes and does not descend into what it produced; a chain (`addClass<T>(C).withSignature<S>()
.as<Scope>()`) peels one call per pass. This is receiver-recursion-free by construction — no stage
author ever writes a visitor that walks into its own output — because the loop supplies the
recursion.

Correctness under repeated, unordered running rests on one invariant: **every stage owns matches
no other stage can claim** (inline: sugar declarations; each primitive stage: its own callee
symbol; mergesynth: `registerAugmentations`/`applyAugmentations` installs). A new stage must be
checked against this invariant before joining the set. In-pass order (documented in
`transformer-architecture.md`) is a reproducibility choice, never a correctness dependency — no
stage may require running before/after another within one pass. This supersedes §113's holding
that the chain sugars needed bespoke di-direct Go recognizers: with the loop reaching inner chain
positions and the transitive-witness module-resolution fix (§119) making inline active for
di-direct consumers, the di Go stage and its recognizers were deleted. _Owner ruling: "a few extra
iterations doesn't hurt anything. it's milliseconds."_

---

## §116 — No-type-arg registration derives the token from the VALUE, never from TS inference

`addClass(SqlUserRepo)` / `addFactory(fn)` / `addValue(v)` (self-registration, no explicit `<T>`)
derive their token from the argument's own type: constructable → its construct-signature return
type (`tokenfor(value)`); callable → its call-signature return type (`tokenfor(value)`); an
already-built value → its own raw type, never unwrapped (`tokenof(value)`). `RecoverTypeArguments`
is never extended to nested/value-based inference to cover this — the derivation is a distinct
primitive pair (`tokenfor`/`tokenof`, value-arg forms), not a smarter type-argument recovery.
Interface registration stays explicit (`addClass<ILogger>(ConsoleLogger)`) — there is no
self-registration path for a type other than the value's own. The `tokenof`/`tokenfor` split
exists specifically because a single value-arg primitive that branched on "which verb called me"
would put domain knowledge (which verb wants which derivation) inside the domain-neutral
primitive; the verb-side sugar body picks the primitive instead. _Owner ruling: "no-type-arg
registration binds from the VALUE, not from TS inference."_

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
call — an underivable token, a non-tuple `signaturefor<T>()`, an unsupported `schemaof<T>()` field
shape — which is failure reporting about the transform's own mechanism, not validation of the
user's design. _Owner ruling: "it's not transform's job to validate. don't do it. leave runtime
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

## §122 — Keyed resolve/isService semantics complete the §98 design; `keyedtokenfor` is the composed-lookup primitive

Every single-token consumer of a possibly-keyed type (`resolveAsync<Keyed<T,K>>()`,
`isService<Keyed<T,K>>()`) derives its token via `keyedtokenfor<T>()` — the composed-lookup
primitive that emits the SINGLE `base#key` string for a `Keyed<T,K>`, or the plain base for an
unkeyed `T` (unkeyed output stays byte-identical to the pre-existing form by construction). The
split-argument consumers (`resolve`/`tryResolve`, which carry a runtime key parameter) instead
derive `tokenfor<T>() + keyof<T>()` onto that existing parameter. This corrects a real gap: an
earlier form derived the single-token consumers' key via the raw alias-preserving `tokenof<T>()`,
which never matched a `base#key` registration — a keyed `isService`/`resolveAsync` silently
answered false / threw for every keyed type. di-direct's own `lowerResolveCall`/
`lowerIsServiceCall` carried the identical latent gap and are corrected by the same bodies. A
runtime round-trip test (a keyed resolve actually matching a keyed registration) backs the fix,
since the prior byte-parity-only nets couldn't have caught it — they proved inline matched
di-direct's output, not that di-direct's output was itself correct.

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

## §124 — The all-holes open-registration rule is retired; a template mixes concrete args and holes freely

`ServiceManifestClass.openEntry` used to enforce a v1 rule that every top-level type argument of
an open service template be exactly a hole (`$N`), throwing `OpenTokenRegistrationError` on
`addClass("pkg:IRepo<pkg:IUser,$1>", …)`. That rule is retired. The typed matcher (§106) has
always been fully recursive on its concrete arm — a concrete template arg requires an equal ground
arg, a hole binds — so partial closing worked end-to-end on the resolve side and only registration
blocked it. §118 killed the transform-side twin (diagnostics 990008/990009/990010) on the ruling
that validating a user's design is not a transform's job; this retires the runtime guard §118 left
standing.

`openEntry` now classifies nothing — `materialise` already routed to it off `isOpenToken` — and
only parses the template into the tree the engine unifies against. What it still rejects is a
template no closed token could ever match: one the typed grammar refuses (`"a b<$1>"`, whose base
stops at the space, leaving trailing text) and a bare hole (`"$1"`), which names no base to bucket
under. Both previously registered a **silent never-matches** — the unparseable one through
`openEntry`'s `node !== undefined ? … : parsed.base` fallback, so that phantom is fixed by the same
change. `OpenRegistration.pattern` (the parsed top-level args, documented as "each exactly a hole")
is deleted: it was written at registration and read nowhere, and its contract is exactly the
retired rule.

One known gap stayed OPEN at the time, pinned by a test rather than fixed: `materialise`
classified with the string-grammar `isOpenToken`, which requires the closing `>` to be the token's
last character, so a KEYED open template (`pkg:IRepo<$1>#k`, reachable via `.withKey`) read as
closed and registered as an exact holey entry no closing could resolve. Moving the classifier onto
`TokenNode.tryParse` + `TokenNode.isOpen` would fix that and drop the string grammar's second
parser, but it also flips `$0` from not-a-hole (`HOLE_PATTERN` is `/^\$[1-9][0-9]*$/`) to a hole
(the typed parser accepts any digits), which `token-grammar.test.ts` pins. — **CLOSED by §126**,
which classifies the UNKEYED token instead: a key suffix can neither introduce nor remove a hole,
so stripping it needs no new parser and leaves the `$0` question untouched. — **§127 then took the
`tryParse` route anyway**, because the key was only one of several spellings the raw-slice scan
could not see; `$0` is still held back by an explicit 1-based rule in the classifier, so the
`token-grammar.test.ts` pin stands.

_Owner ruling 2026-07-24: "that all-holes rule is retired — it is no more."_ The replacement
guard's shape (reject only what can never match, on the typed tree) is Claude's.

---

## §125 — Overlapping open templates are selected most-specific-first, not by recency

`ServiceProviderClass.#lookup` scanned the open-template bucket from the end — pure recency, which
§106 gated deliberately because under the all-holes rule the only possible overlap was
repeated-hole vs distinct-hole. §124 makes overlap the normal case: `IRepo<User,$1>` and
`IRepo<$1,$2>` share the `IRepo` bucket, and under recency an author who registers the specific
template first and the general one second silently resolves through the general one — a wrong
instance, not an error, and not discoverable. So the ranking §106 named as "a one-guard-removal,
ME-divergent follow-up" lands with the guard removal.

Candidates are ordered by `Specificity.measure` descending, ties broken by descending registration
index — the exact rule di.core's gated reference manifest already implemented and unit-tested
(that reference is gone as of §127; the engine's own `rankTemplates` is the only statement of the
rule now). Ranking is per closing and its result memoizes into `#closedMemo`, so
the sort is paid once per distinct closed token. Every pre-existing open-generic behaviour survives
by construction: identical templates score equally and fall to the latest index (last-wins, and
`.as()`'s scoped copy with it), `IPair<$1,$1>` (score 2) already outranked `IPair<$1,$2>` (1) by
registration order and now does so regardless of order, and distinct arities never share a bucket
slot to contend for. _ME-divergent: the reference DI has no most-specific-wins rule (its open
generics cannot carry a concrete arg at all, so nothing overlaps)._

---

## §126 — The di correctness sweep: keyed identity, open-template identity, and use-after-dispose

A general audit of `libraries/di.core` and `libraries/di` for correctness bugs and vestigial code,
run on top of §124/§125. Everything below was reproduced against the built bundle before it was
touched. The findings cluster: most of them are one identity question — _what token, exactly, does
this operation name?_ — answered inconsistently by two sides of the same seam.

**Keyed registration.** A keyed registration lives under the composed token `base#key`
(`keyedToken`), but three places named the bare base instead.

- `materialise` asked `isOpenToken` about the COMPOSED token. The string grammar cannot see a hole
  past a key, so a keyed open template classified CLOSED and landed as an exact entry on a literal
  holey string — a dead registration, no error. Classification moves to the BASE token, which the
  key cannot affect, and everything downstream already handled the keyed case (`TokenNode` parses
  `base<args>#key`, `openEntry`'s `baseKey` yields the `base#key` the open table is indexed by,
  `Matcher` compares template key against ground key). `addFactory`/`addValue` gain the same reach.
  This is the §124 gap, closed without the parser swap that entry contemplated.
- `tryAdd*` probed `hasRegistrations(base)` and `replace*` called `removeRegistrations(base)` while
  their add path composed `base#key`. So a keyed `tryAdd` was dropped whenever the UNKEYED token
  happened to be registered, two `tryAdd`s under different keys collided, and a keyed `replace`
  DELETED the unkeyed registrations while merely appending a second keyed one. All six verbs now
  compose through `keyedToken`, which di.core exports package-internally for them.

**Open-entry identity.** An open entry has two names — its TEMPLATE (`pkg:IRepo<$1>`) and the
canonical BASE it buckets under (`pkg:IRepo`). `removeRegistrations` matched only the base,
`hasRegistrations` only the template, so no query could satisfy both: `removeAll` handed a template
removed nothing, and `replace` on a template therefore accumulated duplicates without bound
(masked at resolve time by the ranked scan). Removal now accepts EITHER name; dedup still accepts
the template alone. The asymmetry is deliberate: removal is the "drop everything filed under this
name" verb (the reference `RemoveAll(IRepo<>)` affordance, already pinned by a test), while dedup
is identity-exact — `pkg:IRepo` and `pkg:IRepo<$1>` are different services.

**Collections aggregate every matching template.** `#collectionRegistrations` reached the open
table through `#lookup`, which returns at most ONE registration and only when the exact list is
empty. So several templates covering one closing collapsed to the winner, and an exact registration
of the closing suppressed the open closings entirely. `#lookup` splits into `#closings(token)` —
every match, ranked most-specific-first, memoized per closed token — and a thin `#lookup` returning
`closings[0]`, so singular resolution is unchanged and the memo still guarantees ONE `Registration`
object per closing (bare-`T` and the aggregate element therefore share a frame-cache slot). ORDER
is the new rule: the aggregate's last element must be what bare-`T` yields, so the exact list comes
LAST and the closings are reversed out of their rank; registration order holds within each group.

**Use after dispose.** `#disposed` was read only by `dispose`/`disposeAsync` themselves. A closed
scope kept resolving, and anything it built landed in the `owned` list that a second (idempotent)
`dispose()` never re-drains — constructed, cached, silently leaked undisposed. Every entry point,
`createScope` and the injected `IResolver` view included, now raises `ProviderDisposedError`, the
reference's `ObjectDisposedException` behaviour. `dispose`/`disposeAsync` stay unguarded.

**Smaller repairs.** A `FactoryRef` slot is satisfiable only when its TARGET resolves — greedy
selection used to accept it unconditionally and then hard-fail, where an unregistered plain token
makes it fall through to a shorter signature; the more actionable `FactoryTargetError` is still
raised when a missing target is the sole obstacle. `EmptyServiceProvider`'s keyed PLURAL overloads
return `[]` instead of throwing / returning `undefined` (`IRequiredResolver`: "0 matches yields
`[]` — never throws on count"). `#resolveKeyed` restores the caller's `pattern.lastIndex`.
`seal()`'s `Object.freeze` on the two Maps is deleted — it seals a Map's own properties, not its
entry slots, so a "frozen" sealed map still accepts `set`; the per-token LISTS are the real
immutability and `ReadonlyMap` is the rest. `FactoryTargetError.reason` narrows to
`"unregistered"`: `"not-a-class"` lost its referent when the three authoring kinds collapsed into
one `produce` closure, and nothing has ever constructed it.

**A second pass over the sweep's own diff** found five more, each reproduced against the built
bundle before it was touched. The first is a regression the sweep itself introduced.

- **One mis-authored template poisoned every sibling on its base.** Splitting `#lookup` into
  `#closings` turned a return-on-first-match scan into a full one, but the `RangeError` arm kept its
  `return` — so a gappy template reached AFTER a valid winner was already synthesized discarded that
  winner and every other closing with it, un-memoized, on every resolve. A template that cannot be
  closed is simply not a candidate FOR THIS closing: the arm now `continue`s, exactly as a `match`
  miss does, and the empty list at the end is what the sole-gappy-template case (pinned by an
  existing test) wants. It also keeps a collection from losing the elements a gappy sibling cannot
  contribute.
- **Factory callables bypassed the dispose guard.** `#makeFactory`'s two returned closures called
  the private spine directly. A factory is minted during one resolve and INVOKED arbitrarily later —
  the guard on the minting call says nothing about the call that builds — so a closed scope kept
  constructing through a `FactoryRef` slot injected into a long-lived instance. Both closures now
  open with `#assertLive`.
- **A live child scope could still cache into a disposed parent frame.** The guard was
  per-PROVIDER, but disposal deliberately does not cascade, so `#findOwner` still walked up into a
  closed frame and owned an instance there — the exact leak the guard exists to prevent, one level
  down. `Scope` carries a `disposed` flag set by `#clear()`, and `#resolveWith` refuses a closed
  owner. A transient registration owns nothing and is unaffected, as is anything the child's own
  frame owns.
- **The key SPELLED INTO the token still classified closed.** `materialise` moved onto the base
  token, which fixed `.withKey` and the 5-arg form but not `addClass("pkg:IRepo<$1>#k", …)`, where
  the key is part of the authored token. `unkeyedToken(token)` — a new string-grammar edge that
  takes the key boundary from the tree parser rather than restating the key grammar — is now the
  pre-step of every open-vs-closed classification, at the registration boundary and at both of the
  engine's. That also fixes the diagnosis of `resolve("pkg:IRepo<$1>", "k")`, which raised
  `UnregisteredTokenError` where the unbound hole was the actionable half of the answer.
- **`ActivatorUtilities.slotResolvable` drifted from the mirror it documents.** The engine learned
  that a `FactoryRef` is satisfiable only when its target resolves; the public mirror kept returning
  `true` unconditionally, so an unregistered factory target raised `FactoryTargetError` instead of
  falling through to the caller-supplied arguments the way an unregistered plain token does. —
  **MOOT under §128**: the whole activation surface is deleted, so the hand-kept mirror this fix
  repaired no longer exists. The drift is what §128 cites as the upkeep the surface was charging.

**The keyed PLURAL scan sees template closings.** `#resolveKeyed` read only the exact map, so a
keyed template — newly registrable above — answered `resolve(t, "redis")` but not
`resolve(t, /redis/)`, and an unkeyed template answered bare `resolve(t)` and `Array<t>` but not
`resolve(t, /.*/)`. The scan now walks `base`'s key-space across BOTH tables and resolves each
matching key through `#collectionRegistrations`, which is the same closings-then-exact rule
`Array<T>` aggregates by and returns the exact list untouched for a key with no template. Exact
registrations still come first in the key order, so every pre-existing plural ordering holds.

**Breaking public surface**, for the next publish pass to version on: `OpenRegistration.pattern` is
deleted (the field's whole contract was the retired all-holes rule); `FactoryTargetError.reason`
narrows from `"unregistered" | "not-a-class"` to `"unregistered"`, so an external
`reason === "not-a-class"` comparison stops compiling; and `ServiceProviderClass`'s `closedMemo`
constructor parameter widens from `Map<Token, Registration>` to `Map<Token, readonly
Registration[]>`, which matters because the class is documented as exported for white-box use. All
three are dead in-repo — nothing constructed `"not-a-class"` even before this branch. `unkeyedToken`
is added to di.core's and di's barrels.

**Three findings deliberately NOT acted on**, all being design calls rather than defects:

- `validateScopes` is defeated inside a `Union` slot. A member's `ScopeValidationError` is caught
  by `#resolveUnion`'s fall-through and the next member wins, so the violation is silently skipped.
  Whether a validation failure should be a hard stop or a soft miss inside a union is a semantics
  question about what "the first member that BUILDS" means, not an implementation slip.
- A non-canonical spelling of a closed token bypasses its exact registration. `#lookup` probes the
  exact map with the RAW request string but reaches the open table through the CANONICALISED parse,
  so `resolve("app:IR< app:User >")` is served by the `app:IR<$1>` template even though an exact
  `app:IR<app:User>` is registered — exact-beats-open violated, two identities for one service.
  The honest fix is to canonicalise at the registration boundary, which changes the stored map key
  and therefore what `hasRegistrations`, `removeRegistrations`, and `#resolveKeyed`'s prefix scan
  all compare against. That is a wire-grammar decision, not a patch.
- The two grammars disagree about `$0`, `$01`, and whitespace spellings (`pkg:IZ< $1 >`):
  `HOLE_PATTERN` is `/^\$[1-9][0-9]*$/` and the tree parser accepts any digits, so those tokens
  classify CLOSED and register exact. That is not a dead entry — each resolves under the same
  spelling it registered under — so it is the canonicalisation question above wearing a different
  hat, not a separate defect. `token-grammar.test.ts` pins the `$0` half. — **WRONG, and corrected
  by §127**: the "resolves under its own spelling" test holds only for a template with no hole
  DEPS. Give `pkg:IZ<pkg:IA, $1>` the `[['$1']]` signature that motivates it and the entry resolves
  under nothing — the closing misses the exact map, and its own spelling raises
  `NoSatisfiableSignatureError` on the un-substituted `$1`. The whitespace and `$01` halves were a
  separate defect; only `$0` is the canonicalisation question.

`Validator`, `parseSlot`/`serialiseSlot`, and `TokenManifest`/`TokenProvider` were audited as
suspected vestigial and DELIBERATELY kept. Each is exported, correct, and (for the manifest pair)
exercised by `token.spike.test.ts`; unused-but-correct public API is not a defect, and deleting it
is a semver call rather than a repair. Their comments — which advertised jobs the live path no
longer does — are corrected instead. — **PARTLY REVERSED by §127**: the manifest pair was never
public API (absent from the rolled `.d.ts`), so keeping it shipped unreachable runtime on a policy
argument that did not apply to it, and it is deleted. `Validator` and `parseSlot`/`serialiseSlot`
ARE public and stay, pending an owner call.

_Claude's calls throughout, on the owner's direction to sweep the family; the collection ordering
rule, the removal/dedup asymmetry, and the keyed-plural key order are the three that chose between
defensible alternatives._

---

## §127 — Open-template classification is spelling-independent; the gated token reference is deleted

A second sweep of `libraries/di.core` / `libraries/di`, run because §126's pass applied hard
pressure to over-deletion and only soft pressure to under-deletion — over-deletion is loud (the
gate catches it), under-deletion is silent forever.

**`isOpenToken` reads the typed tree.** It classified off raw arg slices: `HOLE_PATTERN`
(`/^\$[1-9][0-9]*$/`) tested against an un-trimmed slice, while the tree parser skips whitespace
and normalises hole labels. So `IRepo<IA, $1>` — a space after the comma, the natural hand spelling
of a §124 mixed template — plus `IRepo< $1 >` and `IRepo<$01>` all read CLOSED. `materialise` is
the ONLY place a template is routed and `openEntry`'s "reject a template nothing could ever match"
guard runs only on the branch classification picks, so each landed in the exact map as a literal
holey token: silent, no error, resolvable by nothing. Not by the closing, and — once the template
carries a hole dep, which is the whole point of a template — not under its own spelling either,
since the un-substituted `$1` dep is unsatisfiable. That last part is what §126 got wrong when it
declined the fix.

Classification now parses, and falls back to the shallow scan only for a token the tree grammar
REFUSES (`"a b<$1>"`), which is what keeps that case classified open and therefore routed to
`openEntry` where its rejection lives. A `$`-free token short-circuits ahead of the parser, so the
engine's resolve-time guard stays off the parse path for ordinary tokens. Registration and both
engine sites run the one predicate, so a request and a registration can no longer disagree about
what is a template; `resolve("pkg:IRepo< $1 >")` now raises `OpenTokenResolutionError` instead of
an unhelpful `UnregisteredTokenError`. `unkeyedToken` stays the documented pre-step at each site —
the tree sees past a key on its own, but the agreement between a composed key and a tail-argument
key should not rest on the classifier's internals, and the fallback path still needs it.

**`$0` is deliberately held back.** Hole labels are 1-based, the parser will build a hole node for
any digit run, and the classifier states the 1-based rule explicitly rather than adopting the laxer
grammar. So one divergence survives, on purpose and in one commented line: whether `$0` is a legal
hole is a grammar decision, not a repair. `$01` is NOT in that class — it parses to the same node
`$1` does, so treating it as a hole is the canonicalisation contract, not a new semantic.

**`token/manifest.ts` is deleted.** `TokenManifest` / `TokenProvider` / `Descriptor` /
`SealedTokenManifest` were package-PRIVATE — di.core declares one export and `src/index.ts` omits
all four — so no consumer could name them and the rolled `.d.ts` carried none of them, while ~120
lines of the JS bundle were theirs. Their only exercise was a mirror: `token.spike.test.ts` reached
past the package by raw relative path to assert their own behaviour, and every rule it pinned is
pinned on the live path in `open-generics.test.ts`. §126 kept them under "unused-but-correct public
API is not a defect" — an argument that never applied, because they were not public API. Of the two
behaviours §126 called still-gated there, negative memoization is REJECTED doctrine (`#closings`
states misses are unbounded and deliberately not memoized), and canon-on-miss variance recovery
stays described in §126's prose as part of the pending wire-grammar question.

**Referred to the owner, untouched.** `Validator` and `parseSlot`/`serialiseSlot` are genuinely
public (both in the rolled `.d.ts`) with zero consumers anywhere — no call site, test, example or
fixture. Cutting unused-but-correct public API is cheap now and expensive after the first publish,
but it is a policy call, not a repair. Same for the example set's coverage holes: no example opens
a scope, registers an open template, uses a key, injects a factory, uses a union or literal slot,
or uses the descriptor verbs — which under the kitchen-sink doctrine is a gap in `examples/`, and
additive work to scope separately.

_Claude's calls; the `$0` hold-back and the public-API deferrals are the two that deliberately
stop short of a decision the owner should make. 2026-07-24._

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
