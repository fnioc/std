# di2 scope & async requirements — TEMPORARY

> Working capture of the 2026-08-13 scope/async design session, maintained as the session runs.
> Requirements only — no implementation plan. Untagged entries are owner-ruled in conversation;
> **(proposed)** entries are Claude's, shown to the owner and not overruled; **OPEN** marks
> decisions still pending the owner. Companion to `di2.requirements.md` (the taxonomy/dialect
> capture) and `di2.scope-notes.md` (scope research inputs). Delete once the rulings land in the
> decision records and code.

## Principle — THE UNTHINKING PATH RUNS THE DEFAULT MODEL

The user who never makes a choice gets the default — so every stability guarantee attaches to
defaults, and every freedom attaches to deliberate opt-ins. Judge each default by the user who
will never think about it (conventional, stable, frozen at birth); judge each capability by the
user who deliberately swaps it in (total, unhedged power — IoC applied to the container itself).
Weigh EVERY design decision in this document against this split.

## Vocabulary

- "Scope", unqualified, names the PROVIDER-side runtime scope. The composition-side construct is
  always spelled ManifestScope.
- Resolution phases: **plan time** (pure, memoized) → **hoist** (async pre-pass) → **gather** (the
  one await point) → **plug** (final sync walk). "Realize" names ONLY an invocation of the sync
  realize visitor — it runs once per hoisted entry (on that site's inner subtree) plus once as the
  plug. An async site is bound at hoist/gather and read at realize; awaits never live inside a
  realize walk.

## Async — plan layer

- An async site is a PLAN-NODE kind (a wrapper around its inner site), never a Type. The
  placeholder/generic kind stays exclusively the match-walk capture hole; engine bookkeeping never
  enters the Type vocabulary.
- Hoist links are HARD, identity-keyed: the per-resolution context maps the async-site node object
  itself to its value/promise (`Map<AsyncCallSite, …>`). No string labels, no parallel namespace.
  The map is CONTEXT-BORNE and therefore per-resolution by nature: the boundary's realize mints a
  fresh map and threads it through the realize context to its descendants — the same channel that
  threads the scope blackbox, delivered subtree-scoped. Keys are the site nodes, never promises.
- REALIZE MECHANISM (owner-designed): the collection point rides the PLAN-construction visitor
  context — a minted `PromiseCallsite` threads a clean one; an exact-miss/`Promise<T>`-hit mints
  an `AsyncCallSite` that registers on it; when the boundary's walk returns, the accumulated
  contents freeze onto the boundary node as its inventory (immutable-once-assigned — the
  only plan-side residue).
- AN `AsyncCallSite`'s INNER IS ITSELF A BOUNDARY (owner-surfaced): its inner is the `Promise<T>`
  candidate's callsite — promise-typed as-requested — so a new collection point opens beneath
  every `AsyncCallSite` automatically under the every-promise-callsite-is-a-boundary rule. The
  two kinds differ only in delivery: `PromiseCallsite` hands over the promise UNAWAITED;
  `AsyncCallSite` is awaited by its ENCLOSING PromiseCallsite's hoist and delivers the settled value.
  Consequence: LAYERS DO NOT EXIST WITHIN A PromiseCallsite — they are nested PromiseCallsites. A PromiseCallsite's sites
  are mutually independent by construction (a site's async deps register on its inner boundary's
  clean collection, never the enclosing one), so no dependency edges and no topological ordering
  exist: at realization the boundary is visited first, builds one entry per site
  (`realize(inner) → await`), gathers them with a flat `allSettled` inside its own wrapping
  promise, writes settled values into the context-borne map, and the plug walk beneath reads by
  site identity. Depth serializes through promise nesting; sibling entries (and their nested
  gathers) run concurrently; diamond sharing stays per-occurrence, shared only through scope
  caches (hit-skips per site).
- The invariant this rests on: OCCURRENCE IDENTITY — two occurrences of the same async dep are two
  distinct node objects. Plans built by walking give this naturally; if plan subtrees are ever
  shared, the async-site wrapper is minted fresh per inclusion point (wrapper identity ≡ occurrence
  identity) while its inner points at the shared subtree. **(proposed)**
- NO ASYNC KIND EXISTS IN THE TYPE GRAMMAR (owner-ruled 2026-08-13, via team-lead; extended same
  day to AsyncIterable): "T delivered later" is spelled by the ordinary global generic `Promise`
  node, and AsyncIterable factors into async delivery (call-site) × iterable resolution (grammar —
  `Type.iterable`/`Type.array` remain the collection doors, unchanged). Async is PURELY CALL-SITE
  behavior: async resolution rules activate whenever an ANCESTOR CALL SITE is a promise — the
  nearest enclosing promise call site is the async boundary, and the awaiting happens WITHIN that
  promise. A top-level `Promise` request is just the root case of the same rule; the async
  call-site recognizes two requested shapes — `Type.global('Promise', [X])` (X delivered later,
  single) and `Type.global('AsyncIterable', [E])` (the E collection streamed per-item over the
  SAME iterable resolution the sync path uses). `getServiceAsync(t)` wraps the requested type in a
  Promise node and forwards through the one door — NOTHING ELSE; all machinery lives in the
  promise-call-site handling. The async call-site node's shape is this session's design
  deliverable.
- Mechanism (owner-designed): the plan-construction visitor context carries a COLLECTION of async
  sites. Every call site minted on a promise fallback is collected into the current collection; a
  node that is a new async boundary walks its descendants with a CLEAN collection and, when that
  walk returns, owns its inventory — assigned once, so nodes stay immutable after
  construction. Collection-presence is the fallback gate (a miss on `T` falls back to a
  `Promise<T>` lookup iff a collection exists); an empty collection marks a fully-sync PromiseCallsite and
  skips the async machinery outright. The collection is the plan-time inventory; the
  identity-keyed per-resolution map is unchanged at resolve time — static inventory per PromiseCallsite,
  per-resolution values. Caveat: if sub-plans are ever memoized per type, boundary context joins
  that memo key; per-root plans need only the walk state.
- THE SYNC DOOR HAS NO ASYNC FAILURE MODE (owner-ruled): outside a boundary the fallback never
  fires, so a graph needing it just MISSES like any other unregistered dependency — an ordinary
  `UnsatisfiableError`, no async-specific taxonomy member, no "surviving async site" concept.
  Consequence, struck knowingly: the former "a fully-cached async graph resolves through the sync
  entrypoint" corollary is dead — plans are pure and cache-independent, so the sync plan for such
  a graph does not exist regardless of cache warmth. Hit-skips survives fully WITHIN PromiseCallsites (a
  cache hit still skips the factory and its await).
- The compositions stay distinct and both remain expressible: `Promise<Iterable<E>>` = the whole
  collection delivered later, then sync iteration; `AsyncIterable<E>` = per-item streaming, each
  element resolving at iteration time.
- ITERABLE VS ARRAY = WHEN THE SCOPE CACHE IS CONSULTED (owner-distilled): `Array<T>` consults and
  fills at RESOLUTION (a snapshot — the engine doing `Array.from` for you; immediate full
  iteration of the iterable is provably element-wise identical); `Iterable<T>` consults PER
  ELEMENT at each iteration step (a live query — later steps see later scope state, transients
  fresh per iteration, short-circuit skips construction, an unsatisfiable element throws from its
  step). Re-iteration pin **(proposed)**: each `Symbol.iterator`/`Symbol.asyncIterator` call mints
  a FRESH walk — never a one-shot iterator object; a stable snapshot is spelled `Array<T>`.
  KNOWN ENGINE DELTA (owner-flagged): the live engine currently realizes `Iterable` and `Array`
  through IDENTICAL logic — the consult-time split above is unimplemented and must be addressed
  when the aggregate arms land.
- THE ELEMENT-UNIVERSE RULE (owner-ruled): `AsyncIterable<E>`'s elements are the `E` registrations
  PLUS the `Promise<E>` registrations — each promise element awaited at its step; the KEY
  behavioral difference from the sync spelling: `resolve<AsyncIterable<T>>()` can resolve services
  added via `add<Promise<T>>()`, where `Iterable<T>` cannot (its steps run at user iteration time
  with no await structurally available — a promise element could only be delivered unawaited, a
  lie against `E`). **OPEN sliver:** whether `Array<E>` under an enclosing `PromiseCallsite`
  admits `Promise<E>` elements too (materialization happens at realize, so they could hoist into
  the enclosing gather).
- THE ASYNCITERABLE ARM **(proposed)**: the `AsyncIterableCallsite`'s fallback (after exact match,
  like every arm) plans the element sites per the element-universe rule above, but each
  element subtree walks under its own clean collection — PER-ELEMENT inventories, so an element's
  async deps belong to its own step, never a pooled gather. Realize is an async generator: each
  `next()` runs that element's flat `allSettled` gather, plugs the element, yields — pull-based
  and lazy (elements never iterated never resolve); an empty element set completes immediately
  (the empty-aggregate answer); a step's gather failure throws from that `next()` as the same
  reason-deduped `AggregateError`.
