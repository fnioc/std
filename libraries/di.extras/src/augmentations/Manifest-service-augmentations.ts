import type { IComplete, Manifest, Unstarted } from '@rhombus-std/di.core';
import type { ConstructorType, FunctionType } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { Flatten } from '@rhombus-toolkit/type-helpers';

export namespace ManifestServiceAugmentations {
  /**
   * The tokenless form of {@link Manifest.add}'s configure, constructor and factory shapes:
   * `type` is derived from `T` instead of taken explicitly.
   *
   * @param configureOrImplementer - a lambda run against the fluent builder, a constructor, or a
   * factory. A constructor or factory pairs with `implementerType`; a lambda takes no further
   * arguments.
   */
  export function add<T>(this: Manifest,
    configureOrImplementer: Func<[Unstarted<T, string>], IComplete> | Ctor<any[], T> | Func<any[], T>,
    implementerType?: ConstructorType | FunctionType, scope?: string, key?: string): Manifest {
    return (this as any).add(typefor<T>(), configureOrImplementer, implementerType, scope, key);
  }

  /** The tokenless form of {@link Manifest.addClass}: `type` is derived from `T` instead of taken
   * explicitly. */
  export function addClass<T>(this: Manifest, ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: string,
    key?: string): Manifest {
    return (this as any).addClass(typefor<T>(), ctor, implementerType, scope, key);
  }

  /** The tokenless form of {@link Manifest.addFactory}: `type` is derived from `T` instead of
   * taken explicitly. */
  export function addFactory<T>(this: Manifest, factory: Func<any[], T>, implementerType: FunctionType, scope?: string,
    key?: string): Manifest {
    return (this as any).addFactory(typefor<T>(), factory, implementerType, scope, key);
  }

  /** The tokenless form of {@link Manifest.addValue}: `type` is derived from `T` instead of taken
   * explicitly. */
  export function addValue<T>(this: Manifest, value: T, key?: string): Manifest {
    return (this as any).addValue(typefor<T>(), value, key);
  }
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends Flatten<typeof ManifestServiceAugmentations> {
    add<T>(this: Manifest,
      configureOrImplementer: Func<[Unstarted<T, string>], IComplete> | Ctor<any[], T> | Func<any[], T>,
      implementerType?: ConstructorType | FunctionType, scope?: string, key?: string): Manifest;

    addClass<T>(this: Manifest, ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: string,
      key?: string): Manifest;

    addFactory<T>(this: Manifest, factory: Func<any[], T>, implementerType: FunctionType, scope?: string,
      key?: string): Manifest;

    addValue<T>(this: Manifest, value: T, key?: string): Manifest;
  }
}

registerAugmentations<Manifest>(ManifestServiceAugmentations);
