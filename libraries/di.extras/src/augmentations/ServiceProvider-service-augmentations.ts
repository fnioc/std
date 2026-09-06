import type { IServiceProvider } from '@rhombus-std/di.core';
import type { AugmentationSet } from '@rhombus-std/primitives';
import { registerInlineBodies, typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/types';

declare module '@rhombus-std/di.core' {
  interface IServiceProvider {
    /**
     * The value registered for `ServiceType`, the service type derived from the type argument
     * instead of taken explicitly.
     *
     * @throws UnsatisfiableError - when nothing can produce `ServiceType`.
     */
    resolve<ServiceType>(): ServiceType;
    /** The value registered for `ServiceType`, the service type derived from the type argument instead of taken explicitly, or `undefined` once nothing can produce it. */
    tryResolve<ServiceType>(): ServiceType | undefined;
    /** Every registration of `ServiceType`, the service type derived from the type argument instead of taken explicitly, as one array. */
    resolveArray<ServiceType>(): ServiceType[];
    /**
     * Every registration of `ServiceType`, the service type derived from the type argument
     * instead of taken explicitly, as one sequence.
     */
    resolveIterable<ServiceType>(): Iterable<ServiceType>;
    /**
     * The value registered for `ServiceType`, the service type derived from the type argument
     * instead of taken explicitly, delivered asynchronously — every dependency beneath it that
     * arrives as a promise is awaited before the value is handed over.
     *
     * @throws UnsatisfiableError - when nothing can produce `ServiceType`.
     */
    resolveAsync<ServiceType>(): Promise<ServiceType>;
    /** The value registered for `ServiceType`, delivered asynchronously, settling on `undefined` once nothing can produce it. */
    tryResolveAsync<ServiceType>(): Promise<ServiceType | undefined>;
    /** Every registration of `ServiceType` as one array, delivered asynchronously. */
    resolveArrayAsync<ServiceType>(): Promise<ServiceType[]>;
    /** Every registration of `ServiceType` as one sequence, delivered asynchronously. */
    resolveIterableAsync<ServiceType>(): Promise<Iterable<ServiceType>>;
    /**
     * Every registration of `ServiceType`, the service type derived from the type argument
     * instead of taken explicitly, each element awaited as the walk reaches it.
     */
    resolveAsyncIterable<ServiceType>(): AsyncIterable<ServiceType>;
    /**
     * Resolves the callable registered for `Func<Args, ServiceType>` and calls it with `args`.
     *
     * @throws UnsatisfiableError - when nothing can produce that callable.
     */
    resolveWith<ServiceType, Args extends unknown[]>(...args: Args): ServiceType;
    /** Resolves the callable registered for `Func<Args, ServiceType>` and calls it with `args`, or answers `undefined` once nothing can produce it. */
    tryResolveWith<ServiceType, Args extends unknown[]>(...args: Args): ServiceType | undefined;
    /**
     * Resolves the callable registered for `Func<Args, Promise<ServiceType>>` and calls it with `args`.
     *
     * @throws UnsatisfiableError - when nothing can produce that callable.
     */
    resolveWithAsync<ServiceType, Args extends unknown[]>(...args: Args): Promise<ServiceType>;
    /** Resolves the callable registered for `Func<Args, Promise<ServiceType>>` and calls it with `args`, settling on `undefined` once nothing can produce it. */
    tryResolveWithAsync<ServiceType, Args extends unknown[]>(...args: Args): Promise<ServiceType | undefined>;
    /** Constructs `ctor` fresh with the constructor type observed from `ctor` instead of taken explicitly. */
    instantiate<Instance>(ctor: Ctor<any[], Instance>): Instance;
    /** {@link IServiceProvider.instantiate}'s observed shape, answering `undefined` once a dependency of `ctor` cannot be produced. */
    tryInstantiate<Instance>(ctor: Ctor<any[], Instance>): Instance | undefined;
    /** Calls `func` with the function type observed from `func` instead of taken explicitly. */
    invoke<Result>(func: Func<any[], Result>): Result;
    /** {@link IServiceProvider.invoke}'s observed shape, answering `undefined` once a dependency of `func` cannot be produced. */
    tryInvoke<Result>(func: Func<any[], Result>): Result | undefined;
  }
}

export const ServiceProviderServiceAugmentations = {
  resolve<ServiceType>(this: IServiceProvider): ServiceType {
    return this.resolve(typefor<ServiceType>()) as ServiceType;
  },
  tryResolve<ServiceType>(this: IServiceProvider): ServiceType | undefined {
    return this.tryResolve(typefor<ServiceType>()) as ServiceType | undefined;
  },
  resolveArray<ServiceType>(this: IServiceProvider): ServiceType[] {
    return this.resolveArray(typefor<ServiceType>()) as ServiceType[];
  },
  resolveIterable<ServiceType>(this: IServiceProvider): Iterable<ServiceType> {
    return this.resolveIterable(typefor<ServiceType>()) as Iterable<ServiceType>;
  },
  resolveAsync<ServiceType>(this: IServiceProvider): Promise<ServiceType> {
    return this.resolveAsync(typefor<ServiceType>()) as Promise<ServiceType>;
  },
  tryResolveAsync<ServiceType>(this: IServiceProvider): Promise<ServiceType | undefined> {
    return this.tryResolveAsync(typefor<ServiceType>()) as Promise<ServiceType | undefined>;
  },
  resolveArrayAsync<ServiceType>(this: IServiceProvider): Promise<ServiceType[]> {
    return this.resolveArrayAsync(typefor<ServiceType>()) as Promise<ServiceType[]>;
  },
  resolveIterableAsync<ServiceType>(this: IServiceProvider): Promise<Iterable<ServiceType>> {
    return this.resolveIterableAsync(typefor<ServiceType>()) as Promise<Iterable<ServiceType>>;
  },
  resolveAsyncIterable<ServiceType>(this: IServiceProvider): AsyncIterable<ServiceType> {
    return this.resolveAsyncIterable(typefor<ServiceType>()) as AsyncIterable<ServiceType>;
  },
  resolveWith<ServiceType, Args extends unknown[]>(this: IServiceProvider, ...args: Args): ServiceType {
    return (this.resolve(typefor<Func<Args, ServiceType>>()) as Func<Args, ServiceType>)(...args);
  },
  tryResolveWith<ServiceType, Args extends unknown[]>(this: IServiceProvider, ...args: Args): ServiceType | undefined {
    return (this.tryResolve(typefor<Func<Args, ServiceType>>()) as Func<Args, ServiceType> | undefined)?.(...args);
  },
  resolveWithAsync<ServiceType, Args extends unknown[]>(this: IServiceProvider, ...args: Args): Promise<ServiceType> {
    return (this.resolve(typefor<Func<Args, Promise<ServiceType>>>()) as Func<Args, Promise<ServiceType>>)(...args);
  },
  tryResolveWithAsync<ServiceType, Args extends unknown[]>(this: IServiceProvider, ...args: Args): Promise<ServiceType | undefined> {
    return (this.tryResolve(typefor<Func<Args, Promise<ServiceType>>>()) as Func<Args, Promise<ServiceType>> | undefined)?.(...args) as Promise<
      ServiceType | undefined
    >;
  },
  instantiate<Instance>(this: IServiceProvider, ctor: Ctor<any[], Instance>): Instance {
    return this.instantiate(typefor(ctor), ctor);
  },
  tryInstantiate<Instance>(this: IServiceProvider, ctor: Ctor<any[], Instance>): Instance | undefined {
    return this.tryInstantiate(typefor(ctor), ctor);
  },
  invoke<Result>(this: IServiceProvider, func: Func<any[], Result>): Result {
    return this.invoke(typefor(func), func);
  },
  tryInvoke<Result>(this: IServiceProvider, func: Func<any[], Result>): Result | undefined {
    return this.tryInvoke(typefor(func), func);
  },
} satisfies AugmentationSet<IServiceProvider>;
registerInlineBodies<IServiceProvider>(ServiceProviderServiceAugmentations);