- COMPOSITIONAL DISSOLUTIONS **(proposed)**: hit-skips slots into the entry — an `AsyncCallSite`
  entry consults the scope for `T` before `realize(inner)`; a hit writes the map and prunes the
  entire inner boundary. Latebound × async needs no rule: a latebound closure with a promise
  return re-enters through the one door with a promise-typed request, which IS a `PromiseCallsite`
  at the re-entry root.
- THE PROMISE CALL-SITE (owner-ruled): every call site whose AS-REQUESTED type is a promise is
  wrapped with a `PromiseCallsite` — THE async boundary node: descendant awaits hoist to it, and
  its realize is a transparent wrapping promise that awaits its collected deps then yields the
  requested value. The boundary-collection walk assigns each inventory to exactly this
  node; an empty PromiseCallsite degenerates to `Promise.resolve(realizeSync(inner))` — uniform mechanism,
  near-zero cost for sync graphs.
- LOOKUP-THEN-ACTIVATE IS THE ESTABLISHED VISITOR ARCHITECTURE (declared in the cloud2 session):
  exact-match lookup happens in ToCallSiteVisitor's overridden `.visit` FOR ALL TYPES — a literal
  `Promise<T>` registration wins there like any other — and fallback behavior lives in the
  kind-specific `.visit*` arms. The promise wrap is therefore the promise arm's ORDINARY fallback,
  not a new mechanism: on exact-match miss of a promise-headed request, synthesize the
  `PromiseCallsite` from the element — at top level (entailed by the door ruling:
  `resolve<Promise<T>>()` ≡ `resolveAsync<T>()` after the wrap) AND mid-graph (closed by
  uniformity — one mechanism for all use-cases; an empty promise arm would be the carve-out).
  What the wrap buys: delivery-mode decoupling, the symmetric twin of the ruled fallback
  (fallback adapts async-registered→sync-wanting; wrap adapts sync-registered→promise-wanting —
  a consumer's declared delivery mode is fully decoupled from the registration's actual mode),
  plus user-controlled awaiting as a manual orchestration escape.
