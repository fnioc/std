# di2 scope & async requirements

> Requirements for di2's scope system and async resolution. Companion to `di2.requirements.md`
> (taxonomy/dialect) and `di2.scope-notes.md` (research inputs). Requirements only — no
> implementation plan; every entry is owner-ruled. Scope-model-internal design material is NOT
> contract and lives in the addendum at the bottom, parked for the default scope model's own
> lane. Delete this file once the rulings land in the decision records and code.

## Principle — the unthinking path runs the default model

The user who never makes a choice gets the default — so every stability guarantee attaches to
defaults, and every freedom attaches to deliberate opt-ins. Judge each default by the user who
will never think about it (conventional, stable, frozen at birth); judge each capability by the
user who deliberately swaps it in (total, unhedged power — IoC applied to the container itself).
Weigh every design decision against this split.

## Vocabulary

- "Scope" names the PROVIDER-side runtime scope. No composition-side scope construct exists — the
  manifest is one flat registration space.
- The SCOPE MODEL is the installed scope system. Public API naming uses `ScopeModel*`.
- Resolution phases: **plan time** (pure, memoized) → **hoist** (async pre-pass) → **gather** (the
  one await point) → **plug** (final sync walk). "Realize" names only an invocation of the sync
  realize visitor — once per hoisted entry (on that site's inner subtree) plus once as the plug.
  An async site is bound at hoist/gather and read at realize; awaits never live inside a realize
  walk.

## The resolution surface

- Primitives' `getService` is single-signature — no overloads, ever (an augmentation cannot carry
  fewer args than base-interface overloads, so the base member stays pristine). The di-defined
  surface is the `resolve` family, augmentation-owned:
  - `resolve` — includes an overload duplicating `getService`'s signature, plus the VALUE overload
    (`resolve(ctor | fn)`): a class (non-writable-prototype sniff) constructs, any other function
    calls, with a TypeError-construct-retry rescue. Results are caller-owned.
  - `resolveAsync(t)` — wraps the requested type in a Promise node and forwards through the one
    door. Nothing else; all machinery lives in the promise-plan handling.
  - `resolveMany<T>()` — forwards to `resolve<Iterable<T>>()`.
    Semantically one door; `resolve*` are spellings over it.

## Async — plan layer

- NO ASYNC KIND EXISTS IN THE TYPE GRAMMAR. "T delivered later" is spelled by the ordinary global
  generic `Promise` node; AsyncIterable factors into async delivery (site) × iterable
  resolution (grammar — `Type.iterable`/`Type.array` are the collection doors). Async is purely
  SITE behavior: async resolution rules activate whenever an ancestor site is a promise
  — the nearest enclosing promise site is the async boundary, and the awaiting happens
  WITHIN that promise. A top-level `Promise` request is the root case of the same rule. The async
  site recognizes two requested shapes: `Type.global('Promise', [X])` (X delivered later,
  single) and `Type.global('AsyncIterable', [E])` (the E collection streamed per-item over the
  same iterable resolution the sync path uses).
- An async site is a PLAN-NODE kind, never a Type; the generic kind stays exclusively the
  match-walk capture hole — engine bookkeeping never enters the Type vocabulary.
- THE PROMISE SITE: every site whose as-requested type is a promise is wrapped with a
  `PromisePlan` — the async boundary node. Its realize is a transparent wrapping promise that
  awaits its collected deps then yields the requested value. The plan-construction visitor
  context carries a COLLECTION POINT: a minted `PromisePlan` threads a clean one; when its
  walk returns, the accumulated contents freeze onto the node as its inventory
  (immutable-once-assigned — the only plan-side residue). An empty inventory degenerates to
  `Promise.resolve(realizeSync(inner))`.
- Collection-presence is the FALLBACK GATE: a miss on `T` falls back to a `Promise<T>` lookup iff
  a collection exists. Exact-match lookup happens in the visitor's `.visit` for ALL types — a
  literal promise-typed registration wins there like any other — and fallback behavior lives in
  the kind-specific `.visit*` arms; the fallback mints an `AsyncPlan`, registered on the
  current collection. The same arm synthesizes the boundary on an exact-match miss of a
  promise-headed request — at top level (`resolve<Promise<T>>()` ≡ `resolveAsync<T>()` after the
  wrap) and mid-graph alike — which is delivery-mode decoupling: the fallback adapts
  async-registered → sync-wanting; the wrap adapts sync-registered → promise-wanting; a
  consumer's declared delivery mode is fully decoupled from the registration's actual mode.
