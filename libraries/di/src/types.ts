// The engine's type surface — all re-exported from the pure-ABI package
// `@rhombus-std/di.core`. The registration ABI (the plain-data registration
// shapes), the resolution/scope seams, the public provider surface, and the
// `Lifetime` tag all live in di.core so the collection builder (di.core) and the
// resolution engine (this package) share one contract. di re-exports them here
// so the whole surface stays reachable through one `@rhombus-std/di` import.

export type {
  Ctor,
  Factory,
  // The named reference capability analogs IResolver composes.
  IRequiredResolver,
  IResolver,
  // Backwards-compat alias.
  IResolveScope,
  IScopeFactory,
  // The public provider surface — the abstractions interface, not the impl class.
  IServiceProvider,
  // The pluggable provider-factory seam (reference `IServiceProviderFactory`).
  IServiceProviderFactory,
  IServiceQuery,
  Lifetime,
  OpenRegistration,
  Producer,
  Registration,
  // The provider-construction options `build(options?)` accepts.
  ServiceProviderOptions,
  Union,
} from '@rhombus-std/di.core';
