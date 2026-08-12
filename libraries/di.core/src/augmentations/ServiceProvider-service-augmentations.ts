import { type AugmentationSet2, type IServiceProvider, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';

type IServiceProviderServiceAugmentations = {
  getRequiredService(serviceType: Type): any;
  getServices(serviceType: Type): Iterable<any>;
};
declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends IServiceProviderServiceAugmentations {}
}
export const ServiceProviderServiceAugmentations: AugmentationSet2<IServiceProvider,
  IServiceProviderServiceAugmentations> = {
    getRequiredService(provider: IServiceProvider, serviceType: Type): any {
      const service = provider.getService(serviceType);
      if (!service) {
        throw new Error(`nothing is registered for ${Type.stringify(serviceType)}.`);
      }
      return service;
    },
    getServices(provider: IServiceProvider, serviceType: Type): Iterable<any> {
      return provider.getRequiredService(Type.named('Iterable', 'global', [serviceType]));
    },
  };

registerAugmentations<IServiceProvider>(ServiceProviderServiceAugmentations);
