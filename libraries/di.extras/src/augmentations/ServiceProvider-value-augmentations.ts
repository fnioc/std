import type { Flatten, IServiceProvider } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

export namespace ServiceProviderValueAugmentations {
  /**
   * Constructs `value` fresh, its dependencies resolved from its own constructor parameter types.
   *
   * @remarks
   * Nothing here is registered or cached: two calls build two instances, even for a class
   * separately registered elsewhere under its own address.
   */
  export function getService<T extends Ctor>(this: IServiceProvider, value: T): InstanceType<T>;

  /**
   * Calls `value`, its dependencies resolved from its own parameter types.
   *
   * @remarks
   * Nothing here is registered or cached: two calls build two results, even for a function
   * separately registered elsewhere under its own address.
   */
  export function getService<T extends Func>(this: IServiceProvider, value: T): ReturnType<T>;

  export function getService<T extends Ctor | Func>(this: IServiceProvider, value: T): unknown {
    return (this as any).getService(typefor(value), value);
  }
}

declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends Flatten<typeof ServiceProviderValueAugmentations> {
    getService<T extends Ctor>(this: IServiceProvider, value: T): InstanceType<T>;

    getService<T extends Func>(this: IServiceProvider, value: T): ReturnType<T>;
  }
}

registerAugmentations<IServiceProvider>(ServiceProviderValueAugmentations);
