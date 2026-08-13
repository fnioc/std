# di2 scope & async requirements — TEMPORARY

> Working capture of the 2026-08-13 scope/async design session, maintained as the session runs.
> Requirements only — no implementation plan. Untagged entries are owner-ruled in conversation;
> **(proposed)** entries are Claude's, shown to the owner and not overruled; **OPEN** marks
> decisions still pending the owner. Companion to `di2.requirements.md` (the taxonomy/dialect
> capture) and `di2.scope-notes.md` (scope research inputs). Delete once the rulings land in the
> decision records and code.

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
  itself to its value/promise (`Map<AsyncSite, …>`). No string labels, no parallel namespace.
- The invariant this rests on: OCCURRENCE IDENTITY — two occurrences of the same async dep are two
  distinct node objects. Plans built by walking give this naturally; if plan subtrees are ever
  shared, the async-site wrapper is minted fresh per inclusion point (wrapper identity ≡ occurrence
  identity) while its inner points at the shared subtree. **(proposed)**
- NO ASYNC KIND EXISTS IN THE TYPE GRAMMAR (owner-ruled 2026-08-13, via team-lead; extended same
  day to AsyncIterable): "T delivered later" is spelled by the ordinary global generic `Promise`
  node, and AsyncIterable factors into async delivery (call-site) × iterable resolution (grammar —
  `Type.iterable`/`Type.array` remain the collection doors, unchanged). Async is PURELY CALL-SITE
  behavior: async resolution rules activate on the TOP-LEVEL requested shape, and the async
  call-site recognizes TWO of them — `Type.global('Promise', [X])` (X delivered later, single) and
  `Type.global('AsyncIterable', [E])` (the E collection streamed per-item over the SAME iterable
  resolution the sync path uses). `getServiceAsync(t)` is terseness only — it wraps the request in
  a Promise node and forwards through the one door (the `getServices` forwarding pattern). The
  async call-site node's shape is this session's design deliverable.
- The compositions stay distinct and both remain expressible: `Promise<Iterable<E>>` = the whole
  collection delivered later, then sync iteration; `AsyncIterable<E>` = per-item streaming, each
  element resolving at iteration time.
- Top-level async-shape request: lookup answers first — a literal registration under the requested
  node wins like any other; on a miss, async activation applies. Uniform lookup-then-activate; a
  non-top-level dep literally typed `Promise<T>` stays an ordinary lookup. **(proposed)**
- Asyncness is otherwise a MANIFEST fact, compiled away at plan time: the plan-construction walk
  discovers it (dep wants `A`, the promise-typed registration answers) and mints the site. The
  plan's async-site inventory is pure manifest+request structure.
- The hoist is a PER-RESOLUTION, HIT-PRUNED, CONTEXT-THREADED tree walk — never a flat sweep over
  the inventory. An ancestor hit prunes its descendant async sites (their values live inside the
  cached instance); an ancestor miss shifts their context. The flat inventory survives only as an
  upper-bound index ("does this plan contain async at all" — the cheap skip for fully-sync graphs).
- Static inventory vs dynamic effective set: each resolution filters the plan's inventory through
  the asking scope; the sync entrypoint is the case where the effective set filters to empty. A
  fully-cached async graph resolves through the sync door.
- Plan memoization records instructions only — the callee reference and the argument wiring, never
  a return value. Plans hold no instances; results live only behind the scope door.

## The scope door

- The scope system is a BLACKBOX behind ONE door. The engine holds an opaque `ScopeCtx` token it
  received from the scope system and never inspects it — no chain walking, no tag reading, no
  scope selection engine-side.
- The ask carries `(site identity, requested type AS-REQUESTED, lifetime datum, ctx)`. The
  governing lifetime comes from the ANSWERING descriptor while the cache key is the as-requested
  type — that join happens at plan time, so the door never sees the promise-typed address. The
  blackbox is async-blind by construction: it stores and returns awaited values only.