- Asyncness is otherwise a MANIFEST fact, compiled away at plan time: the plan-construction walk
  discovers it (dep wants `A`, the promise-typed registration answers) and mints the site. The
  plan's async-site inventory is pure manifest+request structure.
- The hoist is a PER-RESOLUTION, HIT-PRUNED, CONTEXT-THREADED tree walk — never a flat sweep over
  the inventory. An ancestor hit prunes its descendant async sites (their values live inside the
  cached instance); an ancestor miss shifts their context. The flat inventory survives only as an
  upper-bound index ("does this plan contain async at all" — the cheap skip for fully-sync graphs).
- Static inventory vs dynamic effective set: each resolution filters a PromiseCallsite's inventory through
  the asking scope — hits satisfy sites synchronously within the PromiseCallsite, misses become in-flight
  entries. A sync walk contains no async sites at all (the fallback is boundary-gated at plan
  time), so the sync/async distinction is decided by plan structure, never by cache state.
- Plan memoization records instructions only — the callee reference and the argument wiring, never
  a return value. Plans hold no instances; results live only behind the scope door.
- NEAR-MISS DIAGNOSTICS (owner-designed): the promise fallback LOOKUP is ungated — on a final
  miss it runs in both modes, and only the consequence is mode-dependent: under a boundary a hit
  mints the async site (the normal fallback); outside one a hit throws the ordinary
  `UnsatisfiableError` CARRYING async-hint data ("a `Promise<T>` registration exists — did you
  mean an async request?"). One mechanism, two consumers; the throw happens at the exact failing
  dependency, so the hint names it. Two pins: the hint is data on the existing error — no new
  taxonomy member, the no-async-failure ruling stands; and the probe sits exactly where
  unresolvable would throw — last resort only, after construct-on-miss/union/other candidates are
  exhausted, never preempting a viable satisfier. The hint is a pointer, not a success guarantee —
  a deeper async failure surfaces iteratively. The pattern generalizes as further near-miss data
  kinds on the same error: keyed-under-a-tag, and private-in-scope once ManifestScope lands.
  One-directional by construction — async lookup is a superset of sync.
- PROMISE-HEADED GUARD (owner-ruled): a final miss on a promise-headed type never runs the
  fallback probe — nested promise delivery is not a thing reality distinguishes — in both modes
  the failure is plain unresolvable. (Flagged sibling, not decided: whether a missed
  promise-typed slot synthesizes from a registered `X` — resolve sync, deliver wrapped.)
- THENABLE REALITY (owner-ruled goal; mechanisms **(proposed)**): (1) element-settled invariant —
  the promise spelling normalizes a promise-headed element at mint (`Promise<Promise<X>>` mints
  the interned `Promise<X>`; the `named`-door canonicalization contract), so a nested promise
  node cannot exist; (2) assimilation is `await`'s job — awaited values are settled by JS
  semantics, so the values-never-promises cache rule is enforced by reality, the engine writes no
  unwrap of its own, gather entries await unconditionally, and no `instanceof Promise` exists
  anywhere (runtime branches use thenable-protocol checks — callable `.then` — the
  `ChangeToken.onChange` posture); (3) the grammar stays nominal — `PromiseLike<X>`/custom
  thenable types are ordinary named types, assimilated by the gather when awaited, but excluded
  from the promise fallback probe (`Promise`-headed only).

## The scope door

- THE WHOLE PICTURE (owner-ruled): the scope system is ONE CALLABLE BLACKBOX riding the visitor
  context. At each callsite visit the engine calls it — `(site identity, serviceType
  AS-REQUESTED, lifetime datum, factory)` — and it returns the instance/value. Hit-vs-make is
  INTERNAL to the blackbox: the engine always receives the value it uses (canonical-by-return is
  automatic), and a hit prunes the subtree simply because the factory was never invoked. The
  blackbox also supplies the (possibly different) blackbox governing ALL DESCENDANT visits —
  delivered with the factory invocation (descendants realize DURING the factory call, so it
  cannot arrive by return); the former `ScopeCtx` token is gone — THE BLACKBOX IS THE CONTEXT.
  Everything beyond this call surface plus the createScope requirement below is blackbox-impl
  detail of particular models.
- The governing lifetime comes from the ANSWERING descriptor while the cache key is the
  as-requested type — the join happens at plan time, so the blackbox never sees the promise-typed
  address; it stores and returns awaited values only (async-blind by construction; for an
  in-flight make the returned "value" is the shared promise, consumed only by the gather).
- Because the blackbox performs every make, it OBSERVES every instance by construction — the
  disposal fact feed collapses into the call itself. `undefined`-datum sites flow through the call
  like any other (the blackbox is their interpreter — see Lifetime data), so observation is total;
  only DESCRIPTOR-LESS engine-synthesized sites bypass it, and their results are caller-owned by
  the invoke ruling.
- Engine guarantees: one call per LIVE site; deterministic pre-order; site identity in the call;
  faithful subtree-scoped delivery of the descendant blackbox — per-subtree, by argument through
  the recursive walk, never global (a singleton match shifts its subtree to the root blackbox; a
  transient answer forwards unchanged). The only thing foreclosed is observing sites pruned by an
  ancestor hit — inherent to caching. **(proposed)**
- Mechanism/policy line: the blackbox decides WHETHER each site produces work and WHERE results
  land; the engine decides how outstanding work is scheduled, awaited, and aggregated. Gather
  semantics are container-level and uniform across every scope model: awaits live only in the
  gather, `allSettled`-shaped, failures thrown as one `AggregateError` deduped by reason identity.
  **(proposed)**
- Latebound re-entry: the closure captures the CONTEXT BLACKBOX in effect at its mint site and
  re-enters against it — captured-scope semantics by construction, since the blackbox is the
  context. A model wanting reset-to-root or ambient binding controls what it forwards to latebound
  factories, which requires the model to distinguish latebound sites — whether the call surface
  marks them (a site-kind fact it already carries via site identity) is settled in the async/plan
  design, not a new arm. The engine keeps only what is uniform: the re-entry path follows the
  declared return type. **(proposed)**

## Lifetime data

- The lifetime datum on a descriptor is OPAQUE to the engine at runtime — pure data riding
  descriptor and plan, interpreted only by the installed scope model's door. Forced by the models
  below coexisting: one model's datum is a meaning-free user string, another's a structured node.
- At the TYPE level the datum is the scope engine's declaration: the scope generic argument can be
  TRULY ANYTHING — a string union, a structured node type, even a lambda type for per-registration
  custom behavior (a function-valued datum is behavior-as-data, same precedent as factory impls on
  descriptors; the door calls it).
- BECAUSE the scope blackbox dictates that generic, manifest factories come OFF THE SCOPE ENGINE —
  the engine choice therefore precedes manifest creation and dictates how the manifest is made. No
  ad-hoc `Scopes extends string` threading; the parameter flows from the one engine choice. The
  specific entry-point shape — e.g. a di-builder fluent API where you pick the engine and receive
  the correspondingly-typed manifest surface — is an owner IDEA, not ruled; only the dependency
  direction (manifest off scope engine) is prescribed.
- If `undefined` is not ASSIGNABLE to the engine's lifetime type, leaving a registration's scope
  unset is a COMPILE ERROR — optionality of the lifetime argument follows
  `undefined extends TLifetime` exactly (assignability, not literal union membership — the
  declared type can be any shape). WHETHER `undefined` is included is the BLACKBOX's own choice
  (owner-ruled): the model owns both halves of the key — its admissibility (this strictness dial)
  and its meaning (the binding above). The rule covers BOTH dialects (owner-ruled): in the builder
  form, when `undefined` is not assignable, completion is reachable ONLY through `withLifetime` —
  the established stage-gating pattern, conditioned on `TLifetime` (`undefined extends TLifetime ?
  stage & IComplete : stage`); a registration-time runtime guard (admissibility flag supplied by
  the model to the manifest surface) backs untyped callers.
- `undefined` IS A KEY LIKE ANY OTHER, BOUND BY THE BLACKBOX (owner-ruled): the whole datum
  domain, `undefined` included, is keys into the installed model's behavior — swap the blackbox in
  one line and every registration's behavior changes, omissions included; that is inversion of
  control applied to the container itself. Legality stays typed (the assignability rule above) and
  meaning stays behavioral, both flowing from the same engine choice. Riders: the DEFAULT model
  binds `undefined` → transient, FROZEN AT BIRTH — and birth-frozen generalizes as a model-author
  convention: a published model's `undefined`-binding is immutable post-birth, so omission's
  meaning never changes except by the user's own deliberate engine swap. DESCRIPTOR-LESS
  engine-synthesized sites (invoke frames, construct-on-miss) are NOT in the datum domain — the
  engine controls their per-call freshness directly, under every model, which is what preserves
  the invocation lane's guarantee; the user-facing always-create escape is a default-model
  property, and a swapped model may foreclose it as its own deliberate design.
- Nobody but the blackbox interprets ANY datum: the resolution engine inspects none of it; captive
  validation relays the datum to a MODEL-supplied ordering interpreter (a model that declines —
  e.g. any lambda-datum model — opts out of captive checks); diagnostics prints without
  interpreting. Because the blackbox is the interpreter of `undefined`, such sites necessarily
  flow through the call — observed-every-make holds with no extra protocol.
- The default model's vocabulary: a small interned kind-tagged union — `undefined` (transient) |
  `singleton` | `scoped` | `matching(tag)` — strategy and parameter as separate fields, so the tag
  namespace holds only user tags, no reserved values. **(proposed)**
- The STRING MODEL is a named candidate scope model, not a top-level requirement: user-vocabulary
  tags with no implicit meaning, scope lifetime bound to the holding variable (`using`-protocol
  support in the disposal design is its consumer). Root-pinning and ask-scope caching, if that
  model wants them, are its own interpretation choices.
- Under the DEFAULT model, an omitted lifetime is the first-class always-create: nothing caches,
  the hit-prune/store machinery never engages, per-occurrence semantics hold.

## Scope creation

- AUDIT (verified against the autofac lifetime catalog): the whole-picture model expresses the
  entire catalog — call surface (per-dependency/singleton/scoped/matching/per-request/custom/
  graph-shape), model-shipped registrations (`createScope` with tag + descriptor-carrying args;
  `Owned<$T>` as an open registration), descriptor vocabulary (owns-what-it-creates,
  external-ownership, release override) — and is strictly stronger twice: canonical-by-return
  grants instance substitution/wrapping without a pipeline, and sharing policy itself is
  model-territory. Sole exclusion: parameter mutation (activation-pipeline, not lifetime; factory
  territory here).
- The blackbox is REQUIRED to register a `createScope` service (owner-ruled) — the user's
  entrypoint into opening scopes, itself returning a blackbox-backed provider.
- Creation is RESOLUTION-DRIVEN: scope factories are registered in the manifest and obtained
  through `getService`, like any service. The sole structural exception is the GENESIS: the root
  ctx is minted at provider build. Installing a scope model = its door + its genesis + its
  registrations; swapping models is swapping registrations.
- Parenting falls out of resolution ancestry: the asking context (as shifted) is the natural
  parent. The factory registration's OWN lifetime selects the parenting policy — a scoped factory
  yields children of the asker; a singleton factory realizes under root context and yields children
  of root. A factory injected into a service parents at the ctx it was realized under. No new
  mechanism. **(proposed)**
- Creation args stay inside existing grammar. Two candidate shapes — **OPEN**:
  1. latebound `Func` types per model (zero new surface, no single well-known address);
  2. one uniform `ScopeFactory` address whose `create(options?)` options type models extend by
     declaration merging (one discoverable address; recommended). **(proposed lean: 2)**
- The user-visible scope is a fresh `IServiceProvider` minted as the (engine, child-ctx) binding,
  plus the disposal surface. No additional public scope type.
- Per-scope registrations = a factory argument carrying descriptors — the `additionalServices`
  layering. Caveat riding with it: a plan memo keyed on the interned request alone is unsound under
  layered descriptors; the layer joins the memo key or the resolution bypasses the memo.
- Measured engine-state inputs (team-lead, 2026-08-13 — priority weights, not requirements): scope
  creation is the critical path (`createScope` throwing accounts for 56 of the 88 known-red tests;
  those tests exercise the placeholder surface and rewrite to this design when it lands); the
  dispose/disposeAsync stubs account for 23 more; singleton instance identity is not honored at all
  today (two resolutions construct twice — the instance layer is entirely greenfield, nothing to
  preserve). Downstream consumers gated only on this model: `validateOnStart` and the per-provider
  logging-config reload test.

## Write-back and the race — default-model design record

> With the whole-picture call surface above, everything in this section is BLACKBOX-IMPL detail of
> the default model, retained as its design record — not engine contract.

- Post-gather values must be ADMITTABLE into the scope under cacheable lifetimes — forced by
  hit-skips + values-as-requested + the sync-door corollary: hits can only exist if async-created
  values were stored earlier. Caches store awaited VALUES, as-requested, never promises; a hit
  skips the factory and the await entirely.
- THE RACE IS DISSOLVED BY ADOPT-OR-STORE (owner-ruled): the write-back re-checks the cache after
  promise resolution — atomic because the post-await re-check-and-store runs synchronously in one
  continuation, no coordination state needed. First store wins; a losing walk RELEASES its own
  instance through the disposal vocabulary and adopts the winner. Contract delta: write-back
  RETURNS the canonical value and the engine uses the returned value, never its locally-awaited
  one. IDENTITY NO-OP PIN: `existing === value` returns existing and releases NOTHING — a factory
  sharing its in-flight promise delivers the same instance to every walk, and releasing it would
  destroy the canonical. Resulting guarantee, stated honestly: at most one instance ever
  OBSERVED; under concurrent first-resolution, extra instances may be transiently constructed and
  are immediately released — and effects that disposal cannot reverse are the FACTORY's to guard
  (owner-flagged). The effectful-factory ladder: reversible effects are covered by
  release-on-adopt; irreversible + singleton — the factory single-flights itself by sharing its
  in-flight promise (one line, respected by the identity no-op); irreversible + scoped — closure
  state is per-descriptor (shared across scopes/providers), so userland single-flight is WRONG
  there: that case is the named demand condition for the additive `outstanding` arm, deferred
  until such a consumer exists. Promise-holding caches stay overruled; no in-flight registry
  exists today.

## Disposal

- Disposal BEHAVIOR is blackbox policy — timing (variable-bound, request-end, weak/GC, pool),
  ordering, cascade rules, partial-failure handling. Disposal is scope's domain and never touches
  the callsite/plan layer.
- Three things stay engine-side:
  1. **The contract** — what a disposable scope is (`Symbol.dispose`/`Symbol.asyncDispose`
     protocols, the `disposeAsync` shape) and what disposal guarantees: every tracked instance
     released per its release vocabulary, failures AGGREGATED (never abort-on-first), a disposed
     scope's door answers with a loud error. Uniform obligations, model-owned execution.
  2. **The per-descriptor disposal vocabulary** — release override (e.g. return-to-pool) and
     external-ownership opt-out, as pure data with ENGINE-defined meaning: "don't you dispose me"
     means the same thing under every model. The blackbox is contracted to honor it, never
     reinterpret it.
  3. **The fact feed** — every instance the engine realizes passes through the door in creation
     order (the realize walk is post-order, so ask/store order IS dependency order; LIFO teardown
     is derivable blackbox-side). Includes transient disposables via a TRACK op — they enter no
     cache but the resolving scope must be told about them or no model can dispose them. The feed
     is also what makes partial-init unwind expressible as policy (immediate release vs hold to
     scope end).
- Requirements checklist for the disposal design (survey-derived): per-registration disposer;
  teardown in reverse dependency order INCLUDING on partial-init failure; release seeing the
  outcome (success vs downstream failure) for rollback semantics; consumer-owned early release
  (owned-wrapper style); external-ownership opt-out; release override. Split at design time into
  contract items vs default-model policy.

## ManifestScope

- `manifest.scope(configure)` — the block/returning-delegate form is the primary spelling: the
  scope closes implicitly at the delegate's return, and the caller can never accidentally continue
  registering inside the boundary. A naked `createScope()`/`endScope()` pair exists only if a real
  caller can't use a delegate. Inside the block the type is plain `Manifest` — a library's
  configure function cannot tell whether it is top-level.
- Per-registration public/private is the LIBRARY's export list (only the module knows its
  internals); the scope boundary is the CALLER's import decision. Libs self-scope as hygiene;
  callers scope for the guarantee; redundant double-scoping is harmless.
