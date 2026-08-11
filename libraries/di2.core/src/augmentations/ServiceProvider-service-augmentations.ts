import { AugmentationSet2, registerAugmentations, Type } from '@rhombus-std/primitives';

type IServiceProviderServiceAugmentations = {
  getRequiredService(serviceType: Type): any;
  getServices(serviceType: Type): Iterabl;
};
declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends IServiceProviderServiceAugmentations {}
}
const ServiceProviderServiceAugmentations: AugmentationSet2<IServiceProvider, IServiceProviderServiceAugmentations> = {
  getRequiredService(provider: IServiceProvider, serviceType: Type): any {
    const service = provider.getService(serviceType);
    if (!service) {
      throw 'no service registered';
    }
    return service;
  },
  getServices(provider: IServiceProviderserviceType, serviceType: Type): Iterable<any> {
    return provider.getRequiredService(Type.named('Iterable', 'global', [serviceType]));
  },
};

registerAugmentations(tokenfor<IServiceProvider>(), ServiceProviderServiceAugmentations);
