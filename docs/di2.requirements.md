# di2 design requirements — TEMPORARY

> Working capture of the owner's rulings from the 2026-08-12 design session. Requirements only —
> no implementation plan. Gospel entries ground the non-negotiables (U1, U2 in
> `decisions.user.md`); everything else here is owner-ruled in conversation and pending its
> decision entry. Delete this file once the rulings land in the decision records and code.

## Marker grammar (`"rhombus-std".inline`)

- The package.json marker key is `"rhombus-std": { "inline": [...] }` — the entry array sits
  directly under `inline`.
- **Go is 100% agnostic of inlinables — everything is driven from the JSON (U2).** No name
  tables, no per-sugar lists, no special-cased identifiers in engine code or engine-built
  registries.
- Entries deserialize into REAL typed structures, strictly. Every declaration-reference field
  parses through the one Type grammar. Missing, unqualified, or unparseable references are
  loud load-time errors — never permissive skips, never raw strings threaded past
  deserialization.
- Three entry shapes, partitioned by field kind — `type` names a TYPE, `impl` names a VALUE:
  1. Instance member: `{ type, member, impl? }` — `type` is the receiver type; `impl` is
     present exactly when the member's declaration is ambient (the body lives in the value's
     `member`-named property).
  2. Static / namespace / const member (one shape — they are the same thing):
     `{ impl, member }` — no `type`; the value is both the call-base anchor and the body
     holder. Grammar-valid; matching is not yet certified.
  3. Floater: `{ impl }` — the function value's own source is the body.
- `type` must deserialize to identifier-kind — a signature-shaped type in that field is a loud
  error.
- `impl` is fully qualified and must self-reference its declaring package (the side-parse
  boundary); violation is a loud validation error.
- An entry whose declaration has a body takes no `impl` — the declaration's source is the body.
- Runtime imports for a substituted body come from the body file's own imports
  (import-following), never from the entry.
- A grammar-valid shape with no certified matcher fails loudly (uncertified-kind diagnostic),
  never silently.

## Inline engine

- A free identifier in a sugar body is legal exactly when the authoring file imports it — a
  named, non-type-only binding from a bare package specifier. The consumer receives that same
  `(module, export)`, spelled as the consumer's own binding. An imported binding is BARE-ONLY:
  it never heads a dotted call in a body — closed permanently (owner, 2026-08-13), not parked.
- Substituted output equals what a no-transformer author writes by hand — byte parity.
- Member-body substitution rewrites `this` to the receiver expression, respecting function
  boundaries: rewritten in the body and in nested arrows; never inside a nested `function` or
  class with its own `this`.
- Impl parameters align 1:1 with call-site arguments — no receiver offset, no
  receiver-param discrimination.
- The unlowered-sugar sweep anchors on the marker's declaring package, never on spelling alone
  — a same-named export from any other package is a different function.
- Project-level inertness is loud; only per-program absence is designed silence.

## Augmentation runtime

- Augmentation impl members are `this`-based methods — the EXACT code that lands on the
  prototype.
- Install is verbatim assignment: `proto[name] = fn`. No wrapper, no adapter, no rewrite upon
  application.
- Function identity therefore holds: the installed member IS the authored member. Re-install
  of the identical function is distinguishable from a true collision.
- Set types provide contextual `this` typing so members need no per-member annotation — with
  the known exception that contextual `this` does not propagate through a member's own generic
  type parameters; such members carry an explicit `this:` parameter.
- Standalone-only functions that are deliberately not prototype members stay receiver-first.
- Collision semantics are unchanged: a taken name with no merge strategy throws at install; a
  strategy installs a dispatcher; dispatchers receive the incoming member via `.call(this, …)`.
- The augmentation inventory is discovered via `registerAugmentations` call sites PLUS sets
  typed against the augmentation-set types with no register call — both are augmentations.

## Type taxonomy

- One flat node space, one public parent: `Type`. No descriptor union, no overlapping door
  unions.
- `TypeIdentifier = NamedType | PlaceholderType | TagType` — the ADDRESS-ONLY kinds: a pure
  reference can never self-construct.
- Every Type can be an ADDRESS: interning makes any node registrable and resolvable by `===` —
  a ServiceDescriptor may link absolutely any Type to an implementation.
- Every non-identifier Type can also be a SPEC — self-construct when no registration answers.
  The capability lives in the usage and the registry, never as dual identity of the node.
