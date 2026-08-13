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

Declare-by-depending (a marker that lets `ttsc` auto-discover a consumer's declared stages from its
dependency graph rather than a hand-authored list) is a supported nice-to-have, not a requirement
of this decision.

Mechanics — descriptor/source dedup, `--plugins-json` shape, the stage-selection error contract,
the publish story — live in `docs/features/transformer-architecture.md`, the canonical reference; this
entry records only the ruling. _Owner-approved 2026-07-16._

## §91 — Inline-stage matching is by symbol identity, not a string key

A `rhombus-std` `inline` entry's `type`+`member` pair resolves through the checker to a symbol, once per
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

## §106 — Open-generic matching is typed-`TokenNode` unification; the string grammar stays the classification boundary

Closing an open template (`pkg:IRepo<$1>`) against a ground token (`pkg:IRepo<pkg:User>`) is done by a typed token model (`di.core/src/token.ts`), not string manipulation. A token STRING stays the registration identity (§9's `Map<Token,…>` keys, §13's grammar); a `TokenNode` is its parsed view — a `ConcreteToken` / `HoleToken` / `ProviderToken` discriminated union with a canonicalising `parse`/`tryParse`, canonical `stringify`, directional `match` (unification), `substitute`, and a `specificity` metric. The engine (`ServiceProviderClass.#lookup`) now closes an open registration by `tryParse(ground) → match(template, ground) → substitute`, replacing the deleted `#matchOpen` / `#bindPattern` string routines.

- **Holes are labels, not indices.** `$N` binds by label, so a template may use non-sequential, reordered holes (`add<IFoo<$7, SomeType, $3>>(Foo<$3, $7>)`): `match` records a label→token map, a repeated label must bind consistently (canonical compare), and `substituteSignaturesByLabel` closes the carried dep signatures by that map — throwing `RangeError` on an unbound label so a gappy template (`IX<$1,$3>` depending on `$2`) stays a clean miss, not a crash.
- **Why typed, not the earlier regex/string idea.** A no-transformer author can write arbitrary whitespace and quote styles; the parser canonicalises both away in one pass, so semantically-equal tokens compare byte-identically. Decisively, a literal union serialises `" | "`-joined (space-pipe-space) byte-identical to the Go transformer's `strings.Join(members, " | ")`, so a re-derived union matches a transformer-spelled exact registration — regex over raw strings could not carry that guarantee across arbitrary user input.
- **The string grammar is retained, not deleted.** §13's `isOpenToken` / `parseToken` / `HOLE_PATTERN` / `closeToken` remain the open-vs-closed classification at registration and a public compat surface; `TokenNode` owns only matching + substitution. (`HOLE_PATTERN` was deleted by §129 — the hole grammar is stated once, by the tree parser.) That split is what keeps behaviour byte-identical — exact-match/last-wins (§11), collections (§12), keyed tokens (`base#key`, §98), the provider intrinsic, scopes / captive-dep / validation / disposal, and every error at its exact throw site are all preserved.
- **Seal derives two frozen index maps** (`SealedManifest.registrations` exact + `openRegistrations` keyed by canonical `baseKey`) via toArray-at-seal in `ServiceManifestClass`.
- **Partial closing and most-specific-wins selection are both live.** A template mixes concrete args and holes freely (§124), and overlapping open templates rank most-specific-first (§125). `isOpenToken` classifies off the typed tree (§127); the shallow scan over raw arg slices survives only as the fallback for a token the tree grammar refuses.

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

## §111 — One `TokenNode` tree serves both the resolve side and the signature side

A resolve argument and a signature slot are the SAME expression shape, so `substitute` / `validate` / `stringify` / `match` are written ONCE over a single plain-data discriminated-union tree (`concrete | hole | provider | union | literal | factory`, `libraries/di.core/src/token/`) instead of the five parallel string-substitution routines the pre-immutable-manifest branch had. Nodes stay plain data (never classed) so the established immutable-update idiom (`{ ...n, args }` spread) keeps working; operations are a typed visitor base (`TokenRewriter` for rewrites, `TokenWalker<T>` for queries) dispatching one `assertNever`-closed `switch(kind)`, not `accept`-on-node. The wire format is UNCHANGED: parsing happens at the edges (`parse` / `stringify`) and the stored/emitted `DepSlot` keeps its original compact array-literal shape — the tree is a transient parsed view, never the ABI. Landed as the wire-stable slice of the redesign; `FactoryRef` staying flat (not yet every position a `TokenNode`) and the union-blow-up wiring are the deferred wire-changing remainder (§112). _Owner-directed (the unification + parse-at-edges direction); the visitor shape and node-as-plain-data reasoning are Claude's._

