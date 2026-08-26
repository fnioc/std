# di2 plan — desired endgame

The target end-state for di / di.core / primitives. Audience is a fable agent (possibly not this
session); instructions density, no over-explaining. NOT a decision record and NOT a sequence —
implementation order is directed by the owner separately. Scope design is deliberately absent
(§Held; parked research in `docs/di2.scope-notes.md`). Items tagged **(proposed)** are Claude's,
shown to the owner and not overruled; everything untagged is owner-set.

## Architecture & packages

- **primitives** owns the Type algebra (`src/Type/`: Type + kind interfaces, TypeVisitor,
  Equals/ToString/Substitute/Satisfies/Validator/ExpandUnions visitors) and `IServiceProvider`.
  Zero-dep leaf holds — trivial helpers inlined, never imported.
- **di.core** owns registration: Registration (+`op`), Manifest/DefaultManifest, both augmentation
  sets, the error taxonomy. Re-exports Type + IServiceProvider from primitives (Token replacement
  is a later, separate effort). ScopeCache placeholder parks here pending scope design.
- **di** owns resolution: Plan (engine IR), ToPlanVisitor (lowering), RealizeVisitor, the
  Engine, ServiceProvider. Engine internals stay out of di's public barrel.
- **Engine**: ONE per manifest, stateless per-resolution; internal context-taking
  `resolve(type, context)` plus the async sibling. `IServiceProvider` stays single-arg FOREVER —
  the user door. `ServiceProvider` is a thin (engine, scope-binding) facade.
- Recursion discipline: lowering recursion stays inside ToPlanVisitor; realize recursion stays
  inside RealizeVisitor; the ONE sanctioned cross-file loop is latebound → engine entrypoint.
- The engine memoizes `type → { tree, asyncSites }` (sound: manifest immutable, lowering
  scope-pure). A latebound re-entry layers extra value registrations ⇒ its memo key includes those
  arg types, or bypasses. **(proposed)**

## Type layer

- `FunctionType` (kind `'function'`) is the shape; late binding is a plan strategy (Plan
  keeps `latebound`). Done.
- `Type.parse` performs structural upgrades only (`Func`→FunctionType, `Ctor`→ConstructorType). Strategy
  recognition happens at lowering: `IServiceProvider`→ServiceProviderPlan,
  iterable→IterablePlan, promise fallback→async placeholder. No ServiceProviderType kind.
  Value-type-as-service (`string`, `number`, …) errors at the resolve entrypoint, not in parse.
  **(proposed)**

## Lowering

- ToPlanVisitor consults the manifest, closes open generics (match-captures →
  `Registration.op.substitute`), lowers to the Plan tree. Scope-independent, always.
