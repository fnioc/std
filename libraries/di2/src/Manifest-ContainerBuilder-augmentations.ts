import { type IManifest } from '@rhombus-std/di2.core';
import { type AugmentationSet2, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { ServiceProvider } from './ServiceProvider.js';
import { ServiceProviderOptions } from './ServiceProviderOptions.js';

declare module '@rhombus-std/di2.core' {
  interface IManifest<Scopes extends string> extends IManifestContainerBuilderAugmentations<Scopes> {}
}

/** Sealing a manifest into the provider that resolves against it. */
export type IManifestContainerBuilderAugmentations<Scopes extends string> = {
  /** Builds a provider over these registrations, with every {@link ServiceProviderOptions} default. */
  buildServiceProvider(): ServiceProvider;
  buildServiceProvider(options: ServiceProviderOptions): ServiceProvider;
};

// Decoupled from the public overloads above: `AugmentationSet2` reads each member's params
// through `Parameters<Impl[K]>`, which sees only the LAST arm of a genuinely overloaded
// signature. Here the two arms differ by arity alone, so one optional parameter carries both
// (a union-of-tuples rest -- what an arms-differ-by-type member needs -- would instead widen
// into a single tuple whose FIRST element unions the receiver with the option bag).
type IManifestContainerBuilderAugmentationsImpl = {
  buildServiceProvider(options?: ServiceProviderOptions): ServiceProvider;
};

export const ManifestContainerBuilderAugmentations: AugmentationSet2<
  IManifest,
  IManifestContainerBuilderAugmentationsImpl
> = {
  buildServiceProvider(manifest, ...args) {
    const [options] = args;
    return new ServiceProvider(manifest, options ?? ServiceProviderOptions.defaults);
  },
};

registerAugmentations(tokenfor<IManifest>(), ManifestContainerBuilderAugmentations);
