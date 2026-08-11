import type { IComplete, Manifest, ServiceDescriptor, Signatures, Unstarted } from '@rhombus-std/di2.core';
import { AugmentationSet2, type Flatten, registerAugmentations, Token, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

interface IManifestDescriptorAugmentations<Scopes extends string> {
  tryAdd<T>(configure: Func<[Unstarted<Scopes>], IComplete>): Manifest<Scopes>;

  tryAddClass<T>(ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): Manifest<Scopes>;
  tryAddFactory<T>(factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
    key?: string): Manifest<Scopes>;
  tryAddValue<T>(value: unknown, key?: string): Manifest<Scopes>;

  replaceClass<T>(ctor: Ctor, signatures: Signatures, scope: Scopes | undefined, key?: string): Manifest<Scopes>;
  replaceFactory<T>(factory: Func<any[], unknown>, signatures: Signatures, scope: Scopes | undefined,
    key?: string): Manifest<Scopes>;
  replaceValue<T>(value: unknown, key?: string): Manifest<Scopes>;

  removeAll<T>(key?: string): Manifest<Scopes>;
}

declare module '@rhombus-std/di2.core' {
  interface Manifest<Scopes extends string> extends IManifestDescriptorAugmentations<Scopes> {}
}

export const ManifestDescriptorAugmentations: AugmentationSet2<Manifest,
  Flatten<IManifestDescriptorAugmentations<any>>> = {
    tryAdd<T>(manifest: Manifest, ...rest: any[]) {
      return (manifest as any).tryAdd(typefor<T>(), ...rest);
    },
    tryAddClass<T>(manifest: Manifest, ...rest: any[]) {
      return (manifest as any).tryAddClass(typefor<T>(), ...rest);
    },
    tryAddFactory<T>(manifest: Manifest, ...rest: any[]) {
      return (manifest as any).tryAddFactory(typefor<T>(), ...rest);
    },
    tryAddValue<T>(manifest: Manifest, ...rest: any[]) {
      return (manifest as any).tryAddValue(typefor<T>(), ...rest);
    },

    replaceClass<T>(manifest: Manifest, ...rest: any[]) {
      return (manifest as any).replaceClass(typefor<T>(), ...rest);
    },

    replaceFactory<T>(manifest: Manifest, ...rest: any[]) {
      return (manifest as any).replaceFactory(typefor<T>(), ...rest);
    },
    replaceValue<T>(manifest: Manifest, ...rest: any[]) {
      return (manifest as any).replaceValue(typefor<T>(), ...rest);
    },

    removeAll<T>(manifest: Manifest, ...rest: any[]) {
      return (manifest as any).removeAll(typefor<T>(), ...rest);
    },
  };

registerAugmentations(typefor<Manifest>(), ManifestDescriptorAugmentations);