- `TagType = { type: Type, tag: string }` — the inner is unconstrained (a keyed function-typed
  service is spellable). A tag itself is address-only regardless of inner: keying is
  registration intent, so an unregistered keyed request fails rather than constructs.
- `TypeLiteralType` is a self-supplying leaf; it names nothing.
- Capability questions (`identifier`, `open`) are answered by MEMOIZED ANALYZERS — computed on
  first ask per unique node by walking the node itself, cached in a WeakMap that lives INSIDE
  the analyzer (single-consumer state): its only writer is the walk that derived the answer
  from the described object, and interned frozen identity makes the cache exact forever.
  Owner-ruled 2026-08-13: no side-table describes a node without that provenance guarantee;
  nodes stay pure data — capability never becomes a member on the node.
- THE MATCH WALK COLLECTS ITS OWN PLACEHOLDERS (owner's original design, restored): the walk
  visits every placeholder position anyway, and the very next step — instantiation — needs
  exactly that collection, so the bindings ARE the placeholder inventory; no pre-scan runs
  inside the match path. The memoized analyzers serve only the genuine standalone gates:
  partitioning registrations closed-vs-open at the registry (closed answers by `===` alone and
  never enters matching), the augmentation receiver door, and marker validation.
  The intern table itself stays pure identity: it learns no type-theory questions, and no
  mint-order invariant is load-bearing. Steady-state predicates are O(1); the partition is
  VOCABULARY, never a dispatch axis.
- `TokenType` and `ConstructableType` are deleted. Types are interned; `===` is equality;
  `Type.from` only at data-input boundaries.

## Container door semantics

- One entrypoint: `getService(request: Type)`. Resolution is LOOKUP, THEN CONSTRUCT ON MISS:
  the lookup answers for any Type at all; on a miss, a request that can self-describe is
  constructed by composing looked-up leaves; a pure reference on a miss fails.
- Requesting an UNREGISTERED constructor is construct-on-miss of a CtorType: di instantiates
  it, resolving its parameter types through the lookup. The injection signature must be
  DESCRIBED in the request — there is no runtime reflection.
- THE CACHING MODEL IS THREE MEMO LAYERS, one per lifetime, and nothing else:
  1. TYPES are memoized globally — interning; `===` identity; immortal.
  2. PLANS are memoized per provider — keyed on the interned request, dying with the provider;
     conditioned on the purity audit (plan construction is a pure function of the request node
     and the provider's fixed descriptor set, reading no runtime state). Failed constructions
     are not cached — determinism makes rebuild-and-rethrow identical.
  3. INSTANCES are cached per scope, internally — `realize` interprets a plan's lifetime data
     against the asking scope; scopes own their instance caches outright.
     Every visitor serves the making of a Type or a plan, so those two memo layers absorb all
     resolution-path caching; the standalone analyzers' memos serve build/registration-time gates
     only. Plans hold no instances and scopes hold no plans — the layers meet only at `realize`. Resolve-one and resolve-all must share instance
     caches — a scoped or singleton instance never double-instantiates via the enumerable path.
- METADATA NEVER HOLDS STATE: descriptors and plans stay pure; instances live only in
  scope-owned caches keyed by the interned request.
- The scope model adopts NOTHING from prior art without its own justification, case by case.

## Descriptor impl description (ruled 2026-08-13)

- Sugar declarations ENFORCE impl-produces-address at compile time: `addClass<T>(ctor:
  Ctor<any[], T>)`, `addValue<T>(value: T)` — the sealed declarations carry the constraint. The
  di.core/di.extras same-name double-merge fix rides with this (the generic forms must be
  reachable from consumer programs).
- The descriptor's impl description is one composed node: sugar derives the exact impl type by
  transform (as signatures are derived); the explicit API is UNCHANGED — the registration verb
  composes the node internally from the provided signatures, with the ADDRESS standing in the
  instance slot. That stand-in is honest: "a constructable producing the addressed type" is the
  strongest guarantee the container ever holds for an explicit registration. Plan construction
  consumes only the args and the door; one plan-builder contract serves registered and
  construct-on-miss paths alike. Built when that unified plan-builder is built — not before.

## Type spelling & the registration dialect (ruled 2026-08-13)

- NO TypeBuilder — neither general-purpose nor as manifest stages.
- CONFIRMED renames (owner-worded): `placeholder` → `generic` (node `GenericType`, kind
  `'generic'`); `FunctionType` → `FuncType` (pairing with `func`).
- The multi-field factories (`named`, `ctor`, `func`, `tag`) gain OBJECT-PARAMETER overloads
  whose keys are the node's own published fields (`{ name, from?, genericArgs? }`, …) — one
  vocabulary, labeled at every nesting level, defaults skippable independently. Positional
  forms remain for flat use; the homogeneous-list factories (`union`/`intersection`/`tuple`)
  stay positional-rest only.
- Registration NEVER requires the impl instance's own type: a provided ctor's instance
  `NamedType` is data the container has no use for — the address is what consumers resolve by,
  assignability is compile-time-enforced by the sugar constraints, and the composed
  described-constructable carries the ADDRESS in its instance slot. Users supply argument
  types only.
- The verb is `withSignature` (owner delegated the choice; `using-` was the one odd prefix and
  dies with it): SINGULAR and variadic — `withSignature(...paramTypes)`, exactly once. A
  multi-signature (overloaded) impl is expressed through `withType` with an intersection of
  constructables — the composed node is where plurality lives, not the verb.
- Verb naming is case-by-case; prefix uniformity is NOT a goal (owner-ruled). `taggedAs`
  stands — the one address-rewriting verb looks different because it is different.
- EVERY builder-carrying API also offers an overload taking EVERYTHING at once, positionally
  (ruled 2026-08-13). The positional variant takes an `implType` (one composed constructable
  node) and NEVER naked signatures — the signatures-as-arrays spelling lives only in the
  builder's `withSignature`; supporting both spellings positionally is not worth the surface.
  Hand-composers of a positional `implType` put the ADDRESS in the instance slot (the
  documented convention — it is the strongest claim the container holds anyway); sugar derives
  the precise node. Builders read as fluent English; the positional twin is the terse complete
  form.
- The builder form is HAND-USABLE (ruled 2026-08-13): `add(type, configure)` — the address as
  the first positional argument, the builder lambda second. The sugar form `add<T>(configure)`
  is exactly that overload with the first argument derived and deleted — the inline body is a
  one-argument forward, the parity invariant is trivially visible, and builder ergonomics are
  never transformer-exclusive.
- THE BUILDER IS GENERIC (ruled 2026-08-13): the stages carry the service type `T`, and every
  impl door enforces extension — `asClass(ctor: Ctor<any[], T>)`, `asFactory(fn: Func<any[],
  T>)`, `asValue(value: T)` — the ruling-4 constraint threaded through the builder path, not
  only the flat verbs. RESOLVED (owner, 2026-08-13): `T` defaults to `any` —
  `add<T = any>(type, configure)`. Sugar derives `T` precisely; a hand-roller may spell it
  (`add<IRepo>(…)`) and get full enforcement; a hand-roller who omits it gets `<any>` and no
  enforcement — opt-in safety, consequences owned, no Type-surface change, no phantom.

- The configure dialect offers `withType` AND `withSignature` after the `as`-verb, EXACTLY ONE
  of which must be used (stage types make `IComplete` reachable only through one of them, once;
  a runtime guard backs the untyped caller). `withSignature(args)` supplies argument types only
  — the described constructable composes internally with the ADDRESS in the instance slot.
  `withType(node)` supplies the whole composed constructable, typed per `as`-verb (`CtorType`
  for `asClass`, `FunctionType` for `asFactory`); sugar substitutes `withType` with the
  transform-derived precise node, hand-writers reach for `withSignature`. Deep signatures
  remain irreducibly deep — the object-overload factories and named intermediate consts are
  the spelling relief, not the dialect.

## Aggregates (ruled 2026-08-13)

- Three aggregate factories: `Type.array`, `Type.asyncIterable`, `Type.iterable` — each minting
  its OWN node kind (`ArrayType`, `AsyncIterableType`, `IterableType`, single `element` child;
  ruled 2026-08-13). The aggregate names join the parser's one reserved-name mechanism beside
  `Func`/`Ctor`/`ServiceProvider`; the engine dispatches on kind. This dissolves the
  engine-side reserved-name list, the "NamedType is address-only except three names" asterisk,
  and the pairing-rule scoping clause — fewer distinct mechanisms, more uniform arms. The
  engine-pre-registration reframe is struck as no longer needed.
- `AsyncType` joins the same pass (ruled 2026-08-13): kind `async`, factory `async(element)`
  (legal — `async` is only contextually reserved), wire spelling `Async<E>` in the reserved
  set. The node, factory, and parser arm land now; its ENGINE arm (async delivery of the
  element) lands with the parked async realize design, not before.
- NORMALIZATION LIVES IN THE `named` DOOR (no swap visitor): `named` with a reserved aggregate
  spelling (`'Iterable'`/`'Array'`/`'AsyncIterable'`/`'Async'`, `'global'`, one arg) silently
  returns the corresponding kind node — the same canonicalization contract `union` already has
  (a factory returns the canonical node for the spelling, whatever its kind). Every path that
  can spell an aggregate (parser, derivation-emitted code, hand composition, adoption)
  normalizes at mint, so the kind node is the ONE interned identity and a NamedType spelling of
  an aggregate can never exist. Signature principle (owner: "PERMISSIVE IN,
  EXPRESSIVE OUT"): as narrow as expressible per call — a literal reserved spelling types as
  its kind node, a non-reserved literal as `NamedType`, a dynamic string as the honest union,
  each as tight as TS can prove; the implementation signature may leave its return unannotated
  (the declared surface carries the narrowing — bare body inference would widen every call to
  the branch union, so the precision lives in overloads/conditionals, not the impl). The
  object-parameter overloads narrow the same way via literal property inference. Exact TS
  mechanics settle in-lane against real tsc feedback.
- An aggregate address's CONTRACT is the protocol alone (an Iterable / AsyncIterable / Array of
  every registration of the element). Binding is a property of the SYNTHESIZED descriptor-miss
  fallback only: the synthesized `array` materializes at resolution; the synthesized `iterable`
  and `asyncIterable` are late-bound, each element resolving at iteration time (sync/async). A
  registration answering at lookup under an aggregate address binds however its own descriptor
  binds — the engine imposes nothing on it.
- `getServices(type)` forwards to the iterable aggregate through the one resolution door and
  never throws or returns undefined for zero matches — the empty aggregate is the answer.
- A registration under an aggregate address answers at lookup before synthesis — uniform
  resolution, no reserved-name carve-out in the door, and NO warning machinery around it:
  shadowing an aggregate is legal and the consequences belong to the registrant.

## Options wiring (ruled 2026-08-13)

- `IOptions<T>` is served by ONE open registration in di — `IOptions<$T>` with a
  placeholder-parameterized impl, the same mechanism the open logger registration uses. No call
  site ever composes `IOptions<T>` as a spelled type: the sugar body registers the per-`T`
  pipeline pieces under bare `typefor<T>()`, the open registration's realize reads its bound
  placeholder, and a consumer's closed request (`typefor<IOptions<UserOptions>>()` at a call
  site) matches the open registration through the ordinary match walk.
- Consequence: the composed-generic derivation question dissolves — no engine grammar
  extension, no new derivation path — and the tokenfor/tokenof/nameoftransform trio retires
  once the addOptions body is rewritten to bare `typefor<T>()`. One premise to probe first:
  bare `typefor<T>()` deriving inside a substituted body (its sibling `tokenof<T>()` is
  witnessed working there).

## Closed by the 2026-08-13 collapse order

- SINGULAR IS DEAD (owner: "singular + the lookup thing are all dead"): sugar always asks the
  container; the isSingular/singularValue/valueof stubs, the Go singular/valueof/fold stages,
  and the short-circuit e2e all retire. Literal-typed requests are served by the describe door.
- Non-behavioral dialect calls made under delegation: `asValue`'s stage offers `taggedAs` and
  completion only; `withLifetime`/`taggedAs` commute.
- THE COLLAPSE ORDER (standing): branches merge and collapse toward main in whatever order is
  most natural and supports ASAP parallelism — lanes → feat-di2-core-gaps → #303 → #274 →
  main, each hop gate-verified.

## Open — pending the owner

- Singular short-circuit ruling (decides the `isSingular`/`singularValue`/`valueof` family).
- Composed-generic derivation for `typefor` in substituted bodies — prerequisite blocking the
  tokenfor/tokenof/nameof retirement.
- Static/namespace member matching; class-member (shape-1-without-impl) matching — grammar
  accepts both, neither matcher is certified.
- Nested member paths (`A.B.fn`) — describable by the grammar, deliberately unimplemented.
- First-class aggregate nodes.
- Decision entries: verbatim-install ruling (U3 candidate) and the Type-taxonomy ruling.