---

## §112 — Union blow-up to static overloads: abandoned, not deferred

An earlier plan blew a union dependency slot into cartesian overloads at registration time (`[[union(A,B),C]] → [[A,C],[B,C]]`) so union resolution could fold into ordinary overload selection and the per-param runtime union resolver could be deleted. This is ABANDONED, not merely deferred: the equivalence argument was wrong. Per-param `#resolveUnion` has a runtime fall-through a static overload set cannot express — a union member that IS registered but THROWS while building (or whose `Promise` rejects) falls through to the next member at RESOLVE time, while presence-based overload selection can only see registration-time shape. Keeping per-param resolution is therefore load-bearing (`union.test`'s GAP2/GAP4 and the async-reject case). `blowUpSignatures` (`token/slot.ts`) stays implemented and exported but is dead code, to be removed in a vestigial sweep; `Validator` does not reject `union` on the resolve side. _Flagged for owner review — this reverses an earlier "yes" on the blow-up given mid-session; Claude's finding, made while gating the token-tree-unification PR._

---

## §113 — Chain-modifier sugars lower through the general inline stage, not a bespoke Go stage

`.as` / `withSignature` / `withSignatures` lower the same way every other sugar call does: through
the single-expression inline stage, one call substituted per fixed-point pass (§115) until the
whole chain resolves — a chain like `addClass<T>(C).withSignature<S>().as<Scope>()` peels one call
per pass. There is no separate di-direct Go recognizer set: the fixed-point loop reaching inner
chain positions, together with the transitive-witness module-resolution fix (§119), makes the
inline path sufficient for both dist-referenced and di-direct consumers, and both emit
byte-identical output. Full mechanics live at §115; kept here only as a citation anchor.

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
stage may require running before/after another within one pass. The di Go stage and its bespoke
chain-sugar recognizers (§113) are deleted: with the loop reaching inner chain positions and the
transitive-witness module-resolution fix (§119) making inline active for di-direct consumers, chain
sugars lower through inline bodies for both paths. _Owner ruling: "a few extra iterations doesn't
hurt anything. it's milliseconds."_

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
retired rule. Open-template classification — including the keyed-template and `$0`/`$01` grammar
edge cases this rule interacts with — is described in full at §127 and §129.

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

**A second pass over the sweep's own diff** found four more, each reproduced against the built
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

**Two findings deliberately NOT acted on**, both being design calls rather than defects:

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

(A related grammar question — whether `$0`/`$01`/whitespace spellings like `pkg:IZ< $1 >` are holes
— turned out to be a genuine defect rather than a design call; §127 and §129 resolve it: the tree
parser and the classifier now share one 1-based, leading-zero-free hole grammar, and
`HOLE_PATTERN` is gone.)

`Validator` and `parseSlot`/`serialiseSlot` are genuinely public (in the rolled `.d.ts`) with zero
consumers anywhere. Both are audited as suspected vestigial and DELIBERATELY kept —
unused-but-correct public API is not a defect, and deleting it is a semver call rather than a
repair — so their comments, which advertised jobs the live path no longer does, are corrected
instead, pending an owner call. `TokenManifest`/`TokenProvider` were never public API — they were
package-private, absent from the rolled `.d.ts` — and `token/manifest.ts` is deleted (§127).

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

**Hole labels are 1-based with no leading zero (§129).** `$0` and `$01` are not holes; a token
spelled that way is not a template and files as an ordinary exact registration.

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

---

## §129 — One hole grammar: 1-based, leading-zero-free, stated only by the tree parser

Two things were spelled `$N` in di.core and only one of them survives in each position.

**`$1` … `$9` as TYPES are deleted.** `brands.ts` declared both the generic `$<N>` and nine
pre-instantiated aliases; the barrel exported all ten. The aliases saved one pair of angle brackets
and charged a permanent ambiguity for it, because `$1` is also the WIRE text of a hole inside a
token string (`"pkg:IRepo<$1>"`). One name, two grammars, and a reader had to check for surrounding
quotes to know which one was in front of them — in a package whose whole job is the boundary
between a type and the token it derives. `$<N>` is now the only type-position spelling, at every
label; a bare `$1` is only ever wire text. Nothing outside di.core used the aliases: every
type-position site in the libraries, tests, examples, docs and the Go fixtures already wrote
`$<N>`, so the deletion touched `brands.ts`, `src/index.ts` and the di.core README and nothing else.

**Hole LABELS are 1-based with no leading zero, and `token/parse.ts` is the only place that says
so.** Two implementations disagreed: `edges.ts`'s `HOLE_PATTERN` (`/^\$[1-9][0-9]*$/`) rejected `$0`
and `$01`, while the tree parser's `#parseHole` consumed any digit run and built a hole node for
both, folding `$01` onto label 1. §127 documented the split as a deliberate hold-back — "whether
`$0` is a legal hole is a grammar decision, not a repair" — and left it as one commented line of
divergence. That is the entry this supersedes: the answer is that a grammar with two
implementations is wrong regardless of which one wins, and the `Hole<N>` brand already documents
its own domain as 1-based, so the parser was the side that disagreed with the design.

`#parseHole` now rejects `$0` ("hole labels are 1-based") and any leading zero, alongside the
out-of-safe-integer-range check it already had. One spelling reaches each label, so canonicalisation
has nothing to fold and the parser cannot mint a node the brand could not have produced. The Go
engine's `tokentext.isHoleNode` had implemented exactly this grammar all along, so this closes a
cross-engine divergence rather than opening one — no token any transform emits, or any author writes
with `$<N>`, changes shape.

**`HOLE_PATTERN` is gone.** Its only consumer was `isOpenToken`'s fallback for a token the tree
grammar REFUSES (`"a b<$1>"` — trailing text after the base, which must still classify OPEN so
`openEntry` can reject it). That fallback now splits the top-level args with the shallow scan and
puts each one back through `isOpenToken`, so the hole grammar it consults is the parser's.
`holdsHole` — the tree walk that re-applied the 1-based rule the parser did not enforce — collapses
into `TokenNode.isOpen` for the same reason. Recursion terminates because every arg slice is
strictly shorter than the token it came from. `isOpenToken` is now the one predicate and it states
no grammar of its own.

**What changes for a caller.** `$0` behaves exactly as it always did. `$01` and `$007` join it: not
holes, so a token carrying one is not a template and files as an ordinary exact registration. A
would-be template written that way therefore fails at resolve rather than at registration — the
closing misses, and the token's own spelling raises on the un-substituted dep. That is the standing
shape `$0` has had since §127 signed it off, not a new hazard, and turning it into a loud
registration error would mean teaching `isOpenToken` to answer `true` for something that is not a
template. A "you probably meant a hole" diagnostic belongs at the registration boundary, not in the
classifier; it is a separate design question and deliberately not taken here.

_Owner-directed 2026-07-24 ("delete all of the `$N` in favour of `$<…>`" / "just make it right" on
the two hole grammars). The `HOLE_PATTERN` collapse and the residual-hazard call above are Claude's._

---

## §130 — A library references the abstractions package; only an entry point references the engine

The whole di error taxonomy is DECLARED in `@rhombus-std/di.core` and re-exported from
`@rhombus-std/di`. `UnregisteredTokenError`, `OpenTokenResolutionError`,
`CircularDependencyError`, `MissingMetadataError`, `NoSatisfiableSignatureError`,
`NoSatisfiableUnionError`, `FactoryTargetError`, `AsyncResolutionRequiredError`,
`AsyncDisposalRequiredError`, `RegistrationValidationError`, `ScopeValidationError` and
`ProviderDisposedError` join the `DiError` root and `OpenTokenRegistrationError` that were already
there. `libraries/di/src/errors.ts` is deleted; the barrel re-export replaces it, so every existing
`from '@rhombus-std/di'` import keeps working unchanged.

**The rule this enforces.** A library references the abstractions package; only an entry point
references the engine. It is repo-wide, not an examples-only convention. `examples.lib.*` are its
existence proof — they declare registrations and take an `IResolver`, and neither one has a runtime
dependency on `@rhombus-std/di`; the application packages that build a provider are the only things
in `examples/` that do.

**Why the split was a defect, not tidying.** The di.core / di boundary exists to make one claim: a
library can do everything a library needs with only a `di.core` reference. Classifying what a
caller's container threw at it — branching on the failure, adding context, re-raising, or degrading
gracefully — is ordinary library work. With the taxonomy split, a di.core-only library could branch
on the root `DiError` and nothing else, so it had to take a reference on the engine purely to READ
an error class. Nothing about that reference is used at runtime, which is exactly what makes it the
wrong dependency: the boundary was claiming an independence it did not actually deliver.

**Nothing moved gains an engine dependency.** The moved classes import `DiError`, `Token` and
`DepSlot` — di.core's own types — and reference no engine internal, which is what made the move
mechanical. di.core stays the zero-engine-dependency package.

**Runtime identity holds (§9/§38).** These are `instanceof` classes, so there must be exactly one
copy. di keeps di.core external in its bundle, so `libraries/di/dist/bundle/index.js` declares none
of them and imports all of them from `@rhombus-std/di.core`, whose bundle declares each once; the
rolled `.d.ts` re-exports rather than inlining. Verified live: `core.X === engine.X` for all
fourteen classes, and an error thrown by the engine satisfies `instanceof` against the class
imported from `di.core`.

**Two residuals, deliberately not taken here.** `examples.lib.*` still `import type` from
`@rhombus-std/di` (a devDependency) for `IServiceManifest` / `IResolver`. Those are erased at
compile time, so no runtime reference survives and the existence proof stands, but a library
reaching for the engine's name to spell a type it could spell from `di.core` is the same instinct
this entry rules out. Separately, `examples.lib.*` should spell those types from `di.core`; that is a
follow-up, not a hole in the rule.

**`logging` is an exception. The rule stands.** `logging` and `hosting` are the only libraries
carrying a RUNTIME `@rhombus-std/di` dependency, both for the constructible `ServiceManifest` value
(di.core ships `ServiceManifestClass`; di ships the value and the `build()` patch). `hosting` is an
entry point by job description, so it is not an exception at all. `logging` is: `LoggerFactory.create`
stands up a manifest, builds a provider, opens the singleton scope and resolves the factory out of
it — entry-point work by this entry's letter, inside a library.

It stays. The API is a legitimate convenience for a consumer who wants logging without composing a
container, and the ownership problem it creates is solved rather than ignored: the returned
`DisposingLoggerFactory` owns the scope it made, so disposing the factory disposes everything it
built. The reference reached the same conclusion independently — its logging assembly takes a full
dependency on the DI assembly, not just the abstractions, for precisely this one API.

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
name says which: `typefor<T>()` NAMES a type (a named type yields its interned `NamedType` address),
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

**The static image is stated, not inferred.** `Type.object` and `Type.named` erase their arguments'
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
derivation must trim to the element. The `named` door mints an aggregate kind from a SINGLE argument
under `global`; a spelling that carried the defaulted tail would land as an ordinary named type that
no aggregate registration answers, and a derived address would name a different type than the
hand-written `Type.asyncIterable(E)`.

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
door unions. `TypeIdentifier = NamedType | PlaceholderType | TagType` names the ADDRESS-ONLY kinds:
a pure reference can never self-construct.

Every `Type` can be an ADDRESS: interning makes any node registrable and resolvable by `===`, so a
`ServiceDescriptor` may link absolutely any `Type` to an implementation. Every NON-identifier `Type`
can also be a SPEC — it self-constructs when no registration answers a request for it. The
capability lives in the USAGE and the registry, never as a dual identity stamped on the node itself.

`TagType = { type: Type, tag: string }`; the inner `type` is unconstrained (a keyed function-typed
service is spellable). A tag is address-only regardless of its inner type — keying is registration
intent, so an unregistered keyed request fails rather than constructs. `TypeLiteralType` is a
self-supplying leaf; it names nothing.

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

di2 decisions stay distinct from di's own `TokenNode` model (§106/§111/§122/§129); this entry
describes di2's `Type` layer, not a replacement for the shipped di token grammar.

_Owner-directed 2026-08-13._

## §142 — di2's container door: one entrypoint, lookup-then-construct-on-miss, three memo layers

di2 exposes one resolution entrypoint, `getService(request: Type)`. Resolution is LOOKUP, THEN
CONSTRUCT ON MISS: the lookup answers for any `Type` at all; on a miss, a request that can
self-describe is constructed by composing looked-up leaves, and a pure reference on a miss fails.
Requesting an unregistered constructor is construct-on-miss of a `CtorType`: di2 instantiates it,
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

di2 has no `TypeBuilder`, neither general-purpose nor as manifest stages. Two renames land
(owner-worded): `placeholder` → `generic` (node `GenericType`, kind `'generic'`), and
`FunctionType` → `FuncType` (pairing with the `func` factory). The multi-field factories — `named`,
`ctor`, `func`, `tag` — gain OBJECT-PARAMETER overloads whose keys are the node's own published
fields (`{ name, from?, genericArgs? }`, and so on), one vocabulary labeled at every nesting level
with defaults skippable independently; positional forms remain for flat use, and the
homogeneous-list factories (`union` / `intersection` / `tuple`) stay positional-rest only.

Registration never requires the impl instance's own type: a provided constructor's instance
`NamedType` is data the container has no use for. The address is what consumers resolve by,
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
whole composed constructable, typed per the `as`-verb (`CtorType` for `asClass`, `FunctionType` for
`asFactory`) — sugar substitutes `withType` with the transform-derived precise node, and a
hand-writer reaches for `withSignature`. Deep signatures remain irreducibly deep; the object-overload
factories and named intermediate consts are the spelling relief, not the dialect.

_Owner-directed 2026-08-13._

## §145 — di2's aggregates are first-class node kinds; normalization lives in the `named` door

Three aggregate factories mint their OWN node kind apiece: `Type.array` (`ArrayType`),
`Type.asyncIterable` (`AsyncIterableType`), `Type.iterable` (`IterableType`) — each a
single-`element`-child node. The aggregate names join the parser's one reserved-name mechanism
beside `Func` / `Ctor` / `ServiceProvider`, and the engine dispatches on kind. This dissolves the
engine-side reserved-name list, the "NamedType is address-only except three names" asterisk, and the
pairing-rule scoping clause that predated it — fewer distinct mechanisms, more uniform arms.

`AsyncType` joins the same pass: kind `async`, factory `async(element)` (legal, since `async` is
only contextually reserved), wire spelling `Async<E>` in the reserved set. The node, factory, and
parser arm land now; its ENGINE arm — async delivery of the element — lands with the parked
async-realize design, not before.

Normalization lives in the `named` door, with no swap visitor: `named` given a reserved aggregate
spelling (`'Iterable'` / `'Array'` / `'AsyncIterable'` / `'Async'`, `'global'`, one argument)
silently returns the corresponding kind node — the same canonicalization contract `union` already
has. Every path that can spell an aggregate — the parser, derivation-emitted code, hand composition,
adoption — normalizes at mint, so the kind node is the ONE interned identity and a `NamedType`
spelling of an aggregate can never exist. The signature principle is PERMISSIVE IN, EXPRESSIVE OUT:
as narrow as expressible per call — a literal reserved spelling types as its kind node, a
non-reserved literal as `NamedType`, a dynamic string as the honest union, each as tight as TS can
prove. The object-parameter overloads (§144) narrow the same way via literal property inference.

An aggregate address's CONTRACT is the protocol alone — an `Iterable` / `AsyncIterable` / `Array` of
every registration of the element. Binding is a property of the SYNTHESIZED descriptor-miss fallback
only: the synthesized `array` materializes at resolution, and the synthesized `iterable` /
`asyncIterable` are late-bound, each element resolving at iteration time (sync or async). A
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