- AN `AsyncPlan`'s INNER IS ITSELF A BOUNDARY: its inner is the `Promise<T>` candidate's
  site — promise-typed as-requested — so a new collection point opens beneath it
  automatically. The two kinds differ only in delivery: `PromisePlan` hands over the promise
  UNAWAITED; `AsyncPlan` is awaited by its enclosing `PromisePlan`'s hoist and delivers
  the settled value. Consequence: LAYERS DO NOT EXIST within a `PromisePlan` — they are
  nested `PromisePlan`s. A boundary's sites are mutually independent by construction, so no
  dependency edges and no topological ordering exist: the boundary realizes first, builds one
  entry per site (`realize(inner) → await`), gathers them with a flat `allSettled` inside its own
  wrapping promise, writes settled values into the context-borne map, and the plug walk beneath
  reads by site identity. Depth serializes through promise nesting; sibling entries and their
  nested gathers run concurrently.
- Hoist links are HARD, identity-keyed: a per-resolution `Map<AsyncPlan, …>` — no string
  labels, no parallel namespace. The map is CONTEXT-BORNE and therefore per-resolution by nature:
  the boundary's realize mints a fresh map and threads it through the realize context — the same
  channel that threads the scope model, delivered subtree-scoped. Keys are site nodes, never
  promises. OCCURRENCE IDENTITY is the invariant: two occurrences of the same async dep are two
  distinct node objects; if plan subtrees are ever shared, the wrapper is minted fresh per
  inclusion point while its inner points at the shared subtree.
- Gather semantics are container-level and uniform across every scope model: awaits live only in
  the gather, `allSettled`-shaped, failures thrown as one `AggregateError` deduped by reason
  identity.
- HIT-SKIPS: each `AsyncPlan` entry consults the scope for `T` before `realize(inner)`; a hit
  writes the map and prunes the entire inner boundary — the factory and its await are skipped.
  The sync/async distinction is decided by plan structure, never by cache state.
- THE SYNC DOOR HAS NO ASYNC FAILURE MODE: outside a boundary the fallback never fires, so a
  graph needing it just misses like any other unregistered dependency — an ordinary
  `UnsatisfiableError`, no async-specific taxonomy member. Plans are pure and cache-independent,
  so no cache state can make a sync plan exist for such a graph.
