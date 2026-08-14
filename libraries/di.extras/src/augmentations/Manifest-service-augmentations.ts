import type { IComplete, Manifest, ServiceDescriptor, Unstarted } from '@rhombus-std/di.core';
import { AugmentationSet2, type ConstructorType, type Flatten, type FunctionType, Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import { Ctor, Func } from '@rhombus-toolkit/func';

interface IManifestServiceAugmentations<Scopes extends string> {
  /** The tokenless form of {@link Manifest.add}'s configure, constructor and factory shapes:
   * `type` is derived from `T` instead of taken explicitly. */
  add<T>(configure: Func<[Unstarted<T, Scopes>], IComplete>): Manifest<Scopes>;
  add<T>(ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: Scopes, key?: string): Manifest<Scopes>;
  add<T>(factory: Func<any[], T>, implementerType: FunctionType, scope?: Scopes, key?: string): Manifest<Scopes>;

  /** The tokenless form of {@link Manifest.addClass}: `type` is derived from `T` instead of taken
   * explicitly. */
  addClass<T>(ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: Scopes, key?: string): this;

  /** The tokenless form of {@link Manifest.addFactory}: `type` is derived from `T` instead of
   * taken explicitly. */
  addFactory<T>(factory: Func<any[], T>, implementerType: FunctionType, scope?: Scopes, key?: string): this;

  /** The tokenless form of {@link Manifest.addValue}: `type` is derived from `T` instead of taken
   * explicitly. */
  addValue<T>(value: T, key?: string): this;
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends IManifestServiceAugmentations<Scopes> {
    add<T>(configure: Func<[Unstarted<T, Scopes>], IComplete>): Manifest<Scopes>;
    add<T>(ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: Scopes, key?: string): Manifest<Scopes>;
    add<T>(factory: Func<any[], T>, implementerType: FunctionType, scope?: Scopes, key?: string): Manifest<Scopes>;

    addClass<T>(ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: Scopes, key?: string): this;

    addFactory<T>(factory: Func<any[], T>, implementerType: FunctionType, scope?: Scopes, key?: string): this;

    addValue<T>(value: T, key?: string): this;
  }
}

export const ManifestServiceAugmentations: AugmentationSet2<Manifest, Flatten<IManifestServiceAugmentations<string>>> =
  {
    add<T>(this: Manifest, ...rest: any[]) {
      return (this as any).add(typefor<T>(), ...rest);
    },
    addClass<T>(this: Manifest, ...rest: any[]) {
      return (this as any).addClass(typefor<T>(), ...rest);
    },
    addFactory<T>(this: Manifest, ...rest: any[]) {
      return (this as any).addFactory(typefor<T>(), ...rest);
    },
    addValue<T>(this: Manifest, ...rest: any[]) {
      return (this as any).addValue(typefor<T>(), ...rest);
    },
  };

registerAugmentations<Manifest>(ManifestServiceAugmentations);
