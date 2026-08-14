# Ledger — value-driven getService overload

Owner re-ruled the contract 2026-08-13 (supersedes the earlier RESOLVER_TYPE-provider-arg
version entirely): `getService(type: ConstructorType, ctor: Ctor): R` and
`getService(type: FunctionType, func: Func): R` — the node the value's own signature derives
to, alongside the value. No runtime discriminant, no rescue: the node's kind says
construct-or-call. Dependencies come from `TypeSignatures.fromImplType(type)` — the node's own
real parameter types, resolved via the engine's `additionalServices` channel. Full ruling
record: `docs/decisions.v2.md` §167.

## Status: runtime slice shipping now; sugar slice held

Team-lead amendment 2026-08-13: HOLD the authoring-sugar slice (di.extras) pending the
callable-signatures milestone lane settling the inline body's spelling
(`typefor<typeof x>()` replacing `signatureof`). PROCEED with the runtime slice only. This
worktree currently carries ONLY the runtime slice.

## Declaration-home blocker (found, worked around)

Team-lead's instruction was to declare the two overloads directly on `IServiceProvider`
(`libraries/primitives/src/IServiceProvider.ts`), to fix the interface-typed-caller
visibility gap. Confirmed by isolation (di.extras reverted to its exact committed original,
zero diff) that this breaks di.extras' pre-existing, unrelated zero-argument `getService<T>()`
sugar: the Go inline-transform's declaration-discovery walk (`markerMemberDeclarations` in
`transforms/internal/inlinetransform/matcher.go`) stops finding that sugar's own declaration
once `IServiceProvider` carries three direct `getService` signatures instead of one, and any
build pulling in di.extras fails with `INLINE_DISCRIMINATOR_MISMATCH`. Reproduced in
`tests/di.signatureof.ttsc.e2e`, a suite whose own fixture never references `getService` at
all — confirming this is intrinsic to the direct-declaration shape on `IServiceProvider`, not
sandbox-specific.

Fallback (team-lead confirmed via time-pressure call, proceeding unless overridden): declare
the two overloads on the concrete `ServiceProvider` class (`libraries/di/src/ServiceProvider.ts`)
instead, with a `declare module` extension onto `IServiceProvider` alongside them — same
posture the discarded RESOLVER_TYPE draft had. Interface-typed callers still don't see the
extra overloads (the same known extends-merge limitation `getService<T>()`'s own zero-arg
sugar already carries), but nothing pre-existing breaks. Root cause of the Go-checker
collision itself is unresolved — flagged for whoever owns that transform territory, not
something I fixed.

## Implementation

- `libraries/di/src/ServiceProvider.ts` — the two overload signatures + arity dispatch,
  `TypeSignatures.fromImplType`-based dependency resolution, the `declare module` extension.
  The discriminant (`isConstructOnly`), the call-then-rescue retry, and `RESOLVER_TYPE` are
  all gone — deleted, not kept dormant.
- `docs/decisions.v2.md` §167 — the ruling record, including the declaration-home finding.
- `tests/di.test/test/get-service-value.test.ts` / `.types.ts` — behavior and inference
  coverage for the two-argument node+value contract.

## Gates (all green)

- `bun run build`: 0.
- `tests/di.test`: 84/84 green (`bun test` from the package dir), 0 lint errors
  (`bun run lint`).
- `bun run test:e2e` (the six `tests/*.ttsc.e2e` suites, run directly since the root `test`
  script chains `&&` after the unit-test phase and never reaches e2e while any package is
  red on the pre-existing baseline): all 6 green.
- `bun run lint` (repo-wide): 0. `bun run format:check`: clean.

PR stays draft, team-lead's merge gate. Sugar slice gets its own go-signal.
