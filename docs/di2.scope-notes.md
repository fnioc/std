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
- **Single-axis unification**: `Registration`'s open `Scopes extends string` can fold
  autofac's two axes (instance-scope kind + matching tag) into ONE tag space — `undefined` =
  transient, `'singleton'` = root cache, any other tag = nearest matching ancestor. A real
  simplification; needs owner sign-off.
- Tag-miss behavior: recommend THROW (autofac's choice) over silent fallback.
- Per-scope registrations = the same mechanism as latebound `additionalServices`: registrations
  layered over the immutable manifest. Same engine-memo-keying caveat.
- Root degeneration becomes literal and intentional under singleton = scoped-to-root.
- Captive detection is statically POSSIBLE here (static trees, scope-pure lowering) IF lifetimes
  declare an ordering — an open string family has none intrinsically. Design input for hooks.
- `Owned<T>`-style ownership could be an `owned` plan kind wrapping an inner site and minting a
  child cache.
- Disposal: nothing disposal-shaped exists in di2 yet. Open, discuss-first: TS explicit resource
  management (`Symbol.dispose`/`using`) vs a hand-rolled interface.
- Lifetime events: OnRelease ≈ overridable disposal (belongs to the disposal design); the other
  three are likely YAGNI for v1.

## Owner positions so far (NOT signed decisions)

- Scope is applied in RealizeVisitor only, absolutely last-minute; plan trees memoizable; the
  current `ScopeCache` type is throwaway greenfield.
- Leans: latebound "might even be allowed to reset to the top level scope." On record against:
  scoped deps under the latebound would come from root rather than the invoking scope, and a
  matching tag active at build time would have to throw at root. The research memo leans
  captured-scope instead. Genuine fork, undecided.
- SP recreation-on-request over threading (owner proposal; agreed in principle — SP = (engine,
  scope) binding minted at the service-provider plan node). Unconfirmed detail: SP identity is then
  non-stable across requests unless memoized per scope.
- Disposal is scope's domain and must not affect the plan layer.
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

## Cache keying — the reference's ServiceIdentifier / ServiceCacheKey (input for the unpark)

The reference engine never keys a cache on a bare type. Two structs compose the key
(`ServiceLookup/ServiceIdentifier.cs`, `ServiceLookup/ServiceCacheKey.cs`):

- `ServiceIdentifier = (serviceKey?, serviceType)` — the identity of a SERVICE, not a type:
  keyed services fold the key into identity (null-key and keyed never compare equal). Also carries
  the open-generic hop (`GetGenericTypeDefinition()` keeps the key, opens the type).
- `ServiceCacheKey = (identifier, slot)` — the per-REGISTRATION cache key. `slot` is the REVERSE
  index among same-identifier descriptors: the newest registration — the singular-resolution
  winner — is always slot 0, so the "resolve one" cache key is `(id, 0)` without knowing how many
  registrations exist; older ones count up. Both the call-site cache and each scope's
  resolved-instance store key on this.

Why it matters to our scope model: slot-keying is what makes `getService(T)` and `getServices(T)`
SHARE instance caches — each registration caches under its own slot, the singular path reads slot
0, the enumerable path reads every slot. Without it, resolve-one and resolve-all cache separately
and a scoped/singleton instance can double-instantiate. Our newest-first singular iteration makes
the reverse-index convention line up exactly (winner ≡ slot 0), and slots are computable once at
container build from the registration chain.

Our translation is cheaper than the reference's: with interned Types (`===`), a
`ServiceIdentifier` can itself be interned on `(type, key)` — every cache becomes a plain
`Map<ServiceIdentifier, V>` with identity semantics, no Equals/GetHashCode machinery. Layering:
it belongs in di.core (a service address composing a TypeIdentifier + key), NOT in the Type union
— a service identity is not a type, same argument that kept MemberType out. Open-generic
registrations compose cleanly: an `ILogger<$T>` identifier is an ImportedType with a placeholder
child — still identifier-kind under the partition.

**Owner rule on all of the above (2026-08-12): the scope model here may diverge sharply from the
reference — nothing from the reference is adopted without its own justification.** The
ServiceIdentifier/slot material above is INPUT to be argued case-by-case at the unpark, not a
default.

**Owner constraint (2026-08-12): metadata never holds state.** The reference lets the instance
cache leak into service metadata (a pre-supplied singleton lives ON its descriptor; a resolved
singleton is cached ON its call site). Our model keeps registrations and plans pure — instances
live only in scope-owned caches keyed by the interned request, never on registration or plan
records.

**Owner hypothesis (2026-08-13 — NOT in motion, nothing builds on it yet): scopes pull, the engine never pushes.** A
scope exposes a getOrCreate-shaped door; the engine hands it the RealizeVisitor entrypoint as
the factory, and the scope alone decides if and when that visitor runs (hit → never; miss → run
and store under the scope's own lifetime rules). How/where the run happens is undecided. This
composes the three-layer cache model: the plan memo delivers the same realize entrypoint every
time, and everything instance-shaped stays behind the scope's door.
