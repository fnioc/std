import type { IServiceProvider } from '@rhombus-std/di.core';
import { registerInlineBodies, typefor } from '@rhombus-std/primitives.extras';

declare module '@rhombus-std/di.core' {
  interface IServiceProvider {
    /**
     * The value registered for `ServiceType`, the service type derived from the type argument
     * instead of taken explicitly.
     *
     * @throws UnsatisfiableError - when nothing can produce `ServiceType`.
     */
    resolve<ServiceType>(): ServiceType;
    /**
     * Every registration of `ServiceType`, the service type derived from the type argument
     * instead of taken explicitly, as one sequence.
     */
    resolveMany<ServiceType>(): Iterable<ServiceType>;
  }
}

export const ServiceProviderServiceAugmentations = {
  resolve<ServiceType>(this: IServiceProvider): ServiceType {
    return this.resolve(typefor<ServiceType>());
  },
  resolveMany<ServiceType>(this: IServiceProvider): Iterable<ServiceType> {
    return this.resolveMany(typefor<ServiceType>());
  },
};
registerInlineBodies<IServiceProvider>(ServiceProviderServiceAugmentations);