- Harmless-redundancy REQUIRES transitive export: a public registration bubbles up through every
  enclosing boundary; a private registration pins to its declaring scope. Deliberate censoring of
  an inner export is out of scope for v1.
- Lookup visibility is LEXICAL: a descriptor's candidate set = its declaring scope's chain — own
  scope (privates included), ancestors, and nested scopes' publics. A private inner registration
  SHADOWS an outer one for that scope's descriptors — contextual binding in its principled,
  statically-visible form. Top-level `getService` resolves against the root scope: exports only;
  root-level privates are resolvable by root descriptors but hidden from external resolution (an
  anti-service-locator guard).
- Ordinary descriptor verbs (`replace`/`removeAll`/`tryAdd`…) are visibility-scoped exactly like
  lookup — a peer cannot silently touch another module's privates.
- Overriding a private IS possible, through deliberate doors only: (1) verbs applied inside the
  scope block after the lib's configure returns (whoever holds the block holds override rights —
  zero new mechanism); (2) a self-scoped lib's own tweak-callback parameter; (3) a loudly-named
  root-authority deep override (build-time overrides layer) that pierces all boundaries — the test
  and composition-root story. Visibility governs resolution, never composition authority; privacy
  protects against accidental peer coupling, not against the graph's owner (Type interning makes
  every address forgeable — the boundary was never a secret). Sealed-forever privates are
  rejected. **(proposed)**
