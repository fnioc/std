// The engine's type surface — all re-exported from the pure-ABI package
// `@rhombus-std/di.core`. The registration ABI (the plain-data registration
// shapes), the resolution/scope seams, the public provider surface, and the
// `Lifetime` tag all live in di.core so the collection builder (di.core) and the
// resolution engine (this package) share one contract. di re-exports them here
// so the whole surface stays reachable through one `@rhombus-std/di` import.

export type {
  Ctor,
  Factory,
  Lifetime,
  OpenRegistration,
  Producer,
  Registration,
  // The named reference capability analogs Resolver composes.
  RequiredResolver,
  Resolver,
  // Backwards-compat alias.
  ResolveScope,
  ScopeFactory,
  // The public provider surface — the abstractions interface, not the impl class.
  ServiceProvider,
  // The pluggable provider-factory seam (reference `IServiceProviderFactory`).
  ServiceProviderFactory,
  // The provider-construction options `build(options?)` accepts.
  ServiceProviderOptions,
  ServiceQuery,
  Union,
} from "@rhombus-std/di.core";
