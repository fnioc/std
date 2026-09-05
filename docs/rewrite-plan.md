# Resolution rewrite — working checklist

> Transitional working doc (owner-ruled 2026-08-21). Check items off as they complete;
> ~~strike~~ what gets decided against. When the WHOLE plan is complete: migrate everything
> permanent into the real docs (decisions entries PRESENT-TENSE ONLY — never describing how
> things used to be), then DELETE this file.

> **EXECUTION ORDERS (owner, added mid-run — standing for the remainder of the run):** optimize
> **HARD** for ASAP. Maximize parallelism: dispatch subagents (the Task tool is available) on
> independent slices concurrently, batch independent gates, and overlap the Go half's compile
> waits with TS-side work. ASAP governs scheduling and wall-clock ONLY, never design — no
> shortcuts, no skipped gates, no relaxed correctness; every ruling in this plan stands untouched.

## Matcher (`libraries/primitives`)

- [x] One `MatchVisitor` replaces `SatisfiesVisitor`/`PatternMatchVisitor`: dispatches on the
      pattern side; the request subtree AND the bindings thread through the `TypeVisitor`
      `Context` slot — stateless visitor, no `captures` field, no rollback code.
- [x] `visit` short-circuits on interned identity (`pattern === subject → true`), every kind.
- [x] `visitGeneric` binds its label; a repeated label must bind the same type.
- [x] Every other kind: same kind + same scalars (name/from/tag/value/abstract) + pairwise
      positional recursion — generic args, tuple members, union/intersection members (same
      count), aggregate element, tag inner. No width subtyping, no literal-widens-to-primitive.
- [x] Rows pairwise positional: same row count, row `i` vs row `i`, same arity, params pairwise;
      return/instance pairwise. No some-row search, no contravariant swap — zero choice points.
- [x] Delete `Type.satisfies` + `satisfiesType` (API removal, ruled).
- [x] `matchType` stays the sole entry; open-constraint guard unchanged.
- [x] Tests: `type-satisfies*` suites become one `type-match` unification suite — identity stop,
      hole binding incl. repeated labels, negatives proving the assignability rules are gone.

## Union canonical order (factory-owned)

- [x] `canonicalMembers` adopts the TS7 `CompareTypes` shape translated to this vocabulary:
      rank table → name/value → children pairwise; no declaration-order or id residue.
      Visitors iterate `members` as stored, agnostic of the rule.
- [x] Wire: union token spellings reorder; the parser accepts any order; regenerate the parity
      oracles and both `expected.txt`.

## Plan walk (`libraries/di`)

- [x] `visit` inlines the exact-answer loop for EVERY request kind — a union's own address
      included: `matching(type)` newest first, first match whose `fromMatch` builds wins; an
      unbuildable hit falls through; then `super.visit` synthesis. `#chosen`/`#candidates` die.
- [x] `Registry.matching` answers exactly ONE address (closed identity + open unification) —
      remove the `requestedAddresses` union spread.
- [x] `visitUnion` is two-phase over canonical member order (registration outranks synthesis, as
      everywhere): phase 1 = first member the manifest answers; phase 2 = first member that
      synthesizes. No ambiguity error, no literal special-case; a registered nullish can win.
- [x] Collections union-agnostic: `visitArray`/`visitIterable` inline their assembly — the
      element's own answers (registration order) + one synthesis tail; no member spread.
      Update the aggregate suite to pin it.
- [x] Delete `AmbiguousUnionError` (di.core + di re-export), `ServiceProviderOptions.unionAmbiguity`,
      `CallSiteContext.unionAmbiguity`, Engine threading, hosting's pass-through (API removals, ruled).
- [x] Intrinsics by interned identity: `type === typefor<IServiceProvider>()` /
      `typefor<IServiceScopeFactory>()` — one canonical (declaring-module) address. Delete
      `SERVICE_PROVIDER_FROMS` + both helper predicates. Delete the dual-spelling test — it
      pins the dropped accommodation.
- [x] di lowering wiring: `tsconfig.ttsc.json` for di; `@rhombus-std/primitives.extras` stays a
      devDependency (the `typefor` calls lower away). Verify the publish build.
- [x] Cycle guard: the `using`-disposer shape (`VisitDisposer`), descriptively named.
- [x] `#synthesized`/`#collection`/`bySpelling`/`Suppliable` die. No helper branches on
      `type.kind`; surviving mechanism helpers get fully descriptive names; named-member
      objects over tuples.
