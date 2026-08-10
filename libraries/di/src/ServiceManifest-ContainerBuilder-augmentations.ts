// The engine-constructing half of `build()`.
//
// The registration collection `ServiceManifestClass` lives in the abstractions
// package `@rhombus-std/di.core` and ships WITHOUT a working `build()` -- it has
// no access to the resolution engine. Registering the set below against the OPEN
// `ServiceManifest` token (the same token `addOptions`/`addLogging`/... target)
// installs the real one onto the class's prototype, so importing
// `@rhombus-std/di` makes `new ServiceManifest().build()` produce a live provider
// as an import-time side effect.

import { type IServiceManifest, type IServiceProvider, type OpenRegistration, type Registration, ServiceManifestClass,
  type ServiceProviderOptions, type Token } from '@rhombus-std/di.core';
import { type AugmentationSet2, type Flatten, type MergeStrategies,
  registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';

import { ServiceProviderClass } from './ServiceProviderClass.js';

/**
 * `build` has no interface-side merge: `ServiceManifestClass` already declares
 * the name, as the throwing stub this supersedes, so the members below reach a
 * caller through the existing declaration rather than a second one.
 */
interface IServiceManifestContainerBuilderAugmentations {
  build(options?: ServiceProviderOptions): IServiceProvider<string>;
}

// Seals the registrations and hands the frozen snapshot to the resolution
// engine. NO frame is pre-opened -- the returned provider is frameless. The
// closed memo starts empty and MUTABLE, created fresh per `build()` call so
// every scope frame of one provider tree shares it.
//
// The exported const is the standalone call surface; registering it installs the
// fluent `build()` onto the prototype.
export const ServiceManifestContainerBuilderAugmentations: AugmentationSet2<ServiceManifestClass<string>,
  Flatten<IServiceManifestContainerBuilderAugmentations>> = {
    build(manifest, options) {
      const { registrations, openRegistrations } = manifest.seal();
      return new ServiceProviderClass<string>(registrations as ReadonlyMap<Token, Registration[]>,
        openRegistrations as ReadonlyMap<Token, readonly OpenRegistration[]>, new Map<Token, readonly Registration[]>(),
        undefined, options);
    },
  };

// `build` shares its name with the throwing stub on `ServiceManifestClass`,
// which this fully supersedes: the strategy installs a dispatcher that always
// routes to the real one. Without a strategy the registry refuses the collision
// rather than silently clobbering the class's own member.
const containerBuilderMerge = { build(_stub, incoming) {
  return function(this: ServiceManifestClass<string>, ...args: unknown[]) {
    return incoming(this, ...args);
  };
} } satisfies MergeStrategies;

registerAugmentations(tokenfor<IServiceManifest>(), ServiceManifestContainerBuilderAugmentations,
  containerBuilderMerge);
