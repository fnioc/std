// The `build()` extension + the constructible public `ServiceManifest` value.
//
// The registration collection `ServiceManifestClass` lives in the abstractions
// package `@rhombus-std/di.core` and ships WITHOUT a working `build()` — it has
// no access to the resolution engine. This module supplies the engine-constructing
// half by PROTOTYPE-PATCHING `build()` onto the class at import time, mirroring
// the reference DI split where the provider-building entry is a runtime-package
// extension rather than a method on the abstractions-package collection.
//
// Importing `@rhombus-std/di` (which re-exports from here) applies the patch as a
// side effect, so `new ServiceManifest().build()` produces a real provider. This
// is the same prototype-patch mechanism a cross-package fluent augmentation uses;
// di does it for its own `build()`.

import { ServiceManifestClass } from "@rhombus-std/di.core";
import type {
  OpenRegistration,
  Registration,
  ServiceManifest as ServiceManifestInterface,
  ServiceProvider,
  Token,
} from "@rhombus-std/di.core";

import { ServiceProviderClass } from "./scope.js";

/**
 * The public authoring INTERFACE a `@rhombus-std/di` consumer holds — di.core's
 * `ServiceManifest<S>`, re-declared locally so it merges with the constructible
 * VALUE of the same name below (one name carrying both type and value through the
 * barrel). The `@rhombus-std/di.transformer` augmentation surfaces through it: it
 * merges onto `ServiceManifestBase`, which this resolves to.
 */
export type ServiceManifest<S extends string = "singleton"> = ServiceManifestInterface<S>;

// Patch the engine-constructing half of `build()` onto the collection: seal the
// registrations (the collection's own half, done in di.core) and hand the frozen
// snapshot to the resolution engine. NO frame is pre-opened — the returned
// provider is frameless (see `ServiceManifestClass.build`'s doc). The closed
// memo starts empty and MUTABLE, created once here so every scope frame of this
// provider tree shares it.
ServiceManifestClass.prototype.build = function build<S extends string>(
  this: ServiceManifestClass<S>,
): ServiceProvider<S> {
  const { registrations, openRegistrations } = this.seal();
  return new ServiceProviderClass<S>(
    registrations as ReadonlyMap<Token, Registration[]>,
    openRegistrations as ReadonlyMap<Token, readonly OpenRegistration[]>,
    new Map<Token, Registration>(),
  );
};

/**
 * The static / constructor side of the public `ServiceManifest`. Extracted as an
 * interface purely so the value export below has a name to carry —
 * `new ServiceManifest<S>()` just constructs a `ServiceManifestClass<S>` (whose
 * `build()` this module has patched).
 */
export interface ServiceManifestCtor {
  new<S extends string = "singleton">(): ServiceManifest<S>;
}

/** The public registration-builder VALUE. It IS `ServiceManifestClass`. */
export const ServiceManifest: ServiceManifestCtor = ServiceManifestClass;
