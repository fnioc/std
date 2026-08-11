import { AugmentationSet2, type Flatten, registerAugmentations, Token, Type } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

import { type Manifest } from '../Manifest';
import { ServiceDescriptor } from '../ServiceDescriptor';
import { keyedType, Signatures, TypeSignatures } from '../types';

interface IManifestDescriptorAugmentations<Scopes extends string> {
  tryAdd<T>(configure: Func<[IUnstarted<Scopes>], IComplete>): Manifest<Scopes>;

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
    tryAdd<T>(manifest, ...rest: any[]): Manifest<Scopes> {
      return manifest.tryAdd(tokenfor<T>(), ...rest);
    },
    tryAddClass<T>(manifest, ...rest: any[]) {
      return manifest.tryAddClass(tokenfor<T>(), ...rest);
    },
    tryAddFactory<T>(manifest, ...rest: any[]) {
      return manifest.tryAddFactory(tokenfor<T>(), ...rest);
    },
    tryAddValue<T>(manifest, ...rest: any[]) {
      return manifest.tryAddValue(tokenfor<T>(), ...rest);
    },

    replaceClass<T>(manifest, ...rest: any[]) {
      return manifest.replaceClass(tokenfor<T>(), ...rest);
    },

    replaceFactory<T>(manifest, ...rest: any[]) {
      return manifest.replaceFactory(tokenfor<T>(), ...rest);
    },
    replaceValue<T>(manifest, ...rest: any[]) {
      return manifest.replaceValue(tokenfor<T>(), ...rest);
    },

    removeAll<T>(manifest, ...rest: any[]) {
      return manifest.removeAll(tokenfor<T>(), ...rest);
    },
  };

registerAugmentations(tokenfor<Manifest>(), ManifestDescriptorAugmentations);