- NEAR-MISS DIAGNOSTICS: the promise fallback LOOKUP is ungated — on a final miss it runs in both
  modes, and only the consequence is mode-dependent: under a boundary a hit mints the async site;
  outside one a hit throws the ordinary `UnsatisfiableError` carrying async-hint data ("a
  `Promise<T>` registration exists — did you mean an async request?"). The throw happens at the
  exact failing dependency. Pins: the hint is data on the existing error (no new taxonomy
  member); the probe sits exactly where unresolvable would throw — last resort, after
  construct-on-miss/union/other candidates are exhausted. The hint is a pointer, not a success
  guarantee. The pattern generalizes as further near-miss data kinds on the same error
  (keyed-under-a-tag). One-directional by construction — async lookup is a superset of sync.
- PROMISE-HEADED GUARD: a final miss on a promise-headed type never runs the fallback probe —
  nested promise delivery is not a thing reality distinguishes — the failure is plain
  unresolvable in both modes.
- THENABLE REALITY: (1) element-settled invariant — the promise spelling normalizes a
  promise-headed element at mint (`Promise<Promise<X>>` mints the interned `Promise<X>`; the
  `named`-door canonicalization contract), so a nested promise node cannot exist; (2)
  assimilation is `await`'s job — awaited values are settled by JS semantics, the engine writes
  no unwrap of its own, gather entries await unconditionally, and no `instanceof Promise` exists
  anywhere (runtime branches use thenable-protocol checks); (3) the grammar stays nominal —
  `PromiseLike<X>`/custom thenable types are ordinary named types, assimilated by the gather when
  awaited, but excluded from the promise fallback probe (`Promise`-headed only).

## Aggregates

- ITERABLE VS ARRAY = WHEN THE SCOPE CACHE IS CONSULTED. `Array<T>` consults and fills at
  RESOLUTION — a snapshot, the engine doing `Array.from` for you; immediate full iteration of the
  iterable is element-wise identical. `Iterable<T>` consults PER ELEMENT at each iteration step —
  a live query: later steps see later scope state, transients are fresh per iteration,
  short-circuit skips construction, an unsatisfiable element throws from its step. Membership is
  plan-time in both; only realization moves into `next()` — live at the instance level, never the
  membership level. Re-iteration mints a FRESH walk per `Symbol.iterator`/`Symbol.asyncIterator`
  call — never a one-shot iterator object; a stable snapshot is spelled `Array<T>`.
- THE ELEMENT-UNIVERSE RULE (derived, not legislated): an aggregate SPREADS into one element-typed
  member site per candidate, each planned individually by the ordinary visitor — membership is
  per-candidate slot planning under standard arms, nothing aggregate-specific. Consequences: a
  promise-headed element (`Promise<T>[]`, `Iterable<Promise<T>>`) admits both `Promise<T>`
  registrations (exact) and sync `T` registrations (the wrap — sync-honest, so the whole spelling
  works through the sync door with no boundary); `resolveAsync`-side `AsyncIterable<T>` ≡
  `Iterable<Promise<T>>` in content, differing only in who awaits. A `T` element admits
  `Promise<T>` registrations only where the slot's context can await (inside a boundary, via the
  per-member fallback); outside one the empty-aggregate answer stands (`resolveMany` never throws
  on zero). The key behavioral pair: `AsyncIterable<T>` resolves services added via
  `add<Promise<T>>()`; sync `Iterable<T>` cannot (its steps run at user iteration time, no await
  structurally available).
- THE ASYNCITERABLE ARM: the fallback plans element sites per the element-universe rule, each
  element subtree under its own clean collection — PER-ELEMENT inventories. Realize is an async
  generator: each `next()` runs that element's flat gather, plugs the element, yields —
  pull-based and lazy (elements never iterated never resolve; no prefetch); an empty element set
  completes immediately; a step's gather failure throws from that `next()` as the reason-deduped
  `AggregateError`.
- KNOWN ENGINE DELTA: the live engine currently realizes `Iterable` and `Array` through identical
  logic — the consult-time split is unimplemented and must be addressed when the aggregate arms
  land.

## Latebound

- A latebound closure captures the SCOPE MODEL in effect at its mint site and re-enters against
  it — captured-scope semantics by construction, since the scope model is the context. A model
  wanting reset-to-root or ambient binding controls what it forwards to latebound factories. The
  engine keeps only what is uniform: the re-entry path follows the declared return type (a
  promise-typed return re-enters through the one door with a promise-typed request, which IS a
  `PromisePlan` at the re-entry root). Hoisting stops at latebound boundaries — a latebound
  node is a leaf of the enclosing walk; its subtree's asyncness belongs to the future call.

## The scope model contract

- THE WHOLE PICTURE: the scope system is ONE CALLABLE riding the visitor context. At each
  site visit the engine calls it — `(site identity, address AS-REQUESTED,
  Registration | absent for engine-synthesized sites, factory)` — and it returns the
  instance/value. Hit-vs-make is INTERNAL: the engine always receives the value it uses, and a
  hit prunes the subtree simply because the factory was never invoked. The scope model also
  supplies the (possibly different) scope model governing ALL DESCENDANT visits — delivered with
  the factory invocation (descendants realize DURING the factory call). The scope model IS the
  context; no separate context token exists. The call is FLAT — no install/curry staging.
  Everything beyond this call surface plus the `createScope` requirement is scope-model-internal.
