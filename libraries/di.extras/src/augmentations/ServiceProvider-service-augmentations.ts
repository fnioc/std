import { type AugmentationSet2, type IServiceProvider, Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';

type IServiceProviderServiceAugmentations = {
  /** The tokenless form of {@link IServiceProvider.getService}: `type` is derived from `T` instead
   * of taken explicitly. */
  getService<T>(): T | undefined;

  /** The tokenless form of {@link IServiceProvider.getRequiredService}: `serviceType` is derived
   * from `T` instead of taken explicitly. */
  getRequiredService<T>(): T;

  /** The tokenless form of {@link IServiceProvider.getServices}: `serviceType` is derived from
   * `T` instead of taken explicitly. */
  getServices<T>(): Iterable<T>;
};
declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends IServiceProviderServiceAugmentations {}
}
export const ServiceProviderServiceAugmentations: AugmentationSet2<IServiceProvider,
  IServiceProviderServiceAugmentations> = {
    getService<T>(this: IServiceProvider): T | undefined {
      return this.getService(typefor<T>());
    },
    getRequiredService<T>(this: IServiceProvider): T {
      return this.getRequiredService(typefor<T>());
    },
    getServices<T>(this: IServiceProvider): Iterable<T> {
      return this.getServices(typefor<T>());
    },
  };

registerAugmentations<IServiceProvider>(ServiceProviderServiceAugmentations);
