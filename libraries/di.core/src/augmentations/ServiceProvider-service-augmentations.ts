import { type IServiceProvider, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';

declare module '@rhombus-std/primitives' {
  interface IServiceProvider {
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
    getRequiredService(serviceType: Type): any;
    /**
     * Every registration of `serviceType`, as one sequence. Nothing registered is an empty
     * sequence rather than an absence, so this neither throws nor answers `undefined`.
     */
    getServices(serviceType: Type): Iterable<any>;
  }
}

registerAugmentations<IServiceProvider>({
  getRequiredService(this: IServiceProvider, serviceType: Type): any {
    const service = this.getService(serviceType);
    // `undefined` is what getService answers for a miss and nothing else, so it is the only
    // reading of absence available here — falsiness would swallow a registered `0` or `''`.
    if (service === undefined) {
      throw new Error(`nothing is registered for ${Type.stringify(serviceType)}.`);
    }
    return service;
  },
  getServices(this: IServiceProvider, serviceType: Type): Iterable<any> {
    return this.getService(Type.iterable(serviceType));
  },
});
