import { type ConstructorType, type FunctionType, type IServiceProvider, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { invokerAddress } from '../Invoker.js';

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
    /** The value registered for `serviceType`, or `undefined` if nothing is registered for it. */
    resolve(serviceType: Type): any;
    /**
     * Constructs `ctor` fresh, its dependencies resolved from `ctorType` — `ctor`'s own parameter
     * types, in order, the same shape {@link ConstructorType} carries for any other registered
     * constructor.
     *
     * @remarks
     * Nothing here is registered or cached: two calls build two instances, even for a `ctor`
     * separately registered elsewhere under its own address.
     */
    resolve<R>(ctorType: ConstructorType, ctor: Ctor<any[], R>): R;
    /**
     * Calls `func`, its dependencies resolved from `funcType` — `func`'s own parameter types, in
     * order, the same shape {@link FunctionType} carries for any other registered factory.
     *
     * @remarks
     * Nothing here is registered or cached: two calls build two results, even for a `func`
     * separately registered elsewhere under its own address.
     */
    resolve<R>(funcType: FunctionType, func: Func<any[], R>): R;
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

registerAugmentations<IServiceProvider>({
  resolve(this: IServiceProvider, serviceType: Type): any {
    return this.getService(serviceType);
  },
});

registerAugmentations<IServiceProvider>({
  resolve<R>(this: IServiceProvider, ctorType: ConstructorType, ctor: Ctor<any[], R>): R {
    const invoke = this.getService(invokerAddress(ctorType));
    if (invoke === undefined) {
      throw new Error(`nothing can invoke ${Type.stringify(ctorType)}.`);
    }
    return invoke(ctor);
  },
});

registerAugmentations<IServiceProvider>({
  resolve<R>(this: IServiceProvider, funcType: FunctionType, func: Func<any[], R>): R {
    const invoke = this.getService(invokerAddress(funcType));
    if (invoke === undefined) {
      throw new Error(`nothing can invoke ${Type.stringify(funcType)}.`);
    }
    return invoke(func);
  },
});