- Answer vocabulary: `hit(value)` | `miss(forward: ScopeCtx)`. A hit carries no ctx — nothing
  beneath it ever runs. A candidate third arm — an outstanding-make handle ("a make for this key is
  in progress under this scope") — is the race question's home; its vocabulary stays
  async-agnostic. **OPEN** (arm's existence = the race ruling).
- Door shape — two-step probe vs single-step `getOrCreate(key, lifetime, ctx, factory)` — is
  **OPEN**; both shapes must deliver the forward ctx on the miss arm (as the factory's argument in
  the single-step form).
- Engine guarantees to the door: one ask per LIVE site; deterministic pre-order; faithful
  subtree-scoped delivery of whatever `forward` the door returns; resolution boundaries visible (an
  entry ask). The threaded ctx is a delivery channel the blackbox may use or ignore (ambient
  models keep their own state). The only thing foreclosed is observing sites pruned by an ancestor
  hit — inherent to caching, not to threading. **(proposed)**
- Context shift: a miss's forward ctx applies to the whole dependency subtree of the matched site,
  delivered by argument through the recursive walk — per-subtree, immutable, never global. A
  singleton match shifts its subtree to root context; a transient answer forwards ctx unchanged.
- Mechanism/policy line: the blackbox decides WHETHER each site produces work and WHERE results
  land; the engine decides how outstanding work is scheduled, awaited, and aggregated. Gather
  semantics are container-level and uniform across every scope model: awaits live only in the
  gather, `allSettled`-shaped, failures thrown as one `AggregateError` deduped by reason identity,
  sync-door-throws rule. **(proposed)**
- Latebound re-entry binding is DELEGATED to the blackbox: a mint-time arm
  (`bindLatebound(site, ctx) → () => ScopeCtx`); the closure stores the thunk, the call re-enters
  with whatever it yields. Captured vs reset-to-root vs ambient becomes default-model policy, not
  an engine ruling. The engine keeps only what is uniform: the re-entry path follows the declared
  return type. **(proposed)**

## Lifetime data

- The lifetime datum on a descriptor is OPAQUE to the engine — pure data riding descriptor and
  plan, interpreted only by the installed scope model's door. Forced by the models below
  coexisting: one model's datum is a meaning-free user string, another's a structured node; the
  engine cannot fix either.
- No `Scopes extends string` generic threading through the manifest surface — typo-safety comes
  from the model's own factories, not a viral type parameter.
- The default model's vocabulary: a small interned kind-tagged union — `undefined` (transient) |
  `singleton` | `scoped` | `matching(tag)` — strategy and parameter as separate fields, so the tag
  namespace holds only user tags, no reserved values. **(proposed)**
- The STRING MODEL is a named candidate scope model, not a top-level requirement: user-vocabulary
  tags with no implicit meaning, scope lifetime bound to the holding variable (`using`-protocol
  support in the disposal design is its consumer). Root-pinning and ask-scope caching, if that
  model wants them, are its own interpretation choices.
- Transient — the ABSENCE of a lifetime datum — is the first-class always-create: the door never
  caches, the hit-prune/store machinery never engages, per-occurrence semantics hold. Not a mode
  bolted onto any feature; the default.

## Scope creation

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

## Write-back and the race

- Post-gather values must be ADMITTABLE into the scope under cacheable lifetimes — forced by
  hit-skips + values-as-requested + the sync-door corollary: hits can only exist if async-created
  values were stored earlier. Caches store awaited VALUES, as-requested, never promises; a hit
  skips the factory and the await entirely.
- The concurrent-miss race (check → await → store is not atomic; two concurrent walks both miss the
  same cacheable async site and double-instantiate) needs an ANSWER or an explicit "accepted" —
  **OPEN**. Promise-holding CACHES are overruled; an ephemeral scope-internal in-flight registry
  (dies on settle, distinct from the value cache) is not, and the door's outstanding-make arm is
  its natural surface.

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

1. Door shape: two-step probe vs single-step `getOrCreate`.
2. The concurrent-miss race: outstanding-make arm / in-flight registry / explicit "accepted".
3. Scope-creation args: per-model `Func` types vs uniform `ScopeFactory` + merged options type.
4. Which taxonomy error the sync door throws on a surviving async site.
5. Async fallback-chain details: dep wants `E` with only `Promise<E>` registered (the plan-time
   promise-fallback arm's exact placement); the AsyncIterable call-site arm (per-item streaming
   over the sync path's iterable resolution, outside the gather); the async call-site node's
   designed shape.
6. Captive-dependency validation: the lifetime-ordering declaration hook in the scope contract.
7. Disposal design proper (contract + default model), including `using`-protocol support.
8. ManifestScope dialect (spelling of private registration; deep-override verb naming) and the
   root-authority override surface.
9. The user-facing memoization opt-out surface for invocation (per-call freshness selection —
   this session's design deliverable per the invoke lane).
