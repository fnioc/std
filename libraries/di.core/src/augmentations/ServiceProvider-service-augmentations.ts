import { type AugmentationSet2, type IServiceProvider, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';

type IServiceProviderServiceAugmentations = {
  /** @throws Error - when nothing is registered for `serviceType`. */
  getRequiredService(serviceType: Type): any;

  /**
   * Every registration of `serviceType`, as one sequence. Nothing registered is an empty
   * sequence rather than an absence, so this neither throws nor answers `undefined`.
   */
  getServices(serviceType: Type): Iterable<any>;
};
declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends IServiceProviderServiceAugmentations {}
}
export const ServiceProviderServiceAugmentations: AugmentationSet2<IServiceProvider,
  IServiceProviderServiceAugmentations> = {
    getRequiredService(serviceType: Type): any {
      const service = this.getService(serviceType);
      if (!service) {
        throw new Error(`nothing is registered for ${Type.stringify(serviceType)}.`);
      }
      return service;
    },
    getServices(serviceType: Type): Iterable<any> {
      return this.getService(Type.iterable(serviceType));
    },
  };

registerAugmentations<IServiceProvider>(ServiceProviderServiceAugmentations);
