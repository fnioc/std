import { type AugmentationSet2, type IServiceProvider, Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';

type IServiceProviderServiceAugmentations = {
  getService<T>(): T | undefined;
  getRequiredService<T>(): T;
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
