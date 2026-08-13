import type { IComplete, Manifest, ServiceDescriptor, Signatures, Unstarted } from '@rhombus-std/di.core';
import { AugmentationSet2, type Flatten, Token, Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

interface IManifestDescriptorAugmentations<Scopes extends string> {
  tryAdd<T>(configure: Func<[Unstarted<T, Scopes>], IComplete>): Manifest<Scopes>;

  tryAddClass<T>(ctor: Ctor<any[], T>, signatures: Signatures, scope?: Scopes, key?: string): Manifest<Scopes>;
  tryAddFactory<T>(factory: Func<any[], T>, signatures: Signatures, scope?: Scopes, key?: string): Manifest<Scopes>;
  tryAddValue<T>(value: T, key?: string): Manifest<Scopes>;

  replaceClass<T>(ctor: Ctor<any[], T>, signatures: Signatures, scope: Scopes | undefined,
    key?: string): Manifest<Scopes>;
  replaceFactory<T>(factory: Func<any[], T>, signatures: Signatures, scope: Scopes | undefined,
    key?: string): Manifest<Scopes>;
  replaceValue<T>(value: T, key?: string): Manifest<Scopes>;

  removeAll<T>(key?: string): Manifest<Scopes>;
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends IManifestDescriptorAugmentations<Scopes> {}
}

export const ManifestDescriptorAugmentations: AugmentationSet2<Manifest,
  Flatten<IManifestDescriptorAugmentations<any>>> = {
    tryAdd<T>(this: Manifest, ...rest: any[]) {
      return (this as any).tryAdd(typefor<T>(), ...rest);
    },
    tryAddClass<T>(this: Manifest, ...rest: any[]) {
      return (this as any).tryAddClass(typefor<T>(), ...rest);
    },
    tryAddFactory<T>(this: Manifest, ...rest: any[]) {
      return (this as any).tryAddFactory(typefor<T>(), ...rest);
    },
    tryAddValue<T>(this: Manifest, ...rest: any[]) {
      return (this as any).tryAddValue(typefor<T>(), ...rest);
    },

    replaceClass<T>(this: Manifest, ...rest: any[]) {
      return (this as any).replaceClass(typefor<T>(), ...rest);
    },

    replaceFactory<T>(this: Manifest, ...rest: any[]) {
      return (this as any).replaceFactory(typefor<T>(), ...rest);
    },
    replaceValue<T>(this: Manifest, ...rest: any[]) {
      return (this as any).replaceValue(typefor<T>(), ...rest);
    },

    removeAll<T>(this: Manifest, ...rest: any[]) {
      return (this as any).removeAll(typefor<T>(), ...rest);
    },
  };

registerAugmentations<Manifest>(ManifestDescriptorAugmentations);