- [x] Absorb the uncommitted `PlannerVisitor.ts` working-tree experiment (typefor intrinsics
      + disposer prototype) — do not lose the owner's edits without absorbing their intent.
- [x] The three `errors-demo` examples lose their ambiguity section; regenerate both
      `expected.txt`.

## Value door (`libraries/di.core`)

- [x] `Registration.value` refuses `Type.isOpen(address)` UNLESS the hole sits under a
      callable root (ctor/func, tags stripped) — one erased callable honestly is every closing;
      one instance is not.

## Scope — standing order, not a task

ABSOLUTE MINIMUM to keep the build green; a dedicated session owns the scope/lifetime model.

## Decided against

- ~~`Registry.matching` memoization~~ — ruled skip; plans already memoize per root.
- ~~Literal-fallback tier by kind in `visitUnion`~~ — superseded by the two phases.
- ~~Dual-spelling provider recognition~~ — dropped; `typefor` derives the one declaring-module
  address (U7).
- ~~Union spread in `Registry` / in collections~~ — the spread is logical only, realized solely
  in `visitUnion`.

## Folded-in mechanical items (owner-ordered, added mid-run)

Verified outstanding by a four-agent audit 2026-08-21; line numbers may drift — several of these
files carry YOUR in-flight edits, so re-verify each site before editing.

- [x] `address` naming in di/di.core INTERNALS (the public faces are done): parameters/members
      holding the address say `address`, never `type` — di.core `ServiceScope.ts:21,23`;
      `Errors.ts:44,46,86,90,105` (the readonly `type` member); `address.ts:10` (withKey);
      di `internal/Engine.ts:37,46,63,105,114`; `internal/Plan/Plan.ts:114`;
      `internal/Plan/PlannerVisitor.ts:40,71,191,211,246`; `internal/ServiceScope.ts:69,73`.
- [x] Inline `typefor<T>()` over shared Type-const bags: di.core `resolver.ts:12` (`RESOLVER_TYPE`,
      ~10 consumers) and diagnostics.core `types.ts:22-51` (8 exported `*_TYPE` consts) — spell
      `typefor<T>()` at the use sites, delete the consts. Both packages already stage through ttsc.
- [x] diagnostics.core fabricated globals (`types.ts:28,:44` — `METRICS_OPTIONS_TYPE`/
      `TRACING_OPTIONS_TYPE`, `Type.global('@rhombus-std/diagnostics/...')`): a package specifier
      hand-concatenated into a global name — convert to the real composed address
      `Type.imported('IOptions', '@rhombus-std/options', [optionsType])`, the shape the options
      family uses. Repo sweep found no other instance.
- [ ] Missing di.extras sugar: one-argument `asClass(ctor)` / `asFactory(fn)` builder sugars
      (lowering to the two-arg primitives with `typefor(x)` as the second argument) — add them
      beside the existing di.extras inline entries.
      **HALTED 2026-08-22:** the sugar face must reach the chain via a di.extras `declare module`
      merge, but `asClass`/`asFactory` live on `IAsImplementer`, which di.core does NOT export
      (nor its `Slot` / `RegistrationBuilder` carriers, which the merged overloads' returns
      need) — TS merges only exported declarations, so landing this REQUIRES exporting those
      three internal types from di.core: a new-public-API fork the standing "no new exported
      types" order forbids and this plan does not rule. Needs an owner ruling on exporting the
      builder-chain interfaces (or an alternative merge target).
- [x] `TypeFor<T>` narrowing (primitives.extras `typefor.ts`): a named type argument derives its
      nominal address, which no type-level discriminator separates from the structural reading.
      **Resolved 2026-08-24 (owner ruling):** every branch an alias spelling can hide widens to
      `structural kind | NamedType`, forcing a `kind` check before kind-specific members; the
      value overload keeps the narrow reading, since observing a value never yields a name.
- [x] options.augmentations `rollup.dts.mjs:14` — add di.extras to the dts externals.
- [x] The disposal-order string throw in di's cycle-guard disposer (was `PlannerVisitor.ts:36`,
      possibly already reshaped by your rewrite): wherever it lives now, make it a real Error whose
      message names the disposal-order violation. It is NOT the exempt intentional string throw.
- [x] di `src/augmentations/` new-file cleanups: `Manifest-ContainerBuilder-augmentations.ts` uses
      the retired shape (`extends Flatten<typeof Ns>`, docs on the namespace) — convert to the
      canonical shape (one declare-module block carrying the docs, registerAugmentations calls
      grouped by overload shape, no Flatten clause). `ServiceProvider-resolution-augmentations.ts`
      is an empty stub (empty face + `registerAugmentations({})` + 4 unused imports) — delete it if
      nothing references it (verify first), else fill it.
