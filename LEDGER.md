# Ledger — value-driven getService overload

Owner ruling (2026-08-13): two new `getService` overloads taking the value itself —
`getService<T>(ctor: new (...args: never[]) => T): T` and
`getService<T>(fn: (...args: never[]) => T): T`.

## Status

Blocked on the dependency-resolution mechanism. Researched the engine
(`libraries/di/src/internal/Engine.ts`, `CallSite.ts`, `ToCallSiteVisitor.ts`,
`RealizeVisitor.ts`) and `libraries/di/src/ServiceProvider.ts`. Confirmed:

- `getService`'s base signature is a direct member of `IServiceProvider` in
  `libraries/primitives/src/IServiceProvider.ts`, not an augmentation.
- The MO-sealed getService-adjacent files are
  `libraries/di.core/src/augmentations/ServiceProvider-service-augmentations.ts`
  (getRequiredService/getServices) and
  `libraries/di.extras/src/augmentations/ServiceProvider-service-augmentations.ts`
  (tokenless sugar, calling `this.getService(typefor<T>())`).
- The concrete engine (`this.#engine.resolve(type, { serviceProvider, additionalServices })`)
  lives only in `libraries/di/src/ServiceProvider.ts`, behind a true `#`-private field —
  unreachable from any `AugmentationSet2` closure (`this: IServiceProvider`). The new
  overloads' runtime logic can only live inside `ServiceProvider.ts` itself.
- `docs/decisions.v2.md` §128 killed `ActivatorUtilities`-style reflection-based
  construction as porting noise ("no runtime reflection ... `resolveFactory(token, params?)`
  ... neither needs reflection"). This overload reintroduces a version of that capability
  under a narrower, value-driven (not reflection-based) contract — flagged for the
  decisions.v2.md entry, not a blocker.

Sent the open question to team-lead: without reflection or transformer sugar, what
signature does the synthesized `ServiceDescriptor` carry for an arbitrary ctor/fn's real
parameters? Best-guess reading pending confirmation: the constructed value receives the
current `IServiceProvider` as its sole argument (the one type the engine can always resolve
without a registry entry — `ToCallSiteVisitor.isServiceProviderType` → `CallSite.serviceProvider()`)
and pulls whatever it needs itself via `provider.getRequiredService(...)` in its own body.

## Done so far

- Worktree + draft PR scaffolding.
- Runtime dispatch discriminant (construct-vs-call classification, `Reflect.apply`/
  `Reflect.construct`, the TypeError-message rescue retry) — unambiguous per the brief,
  built independent of the deps-resolution answer.

## Not started

- The actual `getService` overload wiring (pending the answer above).
- Tests.
- decisions.v2.md entry.
