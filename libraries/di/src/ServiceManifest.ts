// The engine-constructing half of `build()`, plus the constructible public
// `ServiceManifest` value.
//
// The registration collection `ServiceManifestClass` lives in the abstractions
// package `@rhombus-std/di.core` and ships WITHOUT a working `build()` — it has
// no access to the resolution engine. Registering the set below against the OPEN
// `ServiceManifest` token (the same token `addOptions`/`addLogging`/… target)
// installs the real one onto the class's prototype, so importing
// `@rhombus-std/di` makes `new ServiceManifest().build()` produce a live provider
// as an import-time side effect.

import { type IServiceManifest as ServiceManifestInterface, type IServiceProvider, type OpenRegistration,
  type Registration, ServiceManifestClass, type ServiceProviderOptions, type Token } from '@rhombus-std/di.core';
import { type AugmentationSet, type MergeStrategies, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';

import { ServiceProviderClass } from './ServiceProviderClass.js';

/**
 * The public authoring INTERFACE a `@rhombus-std/di` consumer holds — di.core's
 * `ServiceManifest<S>`, re-declared locally so it merges with the constructible
 * VALUE of the same name below (one name carrying both type and value through the
 * barrel).
 */
export type IServiceManifest<S extends string = 'singleton'> = ServiceManifestInterface<S>;

// Seals the registrations and hands the frozen snapshot to the resolution
// engine. NO frame is pre-opened — the returned provider is frameless. The closed
// memo starts empty and MUTABLE, created fresh per `build()` call so every scope
// frame of one provider tree shares it.
//
// The exported const is the standalone call surface; registering it installs the
// fluent `build()` onto the prototype.
export const ServiceManifestContainerBuilderAugmentations = {
  build(manifest: ServiceManifestClass<string>, options?: ServiceProviderOptions): IServiceProvider<string> {
    const { registrations, openRegistrations } = manifest.seal();
    return new ServiceProviderClass<string>(registrations as ReadonlyMap<Token, Registration[]>,
      openRegistrations as ReadonlyMap<Token, readonly OpenRegistration[]>, new Map<Token, readonly Registration[]>(),
      undefined, options);
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

// `build` shares its name with the throwing stub on `ServiceManifestClass`,
// which this fully supersedes: the strategy installs a dispatcher that always
// routes to the real one. Without a strategy the registry refuses the collision
// rather than silently clobbering the class's own member.
const containerBuilderMerge = { build(_stub, extension) {
  return function(this: ServiceManifestClass<string>, ...args: unknown[]) {
    return extension(this, ...args);
  };
} } satisfies MergeStrategies;

registerAugmentations(tokenfor<ServiceManifestInterface>(), ServiceManifestContainerBuilderAugmentations,
  containerBuilderMerge);

/**
 * The construct side of the public `ServiceManifest`: `new ServiceManifest<S>()`
 * builds a `ServiceManifestClass<S>`, whose `build()` this module supplied.
 */
export interface ServiceManifestCtor {
  new<S extends string = 'singleton'>(): IServiceManifest<S>;
}

export const ServiceManifest: ServiceManifestCtor = ServiceManifestClass;
