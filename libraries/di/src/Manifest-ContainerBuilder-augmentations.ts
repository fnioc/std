import { type Manifest } from '@rhombus-std/di.core';
import type { AugmentationSet2 } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { ServiceProvider } from './ServiceProvider.js';
import { ServiceProviderOptions } from './ServiceProviderOptions.js';

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends IManifestContainerBuilderAugmentations<Scopes> {}
}

/** Sealing a manifest into the provider that resolves against it. */
type IManifestContainerBuilderAugmentations<Scopes extends string> = {
  /** Builds a provider over these registrations, with every {@link ServiceProviderOptions} default. */
  build(): ServiceProvider;
  /** Builds a provider over these registrations, using `options` in place of the defaults. */
  build(options: ServiceProviderOptions): ServiceProvider;
};

type IManifestContainerBuilderAugmentationsImpl = {
  build(options?: ServiceProviderOptions): ServiceProvider;
};

/** Installs {@link IManifestContainerBuilderAugmentations.build} onto every {@link Manifest}. */
export const ManifestContainerBuilderAugmentations: AugmentationSet2<
  Manifest,
  IManifestContainerBuilderAugmentationsImpl
> = {
  build(...args) {
    const [options] = args;
    return new ServiceProvider(this, options ?? ServiceProviderOptions.defaults);
  },
};

registerAugmentations<Manifest>(ManifestContainerBuilderAugmentations);
