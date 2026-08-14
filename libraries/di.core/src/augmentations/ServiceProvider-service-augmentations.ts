import { type Flatten, type IServiceProvider, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';

export namespace ServiceProviderServiceAugmentations {
  /**
   * The value registered for `serviceType`, for a caller that treats its absence as a fault
   * rather than an answer.
   *
   * @remarks
   * Only absence raises. A registration whose value is falsy — `0`, `false`, `''` — is an answer
   * like any other and comes back untouched.
   *
   * @throws Error - when nothing is registered for `serviceType`.
   */
  export function getRequiredService(this: IServiceProvider, serviceType: Type): any {
    const service = this.getService(serviceType);
    // `undefined` is what getService answers for a miss and nothing else, so it is the only
    // reading of absence available here — falsiness would swallow a registered `0` or `''`.
    if (service === undefined) {
      throw new Error(`nothing is registered for ${Type.stringify(serviceType)}.`);
    }
    return service;
  }

  /**
   * Every registration of `serviceType`, as one sequence. Nothing registered is an empty
   * sequence rather than an absence, so this neither throws nor answers `undefined`.
   */
  export function getServices(this: IServiceProvider, serviceType: Type): Iterable<any> {
    return this.getService(Type.iterable(serviceType));
  }
}

declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends Flatten<typeof ServiceProviderServiceAugmentations> {
    getRequiredService(serviceType: Type): any;
    getServices(serviceType: Type): Iterable<any>;
  }
}

registerAugmentations<IServiceProvider>(ServiceProviderServiceAugmentations);
