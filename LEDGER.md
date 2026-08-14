# Ledger — value-driven getService overload

Owner re-ruled the contract 2026-08-13 (supersedes the earlier RESOLVER_TYPE-provider-arg
version entirely): `getService(type: ConstructorType, ctor: Ctor): R` and
`getService(type: FunctionType, func: Func): R` — the node the value's own signature derives
to, alongside the value. No runtime discriminant, no rescue: the node's kind says
construct-or-call. Dependencies come from `TypeSignatures.fromImplType(type)` — the node's own
real parameter types, resolved via the engine's `additionalServices` channel. Full ruling
record: `docs/decisions.v2.md` §167.

## Status: runtime slice complete, direct-declaration home fixed at the root, sugar slice held

The two overloads are declared directly on `IServiceProvider`
(`libraries/primitives/src/IServiceProvider.ts`), as team-lead originally ruled. Confirmed
working end-to-end, including for `IServiceProvider`-typed callers (not just the concrete
`ServiceProvider`).

di.extras is fully untouched (zero diff) — the authoring-sugar slice stays held per team-lead's
instruction, pending the callable-signatures milestone settling its inline body's spelling.

## The real bug, found and fixed (not routed around)

Declaring the overloads directly on `IServiceProvider` initially broke di.extras'
pre-existing, unrelated zero-argument `getService<T>()` sugar: any build pulling in di.extras
failed with `INLINE_DISCRIMINATOR_MISMATCH`, reproduced in `tests/di.signatureof.ttsc.e2e`
with di.extras completely unmodified.

Root cause, confirmed via instrumented debug builds against the real repo files (not a
hand-rolled fixture — several fixture-based hypotheses were tried and ruled out first,
including the extends-merge-collision theory in my initial report): it is NOT a TypeScript
declaration-merging limitation at all. `transforms/internal/inlinetransform/resolve.go`'s
`anyDeclarationTakes` decides whether a sugar overload's declaration is genuinely absent from
a program (silent `OutcomeUnmatched`) or present-but-mismatched (a hard
`INLINE_DISCRIMINATOR_MISMATCH` authoring-fault error) by comparing ONLY type-parameter count
between the sugar body and every declaration reachable from the marker's surface. My new
`getService<R>(type: ConstructorType, ctor): R` overload carries one type parameter — the same
count as di.extras' `getService<T>(): T | undefined` — so the moment `IServiceProvider` carried
it, the check concluded "a declaration with the sugar's type-parameter count exists, so the
sugar itself must be loaded and merely misspelled" — even in a program where di.extras' own
declaration was never loaded. Fixed by also comparing value-parameter count: an unrelated
overload essentially never shares BOTH counts by coincidence, where sharing only
type-parameter count is common (a lone generic parameter is the ordinary shape for both a
sugar overload and an explicit-node one).

A Go regression test (`TestResolveMemberUnmatchedDespiteArityCollidingOverload`,
`transforms/internal/inlinetransform/resolve_test.go`) pins the exact shape: red before the
fix (confirmed by temporarily reverting just the fix and re-running), green after. Zero
emission-format changes — the fix only touches which outcome a resolve call reaches, never
what a matched call lowers to.

## Implementation

- `libraries/primitives/src/IServiceProvider.ts` — the two new overload signatures, declared
  directly alongside the base `getService(type: Type): any` member.
- `libraries/di/src/ServiceProvider.ts` — matching signatures on the concrete class (for the
  implementation and the token-string-widened base form), `TypeSignatures.fromImplType`-based
  dependency resolution, `additionalServices` re-entry. The retired discriminant
  (`isConstructOnly`), call-then-rescue retry, and `RESOLVER_TYPE` shim from the earlier
  contract are gone, not dormant.
- `transforms/internal/inlinetransform/resolve.go` — the `anyDeclarationTakes` fix.
- `transforms/internal/inlinetransform/resolve_test.go` — the regression test.
- `docs/decisions.v2.md` §167 — the ruling record, including the corrected root-cause
  diagnosis (superseding the extends-merge-collision theory from my earlier report).
- `tests/di.test/test/get-service-value.test.ts` / `.types.ts` — behavior and inference
  coverage for the two-argument node+value contract, including `IServiceProvider`-typed-caller
  visibility (now confirmed working).

## Gates (all green)

- `bun run build`: 0.
- `tests/di.test`: 84/84 green, 0 lint errors.
- `bun run test:e2e` (all seven `tests/*.ttsc.e2e` suites, including the previously-broken
  `di.signatureof.ttsc.e2e`): all green.
- `bun run lint` (repo-wide), `bun run format:check`: clean.
- Go gates (from `transforms/`, after `node scripts/gen-go-work.mjs`): `go build ./...`,
  `go vet ./...`, `go test ./...`, `gofmt -l .` — all clean.

PR stays draft, team-lead's merge gate.
