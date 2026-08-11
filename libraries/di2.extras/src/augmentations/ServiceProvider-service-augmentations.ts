import { AugmentationSet2, registerAugmentations, Type } from '@rhombus-std/primitives';

type IServiceProviderServiceAugmentations = {
  getService<T>(): T | undefined;
  getRequiredService<T>(): T;
  getServices<T>(): Iterable<T>;
};
declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends IServiceProviderServiceAugmentations {}
}
const ServiceProviderServiceAugmentations: AugmentationSet2<IServiceProvider, IServiceProviderServiceAugmentations> = {
  getService<T>(provider: IServiceProvider): T | undefined {
    return provider.getService(tokenfor<T>());
  },
  getRequiredService<T>(provider: IServiceProvider): T {
    return provider.getRequiredService(tokenfor<T>());
  },
  getServices<T>(provider: IServiceProvider): Iterable<T> {
    return provider.getServices(tokenfor<T>());
  },
};

registerAugmentations(tokenfor<IServiceProvider>(), ServiceProviderServiceAugmentations);
