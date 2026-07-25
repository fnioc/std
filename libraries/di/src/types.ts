// The engine's type surface, re-exported from `@rhombus-std/di.core`: the
// registration ABI, the resolution/scope seams, the public provider surface, and
// the `Lifetime` tag all live there so the collection builder and the resolution
// engine share one contract.

export type {
  Ctor,
  Factory,
  IRequiredResolver,
  IResolver,
  IScopeFactory,
  // The public provider surface — the abstractions interface, not the impl class.
  IServiceProvider,
  // The pluggable provider-factory seam.
  IServiceProviderFactory,
  IServiceQuery,
  Lifetime,
  // The per-registration element a manifest iterates — the immutable manifest IS
  // an `Iterable<ManifestEntry>`, so a consumer walking one needs this name.
  ManifestEntry,
  OpenRegistration,
  Producer,
  Registration,
  // The provider-construction options `build(options?)` accepts.
  ServiceProviderOptions,
  Union,
} from '@rhombus-std/di.core';
