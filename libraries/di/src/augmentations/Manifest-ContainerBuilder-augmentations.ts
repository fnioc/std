import { type Manifest } from '@rhombus-std/di.core';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { ServiceProvider } from '../ServiceProvider.js';
import { ServiceProviderOptions } from '../ServiceProviderOptions.js';

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes> {
    /** Builds a provider over these registrations, with every {@link ServiceProviderOptions} default. */
    build(): ServiceProvider;
    /** Builds a provider over these registrations, using `options` in place of the defaults. */
    build(options: ServiceProviderOptions): ServiceProvider;
  }
}

registerAugmentations<Manifest<any>>({
  build(this: Manifest<any>, options?: ServiceProviderOptions): ServiceProvider {
    return new ServiceProvider(this, options ?? ServiceProviderOptions.defaults);
  },
});
