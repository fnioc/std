import { type AbortSignal, type AugmentationSet2, registerAugmentations } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { IHost } from './IHost';
import type { IHostBuilder } from './IHostBuilder';

// Targets the package barrel rather than a relative path: a cross-package
// declare-module merge needs a specifier that still resolves after publish,
// and the barrel is the only one that works for both an in-repo and a
// published consumer.
type IHostBuilderStartAugmentations = {
  /**
   * Builds the host and starts it.
   *
   * @param abortSignal Cancels the start.
   */
  startHost(abortSignal?: AbortSignal): Promise<IHost>;
};

declare module '@rhombus-std/hosting.core' {
  interface IHostBuilder extends IHostBuilderStartAugmentations {}
}

/** Augmentation set for {@link IHostBuilder}; the member is also directly callable. */
export const HostBuilderStartAugmentations: AugmentationSet2<IHostBuilder, IHostBuilderStartAugmentations> = {
  async startHost(hostBuilder, abortSignal) {
    const host = hostBuilder.build();
    await host.start(abortSignal);
    return host;
  },
};

registerAugmentations(typefor<IHostBuilder>(), HostBuilderStartAugmentations);