- The governing lifetime comes from the ANSWERING registration while the request key is the
  as-requested type — the join happens at plan time, so the scope model never sees the
  promise-typed address. It stores and returns awaited values only (async-blind by construction;
  for an in-flight make the returned "value" is the shared promise, consumed only by the gather).
  The PLAN memo keys on the interned request node alone — multi-registrations are disambiguated
  inside plan trees at construction, never by the plan key. How a scope model keys its instance
  storage is its own business.
- ENGINE GUARANTEES: one call per LIVE site; deterministic pre-order; site identity in the call;
  faithful subtree-scoped delivery of the descendant scope model — per-subtree, by argument
  through the recursive walk, never global. The only thing foreclosed is observing sites pruned
  by an ancestor hit — inherent to caching.
- VALUE SITES BYPASS THE SCOPE MODEL ENTIRELY: a value registration presents no make, and makes are
  the scope model's whole jurisdiction — `asValue` registrations, latebound call args, and
  invocation-frame args are never asked, stored, tracked, or disposed by any scope model; realize
  reads the payload straight from the registration, and ownership stays with whoever supplied the
  value. REGISTRATION-LESS engine-synthesized sites (invocation frames, construct-on-miss) are
  likewise outside the datum domain — the engine controls their per-call freshness directly,
  under every model; their results are caller-owned.
- Because the scope model performs every make, it OBSERVES every instance by construction; only
  the bypassed sites above fall outside its view, and those are caller-owned.

## Lifetime data

- The lifetime datum on a registration is OPAQUE to the engine at runtime — pure data riding
  registration and plan, interpreted only by the installed scope model.
- At the TYPE level the datum is the scope engine's declaration: the Scopes generic can be TRULY
  ANYTHING — a string union, a structured node type, even a lambda type for per-registration
  custom behavior (behavior-as-data, same precedent as factory impls on registrations).
- BECAUSE the scope model dictates that generic, manifest factories come OFF THE SCOPE ENGINE —
  the engine choice precedes manifest creation and dictates how the manifest is made; the
  parameter cascades unhindered (engine → manifest → provider). No ad-hoc generic threading. The
  specific entry-point shape (e.g. a di-builder fluent API) is an open design slot.
- `undefined` IS A KEY LIKE ANY OTHER, BOUND BY THE SCOPE MODEL: the whole datum domain,
  `undefined` included, is keys into the installed model's behavior — swap the model in one line
  and every registration's behavior changes, omissions included; IoC applied to the container
  itself. Riders: the DEFAULT model binds `undefined` → transient, FROZEN AT BIRTH; birth-frozen
  generalizes as a model-author convention (a published model's `undefined`-binding is immutable
  post-birth, so omission's meaning never changes except by the user's own deliberate engine
  swap). The user-facing always-create escape is a default-model property; a swapped model may
  foreclose it as its own deliberate design.
- ADMISSIBILITY IS TYPE-ONLY: whether `undefined` is accepted is the scope model's own choice,
  expressed as assignability — `undefined extends TLifetime` ⇔ omission compiles (the declared
  type can be any shape; assignability, not literal union membership). The rule covers both
  dialects: positionally via argument optionality, and in the builder form completion is
  reachable only through `withLifetime` when `undefined` is not assignable (the established
  stage-gating pattern, conditioned on `TLifetime`). NO registration-time datum inspection exists
  anywhere — no admissibility flag, no `=== undefined` test, no truthiness test; at registration
  `undefined` is just another value on the one shared path. An out-of-union datum from untyped
  code reaches the scope model as an unknown key, whose handling is the model's own binding
  decision.
- Nobody but the scope model interprets ANY datum: the resolution engine inspects none of it;
  diagnostics prints without interpreting.

## Library portability

- A library PUBLISHES the scope-model shape(s) it supports in its configure function's own
  signature (`Manifest<DefaultLifetime>`, or a generic constraint over what its registrations
  need) — incompatibility is a LOUD compile error at the configure call, never a silently-wrong
  lifetime. No engine-space lingua-franca vocabulary exists (the model's total ownership of the
  datum domain stays whole); the default model is the de facto standard organically because libs
  target it, and an app on an exotic engine knowingly accepts lib-compat friction. Companion
  convention: library augmentations are written `this: Manifest<L>` with a per-function generic,
  never `Manifest<any>`.