- Every node is checked for a WHOLE-TYPE registration match first (overridden `visit`);
  decomposition/synthesis — union members, tuple assembly, literal constant, latebound,
  `IServiceProvider` recognition — is only the fallback. A registration for a composite beats its
  parts. First candidate that actually LOWERS wins (a matching-but-unsatisfiable registration
  doesn't block an older viable one).
- Intersections are served by a SINGLE registration matching every member — the joint whole-type
  match does this (intersection condition = every member against one shared capture map); the
  per-kind fallback stays empty by design.
- `Iterable<T>` (`named 'Iterable'`, `from 'global'`, one generic arg) is a recognition in the
  named fallback. Collection = BOTH categories: every registration matching `T` (newest first)
  PLUS `T`'s pure-synthesis result (a union contributes its members' syntheses only — lookups
  never re-run there, so registrations don't double-count). An exact `Iterable<T>` registration
  wins outright, never combined. Zero matches ⇒ empty sequence, not unsatisfiable. The plan
  is materialized; realize hands each walk a lazy iterator.
- Failure signal is `UnsatisfiableError` everywhere — the `'failzor'` throw and undefined-returns
  die. Catch sites: union-member choice, next-signature choice, promise fallback. **(proposed)**
- A lookup miss on `T` falls back to `Promise<T>`; a hit there produces an async placeholder node
  (per-occurrence label) wrapping the `Promise<T>` site.
- The ad-hoc machinery is deleted: `AdHocPlan`, `RealizeContext.adhoc`, the ServiceProvider
  adhoc branches. Latebound call args enter re-entry as value registrations (`additionalServices`).

## Async resolution

Async ≡ the manifest registers `Promise<T>` and a dep wants `T`. A dep literally typed
`Promise<T>` is an ordinary lookup. Awaits exist ONLY in the async entrypoint.

- Placeholders are per-OCCURRENCE (unique ids), never per-type — async transients keep sync-path
  semantics; sharing comes only from scope caches.
- Async entry, hoist step: per async site, scope-cache check FIRST — a hit satisfies the site
  synchronously with the awaited value (caches store values as-requested, never promises; full
  scope design pending). On miss, the site's inner becomes one entry in a flat label→promise map.
  Entries chain: creation order is leaves-first for free (lowering finishes nested sites before
  their parents), and each entry awaits the labels its own subtree recorded, then sync-realizes
  its inner and unwraps. ONE flat gather awaits the whole map.
- Plug step: fully-sync realize of the tree; async placeholders read `promised.get(label)` from
  context — the memoized tree is never mutated.
- Sync entry: same walk; throws iff any async site survives its cache check. Corollary: a
  fully-cached async graph resolves through the SYNC entrypoint.
- The gather observes every in-flight entry (`allSettled`-shaped — no unhandled rejections);
  rejections throw as ONE `AggregateError`, deduped by reason identity (a chained entry rethrows
  its failed dep's same reason object, so a root failure doesn't re-count through its dependents).

## Latebound

First-class end-to-end.

- Realizes to a closure over the creating context; each call re-enters the engine with the call
  args as value registrations. This is THE cross-file loop.
- **Hoisting stops at latebound boundaries**: a latebound node is a leaf of the enclosing walk;
  its subtree's asyncness belongs to the future call. Hence: A depends on B, only `Promise<B>`
  registered, request `Func<[], Promise<A>>` — the SYNC entrypoint succeeds (it only mints the
  closure); the call re-enters async, hoists B, returns `Promise<A>`.
- The re-entry path follows the declared return type: `Promise<…>` ⇒ the SAME async-entrypoint
  machinery, returning that promise; otherwise the SAME sync entrypoint including its throw — a
  sync-returning latebound over async-only deps fails at call time.
- Which scope the closure re-enters against: §Held.

## Validation

- Cycle detection lives in a validation visitor over the manifest, not the lowering walk.
- Captive-dependency detection is statically possible once lifetimes declare an ordering —
  scope-design input. **(proposed)**

## Held — scope (do not design here)

SP recreation vs threading · latebound scope binding (reset-to-root vs captured) · ScopeCache /
lifetime hooks · disposal ownership · concurrent async-singleton double-instantiation. Research and
owner positions on record: `docs/di2.scope-notes.md`.

## Status (bookkeeping, not sequencing)

union+namespace shape + `address: Type`-only — done. FunctionType rename — done. Package moves
— done, direct-repoint shape (no shims: di.core imports Type/IServiceProvider straight from
primitives; utils split — memo/UnionToTuple → primitives-internal, isAllThere/first →
di/CallSite/utils.ts; primitives rebuilt clean; di.core barrel re-exports the Type surface +
IServiceProvider and now ScopeCache). Handoff snapshot committed + pushed as tag `di2-handoff`
(9aa32c9).

Engine v1 — done, UNCOMMITTED past the tag: `Engine` (context-taking resolve, additionalServices
layering, `UnsatisfiableError` at the boundary), ToPlanVisitor finished (union first-satisfiable
member; literal → constant; `IServiceProvider` recognition; function → registration lookup then
latebound fallback; intersection/object/tag/ctor → generic lookup; placeholder → undefined),
RealizeVisitor rewritten (latebound loop-back through the engine; ad-hoc machinery deleted), dumb
`ServiceProvider`, `ToStringVisitor.visitCtor` finished. No scopes, no async, no memo, `Type.parse`
still throwing. Lookup direction (owner-corrected): the registration must extend the request —
`returnType extends requestedType` — via the pattern-match sibling of satisfies,
`Type.op.match(pattern, subject)`: same subtyping direction, placeholders capture on the PATTERN
(registration) side; variance-flipped sub-positions land pattern placeholders on the condition side
of the sub-match, where the inherited capture branch handles them. `visitUnion` falls back to a
whole-union lookup after member decomposition fails, so a union-TYPED registration serves the exact
union request (and correctly refuses a lone member). Lowering failure is `undefined` internally
with `UnsatisfiableError` thrown at the engine boundary (`'failzor'` gone).
Manifest verbs now hand each new Manifest a re-iterable (`{ [Symbol.iterator]: gen.bind(this) }`) —
a stored generator OBJECT is one-shot, and the old shape emptied the manifest after its first full
iteration. Smoke green, 16 checks (`libraries/di/smoke.ts`, throwaway): value / ctor /
deps+literal / factory / tuple / union member fallback / open-generic close / SP injection /
latebound with call args / UnsatisfiableError / literal-serves-base / union-registration
refuses-lone-member + serves-exact-union / open-function capture through a contravariant position.

Residual owner WIP, untouched: the four token-based manifest verbs (`addClass`/`addFactory`/
`tryAddClass`/`tryAddFactory`) pass `DepSignatures` (Token strings) where `Type[][]` is now
required — unfixable until `Type.parse` exists or `DepSignatures` changes shape; the
`addMany`/`AugmentationSet2` variance error (blocks di.core's gated build — verification bypasses
it with a scratchpad no-gate driver; zero repo edits); `isString2d` in di.core/utils.ts is now
dead code (owner's factory-signature change removed its last caller). Owner directs what comes
next.
