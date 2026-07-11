// The `build()` augmentation + the constructible public `ServiceManifest` value.
//
// The registration collection `ServiceManifestClass` lives in the abstractions
// package `@rhombus-std/di.core` and ships WITHOUT a working `build()` — it has
// no access to the resolution engine. This module supplies the engine-constructing
// half through the primitives augmentation registry, mirroring the reference DI
// split where the provider-building entry is a runtime-package extension rather
// than a method on the abstractions-package collection.
//
// `build` is authored as `ServiceCollectionContainerBuilderExtensions` (mirroring
// the reference static class of the same name) and REGISTERED against the OPEN
// `ServiceManifest` token — the same token `addOptions`/`addLogging`/... target.
// `ServiceManifestClass`, decorated with `@augment(token)` in di.core, pulls this
// set onto its prototype, so importing `@rhombus-std/di` (which re-exports from
// here) makes `new ServiceManifest().build()` produce a real provider as an
// import-time side effect. The core `build()` interface member already exists —
// this only supplies the runtime.

import { type OpenRegistration, type Registration, type ServiceManifest as ServiceManifestInterface,
  ServiceManifestClass, type ServiceProvider, type ServiceProviderOptions, type Token } from '@rhombus-std/di.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives.transformer/internal/nameof';

import { ServiceProviderClass } from './ServiceProviderClass.js';

/**
 * The public authoring INTERFACE a `@rhombus-std/di` consumer holds — di.core's
 * `ServiceManifest<S>`, re-declared locally so it merges with the constructible
 * VALUE of the same name below (one name carrying both type and value through the
 * barrel). The `@rhombus-std/di.transformer` augmentation surfaces through it: it
 * merges onto `ServiceManifestBase`, which this resolves to.
 */
export type ServiceManifest<S extends string = 'singleton'> = ServiceManifestInterface<S>;

// The engine-constructing half of `build()`: seal the registrations (the
// collection's own half, done in di.core) and hand the frozen snapshot to the
// resolution engine. NO frame is pre-opened — the returned provider is frameless
// (see `ServiceManifestClass.build`'s doc). The closed memo starts empty and
// MUTABLE, created fresh per `build()` call so every scope frame of one provider
// tree shares it.
//
// One named object literal mirroring the reference static class
// `ServiceCollectionContainerBuilderExtensions` (a runtime-package extension on
// `IServiceCollection`, exactly our shape). Receiver-first, checked with
// `satisfies AugmentationSet<R>`; the exported const is the standalone call
// surface, and registering it installs the fluent `build()` onto the prototype.
export const ServiceCollectionContainerBuilderExtensions = {
  build(
    manifest: ServiceManifestClass<string>,
    options?: ServiceProviderOptions,
  ): ServiceProvider<string> {
    const { registrations, openRegistrations } = manifest.seal();
    return new ServiceProviderClass<string>(
      registrations as ReadonlyMap<Token, Registration[]>,
      openRegistrations as ReadonlyMap<Token, readonly OpenRegistration[]>,
      new Map<Token, Registration>(),
      undefined,
      options,
    );
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(nameof<ServiceManifestInterface>(), ServiceCollectionContainerBuilderExtensions);

/**
 * The static / constructor side of the public `ServiceManifest`. Extracted as an
 * interface purely so the value export below has a name to carry —
 * `new ServiceManifest<S>()` just constructs a `ServiceManifestClass<S>` (whose
 * `build()` runtime this module has registered against the augmentation token).
 */
export interface ServiceManifestCtor {
  new<S extends string = 'singleton'>(): ServiceManifest<S>;
}

/** The public registration-builder VALUE. It IS `ServiceManifestClass`. */
export const ServiceManifest: ServiceManifestCtor = ServiceManifestClass;
