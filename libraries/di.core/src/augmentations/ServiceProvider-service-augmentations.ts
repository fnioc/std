import { type ConstructorType, type FunctionType, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { invokerAddress } from '../Invoker.js';
import type { IServiceProvider } from '../IServiceProvider.js';

declare module '@rhombus-std/di.core' {
  interface IServiceProvider {
    /**
     * Every registration of `address`, as one sequence. Nothing registered is an empty
     * sequence rather than an absence, so this neither throws nor answers `undefined`.
     */
    resolveMany(address: Type): Iterable<any>;
    /**
     * The value registered for `address`.
     *
     * @throws UnsatisfiableError - when nothing can produce `address`.
     */
    resolve(address: Type): any;
    /**
     * The value registered for `address`, delivered asynchronously: every dependency beneath it
     * that arrives as a promise is awaited before the value is handed over.
     *
     * @remarks
     * Equivalent to asking for `Promise<address>` through {@link resolve}, and the same registration
     * answers either spelling.
     *
     * @throws UnsatisfiableError - when nothing can produce `address`.
     */
    resolveAsync(address: Type): Promise<any>;
    /**
     * Constructs `ctor` fresh, its dependencies resolved from `ctorType` — `ctor`'s own arg
     * types, in order, the same shape {@link ConstructorType} carries for any other registered
     * constructor.
     *
     * @remarks
     * Nothing here is registered or cached: two calls build two instances, even for a `ctor`
     * separately registered elsewhere under its own address.
     */
    resolve<R>(ctorType: ConstructorType, ctor: Ctor<any[], R>): R;
    /**
     * Calls `func`, its dependencies resolved from `funcType` — `func`'s own arg types, in
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
  resolveMany(this: IServiceProvider, address: Type): Iterable<any> {
    return this.resolve(Type.iterable(address));
  },
});

registerAugmentations<IServiceProvider>({
  resolve(this: IServiceProvider, address: Type): any {
    return this.getService(address);
  },
});

registerAugmentations<IServiceProvider>({
  resolveAsync(this: IServiceProvider, address: Type): Promise<any> {
    return this.resolve(Type.global('Promise', [address]));
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
