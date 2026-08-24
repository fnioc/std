import { type ConstructorType, type FunctionType, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { invokerAddress } from '../Invoker.js';
import type { IServiceProvider } from '../IServiceProvider.js';

declare module '@rhombus-std/di.core' {
  interface IServiceProvider {
    /**
     * Every registration of `serviceType`, as one sequence. Nothing registered is an empty
     * sequence rather than an absence, so this neither throws nor answers `undefined`.
     */
    resolveMany(serviceType: Type): Iterable<any>;
    /**
     * The value registered for `serviceType`.
     *
     * @throws UnsatisfiableError - when nothing can produce `serviceType`.
     */
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
  resolveMany(this: IServiceProvider, serviceType: Type): Iterable<any> {
    return this.resolve(Type.iterable(serviceType));
  },
});

registerAugmentations<IServiceProvider>({
  resolve(this: IServiceProvider, serviceType: Type): any {
    return this.getService(serviceType);
  },
});

registerAugmentations<IServiceProvider>({
  resolve<R>(this: IServiceProvider, ctorType: ConstructorType, ctor: Ctor<any[], R>): R {
    return this.resolve(invokerAddress(ctorType))(ctor);
  },
});

registerAugmentations<IServiceProvider>({
  resolve<R>(this: IServiceProvider, funcType: FunctionType, func: Func<any[], R>): R {
    return this.resolve(invokerAddress(funcType))(func);
  },
});
