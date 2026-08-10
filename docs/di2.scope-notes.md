# di2 scope notes (parked research)

Raw material for the future scope discussion — not decisions. Owner deferred the scope talk
(2026-08-10); this file is the reboot point. Session tasks #3–#7 tracked the threads.

## Autofac catalog (condensed from research, autofac.readthedocs.io)

- **per-dependency** — new instance every resolution, cached nowhere. Default.
- **single-instance** — cached at root; shared by every scope in the tree.
- **per-lifetime-scope** — cached on the RESOLVING scope; resolved at root it degenerates to a
  singleton.
- **matching-scope(tag)** — cached on the nearest ANCESTOR scope carrying the tag; no tagged
  ancestor ⇒ THROW.
- **per-request** — matching-scope with one well-known tag (their ASP.NET Core integration actually
  uses plain per-lifetime-scope).
- **per-owned\<T\>** — `Owned<T>` mints a nested scope tagged by T; one instance per that scope.
- **nesting** — child resolves parent registrations, never the reverse. `BeginLifetimeScope(tag?)`
  and `BeginLifetimeScope(builder => …)` (per-scope registrations). Parent disposal does NOT
  cascade to self-created children — every scope you open is yours to dispose. Root-leak caveat:
  disposables resolved at root are tracked for the app's life.
- **disposal** — resolving scope owns what it creates; `ExternallyOwned` opts a registration out;
  `Owned<T>` hands responsibility to the consumer and cascades to non-shared deps.
- **relationships** — `Func`/`Lazy` re-resolve at invocation; WHICH scope they bind to is
  undocumented (autofac/Documentation#89) — no precedent constrains us.
- **captive deps** — consumer lifetime must be ≤ consumed's; autofac does not reliably detect,
  guidance only.
- **events** — OnPreparing / OnActivating / OnActivated / OnRelease; OnRelease REPLACES default
  dispose.

## Mappings onto di2

- The whole roster is one per-node question: which cache does `getOrAdd` target — none / root /
  current / nearest-tagged-ancestor / minted-child. Hook shape:
  `cacheFor(lifetime, chain) → cache | undefined`; the scope chain carries names.
- **Single-axis unification**: `ServiceDescriptor`'s open `Scopes extends string` can fold
  autofac's two axes (instance-scope kind + matching tag) into ONE tag space — `undefined` =
  transient, `'singleton'` = root cache, any other tag = nearest matching ancestor. A real
  simplification; needs owner sign-off.
- Tag-miss behavior: recommend THROW (autofac's choice) over silent fallback.
- Per-scope registrations = the same mechanism as latebound `additionalServices`: descriptors
  layered over the immutable manifest. Same engine-memo-keying caveat.
- Root degeneration becomes literal and intentional under singleton = scoped-to-root.
- Captive detection is statically POSSIBLE here (static trees, scope-pure lowering) IF lifetimes
  declare an ordering — an open string family has none intrinsically. Design input for hooks.
- `Owned<T>`-style ownership could be an `owned` callsite kind wrapping an inner site and minting a
  child cache.
- Disposal: nothing disposal-shaped exists in di2 yet. Open, discuss-first: TS explicit resource
  management (`Symbol.dispose`/`using`) vs a hand-rolled interface.
- Lifetime events: OnRelease ≈ overridable disposal (belongs to the disposal design); the other
  three are likely YAGNI for v1.

## Owner positions so far (NOT signed decisions)

- Scope is applied in RealizeVisitor only, absolutely last-minute; callsite trees memoizable; the
  current `ScopeCache` type is throwaway greenfield.
- Leans: latebound "might even be allowed to reset to the top level scope." On record against:
  scoped deps under the latebound would come from root rather than the invoking scope, and a
  matching tag active at build time would have to throw at root. The research memo leans
  captured-scope instead. Genuine fork, undecided.
- SP recreation-on-request over threading (owner proposal; agreed in principle — SP = (engine,
  scope) binding minted at the service-provider callsite). Unconfirmed detail: SP identity is then
  non-stable across requests unless memoized per scope.
- Disposal is scope's domain and must not affect the callsite layer.
- **Values are cached AS REQUESTED**: a scope cache stores the AWAITED value, never the promise,
  keyed by the requested type; a cache hit skips the entire hoist/await machinery. Consequence: a
  fully-cached async graph succeeds through the SYNC entrypoint. Open consequence (unargued): two
  concurrent `resolveAsync` walks that both MISS the same async singleton double-instantiate;
  promise-holding caches were proposed as the fix and are overruled — the race needs a different
  answer, or an explicit "accepted," eventually.

## Async leftovers that touch scope

- Hoist phase 1 must consult the scope cache per async site BEFORE realizing its inner (the
  hit-skips rule above).
- Placeholder labels are per-OCCURRENCE, never per-type: cross-consumer sharing comes only from
  scope caches, so transient semantics match the sync path exactly.
- Rejected alternates, kept for the record: an async twin of RealizeVisitor (awaits inline —
  auto-correct semantics, but two realize implementations drift and scope hooks run in two
  variants); a generator-yielding realize (one implementation, but awaits serialize and `yield*`
  infects every visitor method).