- [x] Stale comment: tests/mergesynth.ttsc.e2e `test/mergesynth.test.ts:285` still describes
      registerAugmentations/`@augment`'s parameter as `string | Type`; it is Type-only now.

## Inline discovery — issue #365 (owner-ordered fold-in, added mid-run)

The work items live in `docs/tasklist.md` § "Inline discovery" (line ~230). The authoritative
spec is mirrored IN-REPO at `docs/issue-365-inline-discovery.md` (the issue body plus the
superseding spec-revisions comment — read the mirror, not GitHub; delete it alongside this file
at wrap-up). The four rulings, verbatim intent:

1. Marker-call discovery is ADDITIVE — `rhombus-std.json` stays for non-augmentation inlinables;
   nothing retires it.
2. `registerInlineBodies` registrations ACCUMULATE in any partition (one overload per call,
   several, or all in one; later calls add more); the engine's unit is the
   (member, overload signature) pair regardless of which call carried it.
3. Rest-parameter bodies are permitted, never required — per-overload bodies with their own
   signatures are equally first-class.
4. Selection is the CHECKER'S RESOLUTION, full stop: the engine does no overload resolution of
   its own — the signature the checker resolved the call to (the one intellisense shows as
   selected) is the selection, and the engine inlines the body registered for exactly that
   signature. A resolved face with no registered body is a loud build error (never
   nearest-match). The existing `GetResolvedSignature` anchoring (`matcher.go:173`) is the
   foundation: the same resolution that claims the call also picks the body.

Sequencing: the Go half first (discovery + per-overload body extraction + the loud error) — the
substituter's strictly-positional binding (`substitute.go:84`) is the piece that learns
per-overload bodies — then the TS half it unblocks: the `*.extras` augmentation sets' entries
move from `rhombus-std.json` to per-overload `registerInlineBodies` calls (the getService family
keeps per-overload bodies, NOT a collapsed rest body). The parity e2es are the oracle throughout.

- [x] Go half: marker-call discovery, per-overload body registration keyed by
      (member, overload signature), checker's-resolution selection, loud no-body-for-resolved-face
      build error.
- [x] TS half: `*.extras` entries migrate to per-overload `registerInlineBodies` calls.
- [x] Parity e2es updated/passing as the oracle.

## Single-instance guard (owner-ordered fold-in, added mid-run)

Peer deps are OFF the table (owner: user-confusing; every package keeps plain `dependencies`).
The duplicate-copy hazard the identity invariant worries about — a second loaded copy of
primitives/di.core forking the augmentation registry / `Manifest` identity — is covered at
RUNTIME instead:

- [x] `@rhombus-std/primitives` and `@rhombus-std/di.core` each stamp a global-symbol sentinel at
      module load (e.g. `globalThis[Symbol.for('@rhombus-std/primitives/instance')]`) recording
      what identifies the loaded copy (its module URL).
- [x] A second, genuinely DIFFERENT copy loading sees the stamp and THROWS immediately — the
      message names BOTH module paths and tells the user to deduplicate (hard-fail, loud and
      immediate). Guard the guard: compare identity (module URL) and throw only on a real
      difference — same-copy re-evaluation stays silent.
- [x] Tests: one copy loads clean; a simulated second copy throws with both paths in the message.
      The white-box `./tokens/*` seam and the preload's virtual modules must NOT trip the guard —
      the barrel and a tokens deep-import resolve the same files by design; verify, don't assume.
- [x] No dependency recategorization anywhere — plain `dependencies` stay as they are.

## Options family — HOLD, not a task

Owner: "leave options alone." The `() => T` base-slot dissolve is NOT approved. Make no changes
to options / options.augmentations / logging.config shapes beyond what this plan already queues.

## Wrap-up (gate for deleting this file)

- [x] Full gates: `bun run test`, transforms Go gates, `bun run lint`, `bun run format:check`.
- [x] Migrate permanent content: CLAUDE.md digest (matching invariant, union semantics, deleted
      APIs), decisions entries written present-tense only, di/di.core README ambiguity
      paragraphs, first-pass-docs sweep of everything touched.
- [x] Commit; push (feature completion); alert peer sessions on this branch to rebase.
- [ ] DELETE this file. **Blocked 2026-08-22 on the two HALTED items above — everything else is
      complete and migrated; delete once the owner rules them.**
