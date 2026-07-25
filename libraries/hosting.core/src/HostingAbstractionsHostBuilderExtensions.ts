import { type AbortSignal, type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { IHost } from './IHost';
import type { IHostBuilder } from './IHostBuilder';

// Targets the package barrel rather than a relative path: a cross-package
// declare-module merge needs a specifier that still resolves after publish,
// and the barrel is the only one that works for both an in-repo and a
// published consumer.
declare module '@rhombus-std/hosting.core' {
  interface IHostBuilder {
    startHost(abortSignal?: AbortSignal): Promise<IHost>;
  }
}

/** Augmentation set for {@link IHostBuilder}; the member is also directly callable. */
export const HostingAbstractionsHostBuilderExtensions = {
  /**
   * Builds the host and starts it.
   *
   * @param abortSignal Cancels the start.
   */
  async startHost(hostBuilder: IHostBuilder, abortSignal?: AbortSignal): Promise<IHost> {
    const host = hostBuilder.build();
    await host.start(abortSignal);
    return host;
  },
} satisfies AugmentationSet<IHostBuilder>;

registerAugmentations(tokenfor<IHostBuilder>(), HostingAbstractionsHostBuilderExtensions);
