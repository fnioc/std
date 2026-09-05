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
    resolve(address: Type): any;
    /**
     * The value registered for `address`, or `undefined` once nothing can produce it.
     *
     * @remarks
     * Asks for `address | undefined`, where the `undefined` literal orders last, so it answers
     * only after `address` itself has been tried and found unbuildable.
     */
    tryResolve(address: Type): any;
    /** Every registration of `address`, oldest first, as one array. */
    resolveArray(address: Type): any[];
    /**
     * Every registration of `address` as one array, or `undefined` once nothing can produce that.
     *
     * @remarks
     * An aggregate with no registrations is empty rather than absent, so the `undefined` answer
     * belongs to an `address` no aggregate can be built over at all.
     */
    tryResolveArray(address: Type): any[] | undefined;
    /**
     * Every registration of `address`, oldest first, as one sequence. Nothing registered is an
     * empty sequence rather than an absence, so this neither throws nor answers `undefined`.
     */
    resolveIterable(address: Type): Iterable<any>;
    /** Every registration of `address` as one sequence, or `undefined` once nothing can produce that. */
    tryResolveIterable(address: Type): Iterable<any> | undefined;
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
    resolveAsync(address: Type): Promise<any>;
    /** The value registered for `address`, delivered asynchronously, settling on `undefined` once nothing can produce it. */
    tryResolveAsync(address: Type): Promise<any>;
    /** Every registration of `address` as one array, delivered asynchronously. */
    resolveArrayAsync(address: Type): Promise<any[]>;
    /** Every registration of `address` as one array, delivered asynchronously, settling on `undefined` once nothing can produce that. */
    tryResolveArrayAsync(address: Type): Promise<any[] | undefined>;
    /** Every registration of `address` as one sequence, delivered asynchronously. */
    resolveIterableAsync(address: Type): Promise<Iterable<any>>;
    /** Every registration of `address` as one sequence, delivered asynchronously, settling on `undefined` once nothing can produce that. */
    tryResolveIterableAsync(address: Type): Promise<Iterable<any> | undefined>;
    /**
     * Every registration of `address`, each element awaited as the walk reaches it rather than
     * the whole sequence up front.
     */
    resolveAsyncIterable(address: Type): AsyncIterable<any>;
    /** Every registration of `address` as one awaited walk, or `undefined` once nothing can produce that. */
    tryResolveAsyncIterable(address: Type): AsyncIterable<any> | undefined;
    /**
     * Calls the callable registered for `address` with `args`, handing back what it returns.
     *
     * @throws UnsatisfiableError - when nothing can produce `address`.
     */
    resolveWith(address: Type, ...args: any[]): any;
    /** Calls the callable registered for `address` with `args`, or answers `undefined` once nothing can produce it. */
    tryResolveWith(address: Type, ...args: any[]): any;
    /**
     * Calls the promise-returning callable registered for `address` with `args`, handing back
     * what it returns.
     *
     * @throws UnsatisfiableError - when nothing can produce `address`.
     */
    resolveWithAsync(address: Type, ...args: any[]): Promise<any>;
    /** Calls the promise-returning callable registered for `address` with `args`, settling on `undefined` once nothing can produce it. */
    tryResolveWithAsync(address: Type, ...args: any[]): Promise<any>;
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
  resolve(this: IServiceProvider, address: Type): any {
    return this.getService(address);
  },
});

registerAugmentations<IServiceProvider>({
  tryResolve(this: IServiceProvider, address: Type): any {
    return this.resolve(Type.union(address, Type.typeLiteral(undefined)));
  },
  resolveArray(this: IServiceProvider, address: Type): any[] {
    return this.resolve(Type.array(address));
  },
  tryResolveArray(this: IServiceProvider, address: Type): any[] | undefined {
    return this.tryResolve(Type.array(address));
  },
  resolveIterable(this: IServiceProvider, address: Type): Iterable<any> {
    return this.resolve(Type.iterable(address));
  },
  tryResolveIterable(this: IServiceProvider, address: Type): Iterable<any> | undefined {
    return this.tryResolve(Type.iterable(address));
  },
  resolveAsync(this: IServiceProvider, address: Type): Promise<any> {
    return this.resolve(Type.promise(address));
  },
  tryResolveAsync(this: IServiceProvider, address: Type): Promise<any> {
    return this.resolveAsync(Type.union(address, Type.typeLiteral(undefined)));
  },
  resolveArrayAsync(this: IServiceProvider, address: Type): Promise<any[]> {
    return this.resolveAsync(Type.array(address));
  },
  tryResolveArrayAsync(this: IServiceProvider, address: Type): Promise<any[] | undefined> {
    return this.resolveAsync(Type.union(Type.array(address), Type.typeLiteral(undefined)));
  },
  resolveIterableAsync(this: IServiceProvider, address: Type): Promise<Iterable<any>> {
    return this.resolveAsync(Type.iterable(address));
  },
  tryResolveIterableAsync(this: IServiceProvider, address: Type): Promise<Iterable<any> | undefined> {
    return this.resolveAsync(Type.union(Type.iterable(address), Type.typeLiteral(undefined)));
  },
  resolveAsyncIterable(this: IServiceProvider, address: Type): AsyncIterable<any> {
    return this.resolve(Type.global('AsyncIterable', [address]));
  },
  tryResolveAsyncIterable(this: IServiceProvider, address: Type): AsyncIterable<any> | undefined {
    return this.tryResolve(Type.global('AsyncIterable', [address]));
  },
});

registerAugmentations<IServiceProvider>({
  resolveWith(this: IServiceProvider, address: Type, ...args: any[]): any {
    return this.resolve(address)(...args);
  },
  tryResolveWith(this: IServiceProvider, address: Type, ...args: any[]): any {
    return this.tryResolve(address)?.(...args);
  },
  resolveWithAsync(this: IServiceProvider, address: Type, ...args: any[]): Promise<any> {
    return this.resolve(address)(...args);
  },
  async tryResolveWithAsync(this: IServiceProvider, address: Type, ...args: any[]): Promise<any> {
    return this.tryResolve(address)?.(...args);
  },
});

registerAugmentations<IServiceProvider>({
  instantiate<R>(this: IServiceProvider, ctorType: ConstructorType, ctor: Ctor<any[], R>): R {
    return this.resolve(invokerAddress(ctorType))(ctor);
  },
  tryInstantiate<R>(this: IServiceProvider, ctorType: ConstructorType, ctor: Ctor<any[], R>): R | undefined {
    return this.tryResolve(invokerAddress(ctorType))?.(ctor);
  },
  invoke<R>(this: IServiceProvider, funcType: FunctionType, func: Func<any[], R>): R {
    return this.resolve(invokerAddress(funcType))(func);
  },
  tryInvoke<R>(this: IServiceProvider, funcType: FunctionType, func: Func<any[], R>): R | undefined {
    return this.tryResolve(invokerAddress(funcType))?.(func);
  },
});
