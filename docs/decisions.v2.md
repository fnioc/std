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