- Plan-layer consequence: lookup gains a static CONTEXT parameter and the plan memo key becomes
  `(request, lookup-context)`. Pure — the context is static manifest structure — so the three-layer
  cache model is untouched; designed in now, not retrofitted.

## Extensibility stance

- NO middleware/interception chain, in the engine or the scope system. Every surveyed middleware
  use-case decomposes into: factories, plan-time composition, descriptor data, the scope door,
  per-scope layering, or a read-only observer seam. Purpose-built seams ship on NAMED demand; the
  decomposition table is the record of why.
- Joints vs surfaces discipline: architectural joints are reserved BEFORE freeze (retrofits break);
  additive surfaces ship on demand (new API in a minor). The foreclosure audit — every deferred
  capability answers "additive later, or joint? if joint, where reserved?" — is a standing artifact
  of the plan docs; a row answering "joint, nowhere" is a design gap to fix before freeze.
- The named extension points the ecosystem-survey verdict is CONDITIONAL on (if one ships weaker
  than designed, its filtered capabilities revert to gaps): the scope door; manifest-as-data +
  descriptor verbs; latebound re-entry; construct-on-miss; open (`$T`) registrations; the
  augmentation registry; the disposal design's descriptor vocabulary; ManifestScope.
- Surveyed genuine gaps, dispositioned: build-time graph validation (#330; captive checks
  additionally need the scope contract to let lifetimes declare an ordering — a reserved joint);
  ManifestScope (#329; designed above); resolution diagnostics (#331; purely additive, nothing
  reserved). Pre-redesign di issues carry the `di classic` label.

