# Ledger — value-driven getService overload

Owner ruling (2026-08-13): two new `getService` overloads taking the value itself —
`getService<T>(ctor: new (...args: never[]) => T): T` and
`getService<T>(fn: (...args: never[]) => T): T`.

## Status: implemented, gated, PR #342 open as draft

Mechanism confirmed against direct precedent in
`libraries/hosting.core/src/DefaultManifest-HostedService-augmentations.ts`'s `addHostedService`
factory form, which already solves the same "give a value-driven registration its deps without
reflection" problem via `RESOLVER_TYPE` (`libraries/di.core/src/resolver.ts`). See
`docs/decisions.v2.md` §153 for the full ruling record.

## Implementation

- `libraries/di/src/ServiceProvider.ts` — the two new overload signatures plus dispatch, added
  directly on `getService` (the base `Type | Token` form is a primitive class member, not
  augmentation-registry material, and neither are these — `#engine` is a true `#`-private field
  no augmentation closure can reach). A `declare module` extension onto `IServiceProvider`
  accompanies them for type visibility, though see the known limitation below.
- `docs/decisions.v2.md` §153 — the ruling record.
- `tests/di.test/test/get-service-value.test.ts` / `.types.ts` — behavior and inference coverage.

## Known limitation (pre-existing, not introduced by this change)

An `IServiceProvider`-typed caller does not see the two new overloads today — confirmed the same
gap already affects `getService<T>()`'s existing zero-argument sugar (di.extras) and `Manifest`'s
tokenless `addClass<T>()`. TS does not merge an overload contributed through `extends` against a
member already declared directly on the target interface. The `declare module` block stays as the
correct shape for when that gap closes; it is currently inert for interface-typed callers.

## Gates (all green except the documented pre-existing red)

- `bun run build`: 0.
- `bun run test`: known-red baseline unrelated to this change (11 packages, all pre-existing —
  `ServiceProvider.dispose`/`disposeAsync` NotImplementedError, caching's
  `MemoryCacheEntryOptions`/`DistributedCacheEntryOptions` setter stubs, diagnostics
  `enableMetrics`/`enableTracing` stubs, a `primitives.test` fuzz-test timeout). `di.test` itself:
  68/68 green, 0 new failures anywhere.
- `bun run test:e2e` (the six `tests/*.ttsc.e2e` suites, run directly since the root `test` script
  chains `&&` after the unit-test phase and never reaches e2e while any package is red): all 6
  green.
- `bun run lint`: 0.
- `bun run format:check`: clean.

PR kept in draft per instructions — not marked ready.