- Boundary translation (formalization deferred): build the lib's registrations into a throwaway
  manifest typed for the lib's model, map each registration's lifetime through a translation fn
  (new registration objects; every non-datum field spread through), and feed the result to the app
  manifest via the `add(Iterable<Registration>)` overload. The translation layer handles
  flat registration sets only.

## Scope creation

- Creation is RESOLUTION-DRIVEN: the scope model is REQUIRED to register a `createScope` service
  — the user's entrypoint into opening scopes, itself returning a scope-model-backed provider.
  Its typed shape: the uniform well-known address is `ScopeFactory<TLifetime>`, typed by the ONE
  cascading Scopes generic — creation args and lifetime data draw from one vocabulary (what you
  pass at creation is what registrations reference to match it). The address is a CALLABLE
  interface — a bare call signature taking `LifetimeArgument<TLifetime>` and returning the
  provider — so the resolved value IS the creation verb, and omission at creation compiles under
  the same admissibility rule as registration; a model implements it as a registered factory
  whose own signature lists its deps. Creation-only config that is not
  lifetime vocabulary is model-side: a model registers its own richer factory type beside the
  well-known address (per-model `Func` spellings stay legal); `TLifetime` never carries values no
  registration may hold.
- CONVENIENCE MEMBER: `sp.createScope<T>()` — a generic method whose `T` is CONSTRAINED by the
  sp's own Scopes generic, forwarding to a correctly-populated `sp.resolve<ScopeFactory<T>>()`;
  pure forwarding sugar (the `resolveAsync` pattern), giving users a typed, discoverable creation
  entrypoint. It lives on the ENGINE-TYPED provider surface only — primitives' universal
  `IServiceProvider` stays generic-free.
- The sole structural exception to resolution-driven creation is the GENESIS: the root scope
  model is handed to the provider at build. Installing a scope model = its door + its genesis +
  its registrations; swapping models is swapping registrations.
- Parenting falls out of resolution ancestry: the asking context (as forwarded) is the natural
  parent, and the factory registration's own lifetime selects the parenting policy — a scoped
  factory yields children of the asker; a singleton factory realizes under root context and
  yields children of root.
- PER-SCOPE CONTEXT is model/userland territory, not a contract capability: scoped lifetime
  already means one-per-scope, so a scoped holder populated after creation serves the use case.

## Disposal

- Disposal BEHAVIOR is scope-model policy — timing, ordering, cascade rules, partial-failure
  handling. Disposal never touches the plan layer.
- Engine-side, three pieces: (1) THE CONTRACT — what a disposable scope is
  (`Symbol.dispose`/`Symbol.asyncDispose` protocols, the `disposeAsync` shape) and what disposal
  guarantees: every tracked instance released per its release vocabulary, failures AGGREGATED
  (never abort-on-first), a disposed scope answering loudly. Uniform obligations, model-owned
  execution. (2) THE PER-REGISTRATION DISPOSAL VOCABULARY — release override (e.g. return-to-pool)
  and external-ownership opt-out, as pure data with ENGINE-defined meaning honored by every
  model. (3) OBSERVATION — the model performs every make, so its disposal knowledge is total by
  construction; no separate fact feed exists.
- The scope model has every tool the hard cases need — it observes every make, owns the settle
  path of every promise it built, owns its own disposal members, and holds the release vocabulary
  in every call. A value settling after dispose, construct-on-miss disposables (caller-owned by
  the value-site rule), root-transient tracking, and a throwing model's unwind are all
  implementable model policy; none is contract.
- Design checklist for the default model's disposal lane: per-registration disposer; teardown in
  reverse dependency order including on partial-init failure; release seeing the outcome for
  rollback semantics; consumer-owned early release; external-ownership opt-out; release override.

## Captivity