## Invocation coupling

Value-driven invocation (owner-ruled 2026-08-13; built on the team-lead lane) is a `getService`
VALUE overload — `getService(ctor | fn)`: a class (non-writable-prototype sniff) constructs, any
other function calls, with a TypeError-construct-retry rescue. It consumes this design as its
first client:

- Its synthesized frame descriptor is transient (no lifetime datum) — per-call freshness via the
  first-class always-create, no invoke special case. Dependency arguments beneath the frame flow
  through normal caching.
- Results are CALLER-OWNED (ruled): the frame carries the external-ownership opt-out — never in an
  instance cache, never in the disposal track feed.
- The frame's ROOT plan bypasses the plan memo unconditionally: structural interning aliases
  distinct function values onto one node, value-identity keying buys nothing (identities are
  usually per-call fresh, and the frame plan is one node deep — all depth lives in the arg
  subtrees, which memoize normally as interned requests).
- The `additionalDescriptors` layer resolving newest-first is LOAD-BEARING for invoke: the
  synthesized frame descriptor must win over any structurally-identical manifest registration.

## Open ledger

1. Scope-creation args: per-model `Func` types vs uniform `ScopeFactory` + merged options type.
2. Async call-site design residue: the async call-site node's shape; the AsyncIterable arm
   (per-item streaming over the sync path's iterable resolution, outside the gather); per-boundary
   nested PromiseCallsite gathers' interaction with the hoist's scope-cache checks.
3. Captive-dependency validation: the lifetime-ordering declaration hook in the scope contract.
4. Disposal design proper (contract + default model), including `using`-protocol support.
5. ManifestScope dialect (spelling of private registration; deep-override verb naming) and the
   root-authority override surface.
6. Library portability under model-typed manifests: what lifetime vocabulary an oblivious
   `(m) => m` configure function targets (default-model lingua franca vs a capability-constraint
   story).
