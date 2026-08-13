import { type AugmentationSet2, type IServiceProvider, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

type IServiceProviderServiceSugarAugmentations = {
  getService<T>(): T | undefined;
  getRequiredService<T>(): T;
  getServices<T>(): Iterable<T>;
};
declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends IServiceProviderServiceSugarAugmentations {}
}
export const ServiceProviderServiceAugmentations: AugmentationSet2<IServiceProvider,
  IServiceProviderServiceSugarAugmentations> = {
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