- The ENGINE's structural guarantee is exactly one thing: faithful subtree delivery of whatever
  context the scope model forwarded. Under the DEFAULT model's forwarding policy (a singleton
  site forwards root), the classic stale-capture harm cannot occur — a singleton's dependencies
  never come from a shorter-lived scope. An arbitrary model forwards whatever it chooses and OWNS
  its resulting captivity story; only it knows what its keys mean, so only it can define a
  violation — any captive lint is therefore necessarily model-shipped and
  composition-root-invoked with the manifest the root already holds. The model never receives the
  manifest; its job stays resolution-time. No such lint is planned or ordered.

## Engine hardening

- Registrations are `Object.freeze`d at manifest build — metadata-never-holds-state is
  runtime-enforced.
- A disposed latch on the engine-minted root provider — resolution after root disposal fails
  loudly at the engine door.
- An attribution wrap around scope-model calls: a throw mid-resolution surfaces as
  `ScopeModelError` naming the failing site, cause inside.

## Concurrency

- Single-flighting concurrent async makes is implementable as pure scope-model policy with tools
  the contract already grants: the same `(type, registration)` identity arrives in both walks'
  calls; hit-vs-make is internal, and an in-flight make's returned "value" is legally the shared
  promise; run-to-completion makes the check-and-insert atomic; the model owns the settle path
  for store/evict-on-reject. Engine-side coherence: the second walk's subtree never runs
  (in-flight generalizes hit-pruning), and a shared rejection lands in each walk's own deduped
  `AggregateError`. Scope attribution and ambience are likewise model-implementable
  (retrospective via a model-kept `WeakMap<instance, box>` behind a registered inspector service;
  mid-construction via the model wrapping its own factory invocations in its own ambient frame —
  the model, not the engine, invokes factories). No engine involvement in any of it.

## Coverage and extensibility

- Verified against the autofac lifetime catalog: the contract expresses the entire catalog — call
  surface (per-dependency/singleton/scoped/matching/per-request/custom/graph-shape),
  model-shipped registrations (`createScope` with tag args; `Owned<$T>` as an open registration),
  registration vocabulary (owns-what-it-creates, external-ownership, release override) — and is
  strictly stronger twice: canonical-by-return grants instance substitution/wrapping without a
  pipeline, and sharing policy itself is model-territory. Exclusions, both deliberate: parameter
  mutation (activation-pipeline, not lifetime; factory territory here), and per-scope
  registrations (`BeginLifetimeScope(builder =>)`) — per-scope context is model/userland
  territory (the scoped-holder pattern serves the use case).
- NO middleware/interception chain, in the engine or the scope system. Every surveyed middleware
  use-case decomposes into: factories, plan-time composition, registration data, the scope-model
  call, or a read-only observer seam. Purpose-built seams ship on NAMED demand.
- Joints vs surfaces discipline: architectural joints are reserved before freeze; additive
  surfaces ship on demand. The named extension points the coverage verdict is conditional on: the
  scope-model call; manifest-as-data + registration verbs; latebound re-entry; construct-on-miss;
  open (`$T`) registrations; the augmentation registry; the disposal vocabulary.

## Invocation coupling

Value-driven invocation is the `resolve` value overload; it consumes this design as its first
client:

- Its synthesized frame is REGISTRATION-LESS at the scope-model boundary — per-call freshness under
  every model, no special case. Dependency arguments beneath the frame flow through normal
  caching.
- Results are CALLER-OWNED: never in an instance cache, never disposal-tracked.
- The frame's ROOT plan bypasses the plan memo unconditionally: structural interning aliases
  distinct function values onto one node, and the frame plan is one node deep — all depth lives
  in the arg subtrees, which memoize normally as interned requests.
- The `additionalRegistrations` layer resolving newest-first is LOAD-BEARING for invocation: the
  synthesized frame registration must win over any structurally-identical manifest registration.

## Latebound arg binding — saved plan (SEPARATE work item)

Replace value-registration layering for latebound call args with PLAN-TIME ARG BINDING: when
planning the latebound subtree, every slot checks the `Func` type's args row FIRST (preserving
args-outrank-the-manifest, statically); a match compiles to an `ArgPlan(index)` — a
value-site kind, structurally outside the scope model. At call time the closure realizes its plan
with the caller's values riding the realize context (`ctx.args[index]`). The plan lives in the
PROVIDER's plan memo keyed on the interned `Func` type (pure function of manifest + type; the
return type alone sets the re-entry root), shared across all latebound sites and ad-hoc requests
of the same type; population stays LAZY at first call (the cycle-breaking deferral). Semantics
unchanged: type-keyed binding, args beat registrations, one value serves same-typed slots.
`additionalRegistrations` then has one consumer: invocation frames. Not part of the current lane —
executed separately.

