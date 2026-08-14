import { type AbortSignal, type Flatten } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { IHost } from './IHost';
import type { IHostBuilder } from './IHostBuilder';

export namespace HostBuilderStartAugmentations {
  /**
   * Builds the host and starts it.
   *
   * @param abortSignal Cancels the start.
   */
  export async function startHost(this: IHostBuilder, abortSignal?: AbortSignal): Promise<IHost> {
    const host = this.build();
    await host.start(abortSignal);
    return host;
  }
}

// Targets the package barrel rather than a relative path: a cross-package
// declare-module merge needs a specifier that still resolves after publish,
// and the barrel is the only one that works for both an in-repo and a
// published consumer.
declare module '@rhombus-std/hosting.core' {
  interface IHostBuilder extends Flatten<typeof HostBuilderStartAugmentations> {}
}

registerAugmentations<IHostBuilder>(HostBuilderStartAugmentations);
