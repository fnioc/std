import { type ConstructorType, type FunctionType, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/types';
import { invokerAddress } from '../Invoker.js';
import type { IServiceProvider } from '../IServiceProvider.js';

declare module '@rhombus-std/di.core' {
  interface IServiceProvider {
    /**
     * The value registered for `address`.
     *
     * @throws UnsatisfiableError - when nothing can produce `address`.
     */
    resolve(address: Type): unknown;
    /**
     * The value registered for `address`, or `undefined` once nothing can produce it.
     *
     * @remarks
     * Asks for `address | undefined`, where the `undefined` literal orders last, so it answers
     * only after `address` itself has been tried and found unbuildable.
     */
    tryResolve(address: Type): unknown;
    /** Every registration of `address`, oldest first, as one array. */
    resolveArray(address: Type): unknown[];
    /**
     * Every registration of `address`, oldest first, as one sequence. Nothing registered is an
     * empty sequence rather than an absence, so this neither throws nor answers `undefined`.
     */
    resolveIterable(address: Type): Iterable<unknown>;
    /**
     * The value registered for `address`, delivered asynchronously: every dependency beneath it
     * that arrives as a promise is awaited before the value is handed over.
     *
     * @remarks
     * A `Promise<address>` registration answers this ask directly; on a miss an `address`
     * registration answers it instead.
     *
     * @throws UnsatisfiableError - when nothing can produce `address`.
     */
    resolveAsync(address: Type): Promise<unknown>;
    /** The value registered for `address`, delivered asynchronously, settling on `undefined` once nothing can produce it. */
    tryResolveAsync(address: Type): Promise<unknown | undefined>;
    /** Every registration of `address` as one array, delivered asynchronously. */
    resolveArrayAsync(address: Type): Promise<unknown[]>;
    /** Every registration of `address` as one sequence, delivered asynchronously. */
    resolveIterableAsync(address: Type): Promise<Iterable<unknown>>;
    /**
     * Every registration of `address`, each element awaited as the walk reaches it rather than
     * the whole sequence up front.
     */
    resolveAsyncIterable(address: Type): AsyncIterable<unknown>;
    // Sugar only: its rest parameter would swallow any (funcType, ...args) call, so these can't bind.
    // resolveWith(funcType: FunctionType, ...args: unknown[]): unknown;
    // tryResolveWith(funcType: FunctionType, ...args: unknown[]): unknown;
    // resolveWithAsync(funcType: FunctionType, ...args: unknown[]): Promise<unknown>;
    // tryResolveWithAsync(funcType: FunctionType, ...args: unknown[]): Promise<unknown | undefined>;
    /**
     * Constructs `ctor` fresh, its dependencies resolved from `ctorType` — `ctor`'s own arg
     * types, in order, the same shape {@link ConstructorType} carries for any other registered
     * constructor.
     *
     * @remarks
     * Nothing here is registered or cached: two calls build two instances, even for a `ctor`
     * separately registered elsewhere under its own address.
     */
    instantiate<R>(ctorType: ConstructorType, ctor: Ctor<any[], R>): R;
    /** {@link IServiceProvider.instantiate}, answering `undefined` once a dependency of `ctorType` cannot be produced. */
    tryInstantiate<R>(ctorType: ConstructorType, ctor: Ctor<any[], R>): R | undefined;
    /**
     * Calls `func`, its dependencies resolved from `funcType` — `func`'s own arg types, in
     * order, the same shape {@link FunctionType} carries for any other registered factory.
     *
     * @remarks
     * Nothing here is registered or cached: two calls build two results, even for a `func`
     * separately registered elsewhere under its own address.
     */
    invoke<R>(funcType: FunctionType, func: Func<any[], R>): R;
    /** {@link IServiceProvider.invoke}, answering `undefined` once a dependency of `funcType` cannot be produced. */
    tryInvoke<R>(funcType: FunctionType, func: Func<any[], R>): R | undefined;
  }
}

registerAugmentations<IServiceProvider>({
  resolve(this: IServiceProvider, address: Type): unknown {
    return this.getService(address);
  },
});

registerAugmentations<IServiceProvider>({
  tryResolve(this: IServiceProvider, address: Type): unknown {
    return this.resolve(Type.optional(address));
  },
  resolveArray(this: IServiceProvider, address: Type): unknown[] {
    return this.resolve(Type.array(address)) as unknown[];
  },
  resolveIterable(this: IServiceProvider, address: Type): Iterable<unknown> {
    return this.resolve(Type.iterable(address)) as Iterable<unknown>;
  },
  resolveAsync(this: IServiceProvider, address: Type): Promise<unknown> {
    return this.resolve(Type.promise(address)) as Promise<unknown>;
  },
  tryResolveAsync(this: IServiceProvider, address: Type): Promise<unknown | undefined> {
    return this.resolveAsync(Type.optional(address));
  },
  resolveArrayAsync(this: IServiceProvider, address: Type): Promise<unknown[]> {
    return this.resolveAsync(Type.array(address)) as Promise<unknown[]>;
  },
  resolveIterableAsync(this: IServiceProvider, address: Type): Promise<Iterable<unknown>> {
    return this.resolveAsync(Type.iterable(address)) as Promise<Iterable<unknown>>;
  },
  resolveAsyncIterable(this: IServiceProvider, address: Type): AsyncIterable<unknown> {
    return this.resolve(Type.global('AsyncIterable', [address])) as AsyncIterable<unknown>;
  },
});

registerAugmentations<IServiceProvider>({
  instantiate<R>(this: IServiceProvider, ctorType: ConstructorType, ctor: Ctor<any[], R>): R {
    return (this.resolve(invokerAddress(ctorType)) as Func<[Ctor<any[], R>], R>)(ctor);
  },
  tryInstantiate<R>(this: IServiceProvider, ctorType: ConstructorType, ctor: Ctor<any[], R>): R | undefined {
    return (this.tryResolve(invokerAddress(ctorType)) as Func<[Ctor<any[], R>], R> | undefined)?.(ctor);
  },
  invoke<R>(this: IServiceProvider, funcType: FunctionType, func: Func<any[], R>): R {
    return (this.resolve(invokerAddress(funcType)) as Func<[Func<any[], R>], R>)(func);
  },
  tryInvoke<R>(this: IServiceProvider, funcType: FunctionType, func: Func<any[], R>): R | undefined {
    return (this.tryResolve(invokerAddress(funcType)) as Func<[Func<any[], R>], R> | undefined)?.(func);
  },
});