## Priority inputs (measured engine state)

Scope creation is the critical path (`createScope` throwing accounts for 56 of the 88 known-red
tests; those tests exercise the placeholder surface and rewrite to this design); the
dispose/disposeAsync stubs account for 23 more; singleton instance identity is not honored at all
today (the instance layer is entirely greenfield). Downstream consumers gated only on this
design: `validateOnStart` and the per-provider logging-config reload test.

## Open slots (deferred by ruling, not pending)

The composition entry-point spelling (di-builder vs plain function); validation issues (including
whether provider build asserts the required `createScope` registration — punted); scope-model
internals (the addendum below); the saved latebound arg-binding plan above.

---

## ADDENDUM — scope-model-internal proposals (NOT contract)

Parked design material for the default scope model's own lane. Nothing here binds any model; the
contract above is complete without it.

- **Default lifetime vocabulary**: a small interned kind-tagged union — `undefined` (transient) |
  `singleton` | `scoped` | `matching(tag)` — strategy and parameter as separate fields, so the
  tag namespace holds only user tags, no reserved values. The string model (user-vocabulary tags
  with no implicit meaning, scope lifetime bound to the holding variable via the `using`
  protocol) is a sibling candidate model; root-pinning and ask-scope caching are its own
  interpretation choices.
- **Instance cache key**: `(site's as-requested type, answering registration)` — the registration
  half makes the unit of "single" the registration-within-a-scope, letting resolve-one and
  resolve-all share storage while same-type multi-registrations stay distinct; identity, not
  ordinals. Registration-less synthesized sites never cache — no registration, no datum, nothing to
  instruct caching.
- **Adopt-or-store write-back**: re-check the cache after promise resolution — atomic because the
  post-await re-check-and-store runs synchronously in one continuation. First store wins; a
  losing walk releases its own instance through the disposal vocabulary and adopts the winner;
  the write-back returns the canonical value. IDENTITY NO-OP PIN: `existing === value` returns
  existing and releases nothing — a factory sharing its in-flight promise delivers the same
  instance to every walk. Resulting guarantee: at most one instance ever OBSERVED; under
  concurrent first-resolution, extra instances may be transiently constructed and immediately
  released — effects that disposal cannot reverse are the factory's to guard.
- **In-flight single-flight map**: `getOrInsertComputed` on an ephemeral `Map<key, Promise>` —
  the first caller's factory runs, later concurrent callers receive the same promise; the entry
  dies on settle or rejection (`finally`-evict, so failures never cache and retry works). The
  value cache stays settled-values-only; the in-flight map is coordination state, not a cache.
  One construction per key per scope.
- **Effectful-factory ladder** (for models without single-flight): reversible effects are covered
  by release-on-adopt; irreversible + singleton — the factory single-flights itself by sharing
  its in-flight promise (respected by the identity no-op); irreversible + scoped — closure state
  is per-registration, so userland single-flight is wrong there; a construction-economy answer arm
  remains an additive contract extension if a model ever names the demand.
- **Attribution / ambience patterns**: retrospective instance→scope via `WeakMap` behind a
  registered inspector service; mid-construction `currentScope()` via the model wrapping its own
  factory invocations in its own `AsyncLocalStorage` frame (`run`, never `enterWith`).
- **Captive intent lint** (placement-if-ever; none planned): a model with ordered lifetime
  vocabulary can ship `validate(manifest)` walking registrations (types, args rows, datums) with
  its own ordering, invoked by the composition root.
- **Web Locks note**: `navigator.locks` (Node ≥22.5; absent in Bun) is the wrong tool for
  in-agent dedup (async grant latency, string names, serialize-then-recheck); its niche is
  cross-agent external-effect exclusion INSIDE user factories.
