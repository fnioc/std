import { type Manifest } from '@rhombus-std/di2.core';
import { type AugmentationSet2, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { ServiceProvider } from './ServiceProvider.js';
import { ServiceProviderOptions } from './ServiceProviderOptions.js';

declare module '@rhombus-std/di2.core' {
  interface Manifest<Scopes extends string> extends IManifestContainerBuilderAugmentations<Scopes> {}
}

/** Sealing a manifest into the provider that resolves against it. */
export type IManifestContainerBuilderAugmentations<Scopes extends string> = {
  /** Builds a provider over these registrations, with every {@link ServiceProviderOptions} default. */
  build(): ServiceProvider;
  build(options: ServiceProviderOptions): ServiceProvider;
};

type IManifestContainerBuilderAugmentationsImpl = {
  build(options?: ServiceProviderOptions): ServiceProvider;
};

export const ManifestContainerBuilderAugmentations: AugmentationSet2<
  Manifest,
  IManifestContainerBuilderAugmentationsImpl
> = {
  build(manifest, ...args) {
    const [options] = args;
    return new ServiceProvider(manifest, options ?? ServiceProviderOptions.defaults);
  },
};

registerAugmentations(tokenfor<Manifest>(), ManifestContainerBuilderAugmentations);
