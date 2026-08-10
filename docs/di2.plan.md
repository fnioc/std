# di2 plan — desired endgame

The target end-state for di2 / di2.core / primitives. Audience is a fable agent (possibly not this
session); instructions density, no over-explaining. NOT a decision record and NOT a sequence —
implementation order is directed by the owner separately. Scope design is deliberately absent
(§Held; parked research in `docs/di2.scope-notes.md`). Items tagged **(proposed)** are Claude's,
shown to the owner and not overruled; everything untagged is owner-set.

## Architecture & packages

- **primitives** owns the Type algebra (`src/Type/`: Type + kind interfaces, TypeVisitor,
  Equals/ToString/Substitute/Satisfies/Validator/ExpandUnions visitors) and `IServiceProvider`.
  Zero-dep leaf holds — trivial helpers inlined, never imported.
- **di2.core** owns registration: ServiceDescriptor (+`op`), IManifest/Manifest, both augmentation
  sets, the error taxonomy. Re-exports Type + IServiceProvider from primitives (Token replacement
  is a later, separate effort). ScopeCache placeholder parks here pending scope design.
- **di2** owns resolution: CallSite (engine IR), ToCallSiteVisitor (lowering), RealizeVisitor, the
  Engine, ServiceProvider. Engine internals stay out of di2's public barrel.
- **Engine**: ONE per manifest, stateless per-resolution; internal context-taking
  `resolve(type, context)` plus the async sibling. `IServiceProvider` stays single-arg FOREVER —
  the user door. `ServiceProvider` is a thin (engine, scope-binding) facade.
- Recursion discipline: lowering recursion stays inside ToCallSiteVisitor; realize recursion stays
  inside RealizeVisitor; the ONE sanctioned cross-file loop is latebound → engine entrypoint.
- The engine memoizes `type → { tree, asyncSites }` (sound: manifest immutable, lowering
  scope-pure). A latebound re-entry layers extra value descriptors ⇒ its memo key includes those
  arg types, or bypasses. **(proposed)**

## Type layer

- `FunctionType` (kind `'function'`) is the shape; late binding is a callsite strategy (CallSite
  keeps `latebound`). Done.
- `Type.parse` performs structural upgrades only (`Func`→FunctionType, `Ctor`→CtorType). Strategy
  recognition happens at lowering: `IServiceProvider`→ServiceProviderCallSite,
  iterable→IterableCallSite, promise fallback→async placeholder. No ServiceProviderType kind.
  Value-type-as-service (`string`, `number`, …) errors at the resolve entrypoint, not in parse.
  **(proposed)**

## Lowering

- ToCallSiteVisitor consults the manifest, closes open generics (satisfies-captures →
  `ServiceDescriptor.op.substitute`), lowers to the CallSite tree. Scope-independent, always.
- Failure signal is `UnsatisfiableError` everywhere — the `'failzor'` throw and undefined-returns
  die. Catch sites: union-member choice, next-signature choice, promise fallback. **(proposed)**
- A lookup miss on `T` falls back to `Promise<T>`; a hit there produces an async placeholder node
  (per-occurrence label) wrapping the `Promise<T>` site.
- The ad-hoc machinery is deleted: `AdHocCallSite`, `RealizeContext.adhoc`, the ServiceProvider
  adhoc branches. Latebound call args enter re-entry as value descriptors (`additionalServices`).

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
  args as value descriptors. This is THE cross-file loop.
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

union+namespace shape + `serviceType: Type`-only — done. FunctionType rename — done. Package moves
— done, direct-repoint shape (no shims: di2.core imports Type/IServiceProvider straight from
primitives; utils split — memo/UnionToTuple → primitives-internal, isAllThere/first →
di2/CallSite/utils.ts; primitives rebuilt clean; di2.core barrel re-exports the Type surface +
IServiceProvider and now ScopeCache). Residual typecheck errors are owner WIP (isString2d import,
ctor's signatures branch, addMany/AugmentationSet2 mismatch) plus the TS1127 WIP line now living in
di2. Owner directs what comes next.
