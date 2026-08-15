import type { IComplete, Manifest, Unstarted } from '@rhombus-std/di.core';
import type { ConstructorType, FunctionType } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { AbstractCtor, Ctor, Func } from '@rhombus-toolkit/func';
import type { Flatten } from '@rhombus-toolkit/type-helpers';

export namespace ManifestDescriptorAugmentations {
  /**
   * The tokenless form of {@link Manifest.tryAdd}'s configure, constructor and factory shapes:
   * `type` is derived from `T` instead of taken explicitly.
   *
   * @param configureOrImplementer - a lambda run against the fluent builder, a constructor, or a
   * factory. A constructor or factory pairs with `implementerType`; a lambda takes no further
   * arguments.
   */
  export function tryAdd<T>(this: Manifest,
    configureOrImplementer: Func<[Unstarted<T, string>], IComplete> | (AbstractCtor<any[], T> & Ctor) | Func<any[], T>,
    implementerType?: ConstructorType | FunctionType, scope?: string, key?: string): Manifest {
    return (this as any).tryAdd(typefor<T>(), configureOrImplementer, implementerType, scope, key);
  }

  /** The tokenless form of {@link Manifest.tryAddClass}: `token` is derived from `T` instead of
   * taken explicitly. */
  export function tryAddClass<T>(this: Manifest, ctor: AbstractCtor<any[], T> & Ctor, implementerType: ConstructorType,
    scope?: string, key?: string): Manifest {
    return (this as any).tryAddClass(typefor<T>(), ctor, implementerType, scope, key);
  }

  /** The tokenless form of {@link Manifest.tryAddFactory}: `token` is derived from `T` instead of
   * taken explicitly. */
  export function tryAddFactory<T>(this: Manifest, factory: Func<any[], T>, implementerType: FunctionType,
    scope?: string, key?: string): Manifest {
    return (this as any).tryAddFactory(typefor<T>(), factory, implementerType, scope, key);
  }

  /** The tokenless form of {@link Manifest.tryAddValue}: `token` is derived from `T` instead of
   * taken explicitly. */
  export function tryAddValue<T>(this: Manifest, value: T, key?: string): Manifest {
    return (this as any).tryAddValue(typefor<T>(), value, key);
  }

  /** The tokenless form of {@link Manifest.replaceClass}: `token` is derived from `T` instead of
   * taken explicitly. */
  export function replaceClass<T>(this: Manifest, ctor: AbstractCtor<any[], T> & Ctor, implementerType: ConstructorType,
    scope: string | undefined, key?: string): Manifest {
    return (this as any).replaceClass(typefor<T>(), ctor, implementerType, scope, key);
  }

  /** The tokenless form of {@link Manifest.replaceFactory}: `token` is derived from `T` instead of
   * taken explicitly. */
  export function replaceFactory<T>(this: Manifest, factory: Func<any[], T>, implementerType: FunctionType,
    scope: string | undefined, key?: string): Manifest {
    return (this as any).replaceFactory(typefor<T>(), factory, implementerType, scope, key);
  }

  /** The tokenless form of {@link Manifest.replaceValue}: `token` is derived from `T` instead of
   * taken explicitly. */
  export function replaceValue<T>(this: Manifest, value: T, key?: string): Manifest {
    return (this as any).replaceValue(typefor<T>(), value, key);
  }

  /** The tokenless form of {@link Manifest.removeAll}: `token` is derived from `T` instead of
   * taken explicitly. */
  export function removeAll<T>(this: Manifest, key?: string): Manifest {
    return (this as any).removeAll(typefor<T>(), key);
  }
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends Flatten<typeof ManifestDescriptorAugmentations> {
    tryAdd<T>(this: Manifest,
      configureOrImplementer: Func<[Unstarted<T, string>], IComplete> | (AbstractCtor<any[], T> & Ctor) | Func<any[],
        T>, implementerType?: ConstructorType | FunctionType, scope?: string, key?: string): Manifest;

    tryAddClass<T>(this: Manifest, ctor: AbstractCtor<any[], T> & Ctor, implementerType: ConstructorType,
      scope?: string, key?: string): Manifest;

    tryAddFactory<T>(this: Manifest, factory: Func<any[], T>, implementerType: FunctionType, scope?: string,
      key?: string): Manifest;

    tryAddValue<T>(this: Manifest, value: T, key?: string): Manifest;

    replaceClass<T>(this: Manifest, ctor: AbstractCtor<any[], T> & Ctor, implementerType: ConstructorType,
      scope: string | undefined, key?: string): Manifest;

    replaceFactory<T>(this: Manifest, factory: Func<any[], T>, implementerType: FunctionType, scope: string | undefined,
      key?: string): Manifest;

    replaceValue<T>(this: Manifest, value: T, key?: string): Manifest;

    removeAll<T>(this: Manifest, key?: string): Manifest;
  }
}

registerAugmentations<Manifest>(ManifestDescriptorAugmentations);
