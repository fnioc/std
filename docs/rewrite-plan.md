# Resolution rewrite — working checklist

> Transitional working doc (owner-ruled 2026-08-21). Check items off as they complete;
> ~~strike~~ what gets decided against. When the WHOLE plan is complete: migrate everything
> permanent into the real docs (decisions entries PRESENT-TENSE ONLY — never describing how
> things used to be), then DELETE this file.

## Matcher (`libraries/primitives`)

- [ ] One `MatchVisitor` replaces `SatisfiesVisitor`/`PatternMatchVisitor`: dispatches on the
      pattern side; the request subtree AND the bindings thread through the `TypeVisitor`
      `Context` slot — stateless visitor, no `captures` field, no rollback code.
- [ ] `visit` short-circuits on interned identity (`pattern === subject → true`), every kind.
- [ ] `visitGeneric` binds its label; a repeated label must bind the same type.
- [ ] Every other kind: same kind + same scalars (name/from/tag/value/abstract) + pairwise
      positional recursion — generic args, tuple members, union/intersection members (same
      count), aggregate element, tag inner. No width subtyping, no literal-widens-to-primitive.
- [ ] Rows pairwise positional: same row count, row `i` vs row `i`, same arity, params pairwise;
      return/instance pairwise. No some-row search, no contravariant swap — zero choice points.
- [ ] Delete `Type.satisfies` + `satisfiesType` (API removal, ruled).
- [ ] `matchType` stays the sole entry; open-constraint guard unchanged.
- [ ] Tests: `type-satisfies*` suites become one `type-match` unification suite — identity stop,
      hole binding incl. repeated labels, negatives proving the assignability rules are gone.

## Union canonical order (factory-owned)

- [ ] `canonicalMembers` adopts the TS7 `CompareTypes` shape translated to this vocabulary:
      rank table → name/value → children pairwise; no declaration-order or id residue.
      Visitors iterate `members` as stored, agnostic of the rule.
- [ ] Wire: union token spellings reorder; the parser accepts any order; regenerate the parity
      oracles and both `expected.txt`.

## Call-site walk (`libraries/di`)

- [ ] `visit` inlines the exact-answer loop for EVERY request kind — a union's own address
      included: `answering(type)` newest first, first answer whose `fromAnswer` builds wins; an
      unbuildable hit falls through; then `super.visit` synthesis. `#chosen`/`#candidates` die.
- [ ] `Registry.answering` answers exactly ONE address (closed identity + open unification) —
      remove the `requestedAddresses` union spread.
- [ ] `visitUnion` is two-phase over canonical member order (registration outranks synthesis, as
      everywhere): phase 1 = first member the manifest answers; phase 2 = first member that
      synthesizes. No ambiguity error, no literal special-case; a registered nullish can win.
- [ ] Collections union-agnostic: `visitArray`/`visitIterable` inline their assembly — the
      element's own answers (registration order) + one synthesis tail; no member spread.
      Update the aggregate suite to pin it.
- [ ] Delete `AmbiguousUnionError` (di.core + di re-export), `ServiceProviderOptions.unionAmbiguity`,
      `CallSiteContext.unionAmbiguity`, Engine threading, hosting's pass-through (API removals, ruled).
- [ ] Intrinsics by interned identity: `type === typefor<IServiceProvider>()` /
      `typefor<IServiceScopeFactory>()` — one canonical (declaring-module) address. Delete
      `SERVICE_PROVIDER_FROMS` + both helper predicates. Delete the dual-spelling test — it
      pins the dropped accommodation.
- [ ] di lowering wiring: `tsconfig.ttsc.json` for di; `@rhombus-std/primitives.extras` stays a
      devDependency (the `typefor` calls lower away). Verify the publish build.
- [ ] Cycle guard: the `using`-disposer shape (`VisitDisposer`), descriptively named.
- [ ] `#synthesized`/`#collection`/`bySpelling`/`Suppliable` die. No helper branches on
      `type.kind`; surviving mechanism helpers get fully descriptive names; named-member
      objects over tuples.
- [ ] Absorb the uncommitted `ToCallSiteVisitor.ts` working-tree experiment (typefor intrinsics
      + disposer prototype) — do not lose the owner's edits without absorbing their intent.
- [ ] The three `errors-demo` examples lose their ambiguity section; regenerate both
      `expected.txt`.

## Value door (`libraries/di.core`)

- [ ] `ServiceDescriptor.value` refuses `Type.isOpen(serviceType)` UNLESS the hole sits under a
      callable root (ctor/func, tags stripped) — one erased callable honestly is every closing;
      one instance is not.

## Scope — standing order, not a task

ABSOLUTE MINIMUM to keep the build green; a dedicated session owns the scope/lifetime model.
`descriptor` stays on scoped call sites exactly as-is.

## Decided against

- ~~`Registry.answering` memoization~~ — ruled skip; plans already memoize per root.
- ~~Literal-fallback tier by kind in `visitUnion`~~ — superseded by the two phases.
- ~~Dual-spelling provider recognition~~ — dropped; `typefor` derives the one declaring-module
  address (U7).
- ~~Union spread in `Registry` / in collections~~ — the spread is logical only, realized solely
  in `visitUnion`.

## Wrap-up (gate for deleting this file)

- [ ] Full gates: `bun run test`, transforms Go gates, `bun run lint`, `bun run format:check`.
- [ ] Migrate permanent content: CLAUDE.md digest (matching invariant, union semantics, deleted
      APIs), decisions entries written present-tense only, di/di.core README ambiguity
      paragraphs, first-pass-docs sweep of everything touched.
- [ ] Commit; push (feature completion); alert peer sessions on this branch to rebase.
- [ ] DELETE this file.
