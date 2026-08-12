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
    getService<T>(provider: IServiceProvider): T | undefined {
      return provider.getService(typefor<T>());
    },
    getRequiredService<T>(provider: IServiceProvider): T {
      return provider.getRequiredService(typefor<T>());
    },
    getServices<T>(provider: IServiceProvider): Iterable<T> {
      return provider.getServices(typefor<T>());
    },
  };

registerAugmentations<IServiceProvider>(ServiceProviderServiceAugmentations);
