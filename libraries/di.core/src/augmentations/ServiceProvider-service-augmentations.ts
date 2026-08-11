import { type AugmentationSet2, type IServiceProvider, registerAugmentations, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { NotImplementedError } from '../Errors';

type IServiceProviderServiceAugmentations = {
  getRequiredService(serviceType: Type): any;
  getServices(serviceType: Type): Iterable<any>;
  isService(serviceType: Type): boolean;
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
    isService(_provider: IServiceProvider, _serviceType: Type): boolean {
      throw new NotImplementedError('IServiceProvider.isService');
    },
  };

registerAugmentations(typefor<IServiceProvider>(), ServiceProviderServiceAugmentations);
