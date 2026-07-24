# Decisions (v2) — draft entries, transforms fixed-point rewrite

Staged holding pen for decisions.v2.md entries from the transforms fixed-point rewrite
(`transforms-rewrite-design.md`, tracked on branch `feat-transforms-fixed-point` / draft PR #272).
Kept OUT of `docs/decisions.v2.md` itself until the rewrite's shape freezes (W6p3/W7) — assigning
real `§N` ids now risks a citation collision with any concurrent PR minting its own next number.
Each entry below gets its real `§N` at reconciliation; `§TBD` is a placeholder, not a citable id.
Entries reference the design record and the rewritten `docs/features/transformer-architecture.md`
rather than duplicating their content — read those for full mechanics.

---

## §TBD — Fixed-point loop replaces stage-order dependence; the enabling invariant is disjoint match sets

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
stage may require running before/after another within one pass. _Owner ruling: "a few extra
iterations doesn't hurt anything. it's milliseconds."_

---

## §TBD — No-type-arg registration derives the token from the VALUE, never from TS inference

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

## §TBD — No domain names in Go transform source; domain arrives as data

No primitive stage's Go source may compare a callee name against a hardcoded domain string
(`if calleeName == "addClass"`, `"@rhombus-std/options:IOptions"`, etc.). Domain knowledge reaches
the engine only as DATA carried by the checker or the artifacts hand-off: a side-parsed sugar
body's own text, a checker-resolved symbol/type, a structurally-detected brand shape (the
`Keyed`/`Inject`/`Hole`/`$N` token grammar stays engine-owned naming language, detected
structurally, not by name-matching a specific package's export). Two illustrative cases: the
`schemaof<T>()` primitive threads config's `OPTIONAL` marker identity through a generic
`valueimport.Ref` value, never a branch on "is this config's marker"; `mergesynth`'s per-member
merge-strategy guards are generated from the member's own parameter types via an in-process typia
call, with no family/augmentation identity named anywhere in the stage. _Owner ruling: domain in
TRANSFORM SOURCE is banned; domain in runtime memory (checker state, artifacts) is fine._

---

## §TBD — Transforms never validate user code; they only report their own lowering failures

No transform in the engine polices a user's design choices (there is no re-implementation of the
old domain stages' open-generic-registration completeness checks, formerly diagnostics
990008/990009/990010). Runtime already enforces the equivalent invariants at
registration/resolve time; duplicating that policing at compile time was never the transform
layer's job. The one thing a transform DOES still report is its own inability to lower a specific
call — an underivable token, a non-tuple `signaturefor<T>()`, an unsupported `schemaof<T>()` field
shape — which is failure reporting about the transform's own mechanism, not validation of the
user's design. _Owner ruling: "it's not transform's job to validate. don't do it. leave runtime
as-is."_

---

## §TBD — Stage SELECTION retired; one always-on primitive set

The two-layer selection model (a workspace dependency scan choosing which stage ids activate for
a given consumer, `ttsc.stages` package.json markers, `BaseBundles` preset expansion,
`selectStages`) is retired. Depending on any `*.extras`/`*.transformer` package's `./ttsc`
descriptor spawns the ONE host, which always runs its full stage table — there is no second
question of "which stages" left to answer. `*.transformer`/`*.extras` packages survive as sugar
homes (declarations + bodies + one spawn descriptor each); the inline stage's referenced-check
(witness → inert when a target module is genuinely absent from the consumer's program) survives
as the mechanism that makes an unrelated consumer's build a no-op, not stage selection.

---

## §TBD — Mergesynth is a one-shot pre-pass, not a fixed-point loop member

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

## §TBD — `*.transformer` → `*.extras` rename; transformables move out of the runtime `primitives` leaf

<!-- ASSUMPTION: this rename is a W7-gated deliverable (constraint 11), not yet landed on disk as
     of this draft. The exact final package set (which packages rename vs. keep `.transformer`)
     is a judgment call made "by inspection" at that point — record the actual landed set here at
     reconciliation, not this draft's prediction. -->

A `*.transformer` package that does nothing but hold sugar (declare-module typings + inline
bodies + one spawn descriptor, no other toolchain artifact) is renamed `<family>.extras` (e.g.
`di.extras`) — `.transformer` is reserved for a package that still carries a real toolchain
artifact beyond the descriptor. Separately, the transformable authoring stubs (`tokenfor`/
`tokenof`) move OUT of the runtime `@rhombus-std/primitives` leaf into `primitives.extras` (né
`primitives.transformer`): the prior reason for keeping them in the runtime leaf — "runtime source
imports it directly" — dissolves once the nameof stage's import elision leaves no reference in any
shipped bundle, so every runtime library can depend on the authoring package dev-scoped only. Brand
TYPES (`Keyed`/`Inject`/`Typeof`/`Hole`) move only if they too have no runtime footprint AND no
derived-token-text change results (token text embeds home package specifiers, so this move is
byte-parity-gated, not automatic).

---

## §TBD — Keyed resolve/isService semantics complete the §98 design; `keyedtokenfor` is the composed-lookup primitive

Every single-token consumer of a possibly-keyed type (`resolveAsync<Keyed<T,K>>()`,
`isService<Keyed<T,K>>()`) derives its token via `keyedtokenfor<T>()` — the composed-lookup
primitive that emits the SINGLE `base#key` string for a `Keyed<T,K>`, or the plain base for an
unkeyed `T` (unkeyed output stays byte-identical to the pre-existing form by construction). The
split-argument consumers (`resolve`/`tryResolve`, which carry a runtime key parameter) instead
derive `tokenfor<T>() + keyof<T>()` onto that existing parameter. This corrects a real gap: an
earlier form derived the single-token consumers' key via the raw alias-preserving `tokenof<T>()`,
which never matched a `base#key` registration — a keyed `isService`/`resolveAsync` silently
answered false / threw for every keyed type. di-direct's own `lowerResolveCall`/
`lowerIsServiceCall` carried the identical latent gap and are corrected by the same bodies. A
runtime round-trip test (a keyed resolve actually matching a keyed registration) backs the fix,
since the prior byte-parity-only nets couldn't have caught it — they proved inline matched
di-direct's output, not that di-direct's output was itself correct.

---

## §TBD — Failure semantics unified: a token-shaped primitive never emits a silent empty result

Every token-deriving primitive follows one rule: an underivable derivation never falls through to
an empty string, `null`, or other silent placeholder. A SYNTHETIC (substituted) use that's still
underivable when its stage runs is left un-lowered with no diagnostic yet — because a dead ternary
branch's primitive call may still be pruned by the `fold` stage before anyone needs its value, and
erroring before that prune would fail builds that are actually fine — and the emit sweep is the
backstop that catches one that never got pruned or lowered. A SOURCE-WRITTEN use (a human wrote the
call directly) has no later rescue, so it emits a targeted diagnostic naming the problem
immediately. This retires the prior split behavior where different code paths independently chose
`""` vs `null` vs no diagnostic for the same underlying "can't derive this" condition.
