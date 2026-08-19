import { type Manifest } from '@rhombus-std/di.core';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import { ServiceProvider } from '../ServiceProvider.js';
import { ServiceProviderOptions } from '../ServiceProviderOptions.js';

/** Sealing a manifest into the provider that resolves against it. */
export namespace ManifestContainerBuilderAugmentations {
  /** Builds a provider over these registrations, with every {@link ServiceProviderOptions} default. */
  export function build(this: Manifest<any>): ServiceProvider;
  /** Builds a provider over these registrations, using `options` in place of the defaults. */
  export function build(this: Manifest<any>, options: ServiceProviderOptions): ServiceProvider;
  export function build(this: Manifest<any>, options?: ServiceProviderOptions): ServiceProvider {
    return new ServiceProvider(this, options ?? ServiceProviderOptions.defaults);
  }
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends Flatten<typeof ManifestContainerBuilderAugmentations> {}
}

registerAugmentations<Manifest<any>>(ManifestContainerBuilderAugmentations);
