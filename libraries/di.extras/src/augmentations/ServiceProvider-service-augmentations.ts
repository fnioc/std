import type { Flatten, IServiceProvider } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';

export namespace ServiceProviderServiceAugmentations {
  /** The tokenless form of {@link IServiceProvider.getService}: `type` is derived from `T` instead
   * of taken explicitly. */
  export function getService<T>(this: IServiceProvider): T | undefined {
    return this.getService(typefor<T>());
  }

  /** The tokenless form of {@link IServiceProvider.getRequiredService}: `serviceType` is derived
   * from `T` instead of taken explicitly. */
  export function getRequiredService<T>(this: IServiceProvider): T {
    return this.getRequiredService(typefor<T>());
  }

  /** The tokenless form of {@link IServiceProvider.getServices}: `serviceType` is derived from
   * `T` instead of taken explicitly. */
  export function getServices<T>(this: IServiceProvider): Iterable<T> {
    return this.getServices(typefor<T>());
  }
}

declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends Flatten<typeof ServiceProviderServiceAugmentations> {
    getService<T>(this: IServiceProvider): T | undefined;
    getRequiredService<T>(this: IServiceProvider): T;
    getServices<T>(this: IServiceProvider): Iterable<T>;
  }
}

registerAugmentations<IServiceProvider>(ServiceProviderServiceAugmentations);
