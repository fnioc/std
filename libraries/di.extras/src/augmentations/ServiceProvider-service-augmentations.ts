import type { IServiceProvider } from '@rhombus-std/primitives';
import { registerInlineBodies, typefor } from '@rhombus-std/primitives.extras';

declare module '@rhombus-std/primitives' {
  interface IServiceProvider {
    /**
     * The value registered for `ServiceType`, the service type derived from the type argument
     * instead of taken explicitly, or `undefined` when nothing is registered for it.
     */
    getService<ServiceType>(): ServiceType | undefined;
    /**
     * The value registered for `ServiceType`, the service type derived from the type argument
     * instead of taken explicitly, for a caller that treats its absence as a fault rather than
     * an answer.
     */
    getRequiredService<ServiceType>(): ServiceType;
    /**
     * Every registration of `ServiceType`, the service type derived from the type argument
     * instead of taken explicitly, as one sequence.
     */
    getServices<ServiceType>(): Iterable<ServiceType>;
  }
}

export const ServiceProviderServiceAugmentations = {
  getService<ServiceType>(this: IServiceProvider): ServiceType | undefined {
    return this.getService(typefor<ServiceType>());
  },
  getRequiredService<ServiceType>(this: IServiceProvider): ServiceType {
    return this.getRequiredService(typefor<ServiceType>());
  },
  getServices<ServiceType>(this: IServiceProvider): Iterable<ServiceType> {
    return this.getServices(typefor<ServiceType>());
  },
};
registerInlineBodies<IServiceProvider>(ServiceProviderServiceAugmentations);
