import { AugmentationSet2, registerAugmentations, Token, Type } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

import { type IManifest } from '../IManifest';
import { ServiceDescriptor } from '../ServiceDescriptor';
import { keyedType, Signatures, TypeSignatures } from '../types';

type IManifestDescriptorAugmentations<Scopes extends string> = {
  addMany(descriptors: Iterable<ServiceDescriptor<Scopes>>): IManifest<Scopes>;
  tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Scopes>>): IManifest<Scopes>;

  tryAddClass(token: Token | Type, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): IManifest<Scopes>;
  tryAddFactory(token: Token | Type, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
    key?: string): IManifest<Scopes>;
  tryAddValue(token: Token | Type, value: unknown, key?: string): IManifest<Scopes>;

  replaceClass(token: Token | Type, ctor: Ctor, signatures: Signatures, scope: Scopes | undefined,
    key?: string): IManifest<Scopes>;
  replaceFactory(token: Token | Type, factory: Func<any[], unknown>, signatures: Signatures, scope: Scopes | undefined,
    key?: string): IManifest<Scopes>;
  replaceValue(token: Token | Type, value: unknown, key?: string): IManifest<Scopes>;

  removeAll(token: Token | Type, key?: string): IManifest<Scopes>;
};

declare module '@rhombus-std/di2.core' {
  interface IManifest<Scopes extends string> extends IManifestDescriptorAugmentations<Scopes> {}
}

export const ManifestDescriptorAugmentations: AugmentationSet2<IManifest<string>,
  IManifestDescriptorAugmentations<any>> = {
    addMany(manifest, descriptors) {
      return Iterator.from(descriptors).reduce((man, descriptor) => man.add(descriptor), manifest);
    },
    tryAdd(manifest: IManifest, ...descriptors: ReadonlyArray<ServiceDescriptor<any>>) {
      return Iterator.from(descriptors)
        .filter(newDesc =>
          !Iterator.from(manifest).some(existingDesc => ServiceDescriptor.matches(newDesc, existingDesc))
        )
        .reduce((man, descriptor) => man.add(descriptor), manifest);
    },
    tryAddClass(manifest, token, ctor, signatures, scope, key) {
      if (typeof token === 'string') {
        return manifest.tryAddClass(Type.from(token), ctor, signatures, scope, key);
      }
      return manifest.tryAdd(
        ServiceDescriptor.ctor(keyedType(token, key), ctor, TypeSignatures.from(signatures), scope),
      );
    },
    tryAddFactory(manifest, token, factory, signatures, scope, key) {
      if (typeof token === 'string') {
        return manifest.tryAddFactory(Type.from(token), factory, signatures, scope, key);
      }
      return manifest.tryAdd(
        ServiceDescriptor.factory(keyedType(token, key), factory, TypeSignatures.from(signatures), scope),
      );
    },
    tryAddValue(manifest, token, value, key) {
      if (typeof token === 'string') {
        return manifest.tryAddValue(Type.from(token), value, key);
      }
      return manifest.tryAdd(ServiceDescriptor.value(keyedType(token, key), value));
    },

    replaceClass(manifest, token, ctor, signatures, scope, key) {
      return manifest.removeAll(token, key).addClass(token, ctor, signatures, scope, key);
    },

    replaceFactory(manifest, token, factory, signatures, scope, key) {
      return manifest.removeAll(token, key).addFactory(token, factory, signatures, scope, key);
    },
    replaceValue(manifest, token, value, key) {
      return manifest.removeAll(token, key).addValue(token, value, key);
    },

    removeAll(manifest, token, key) {
      if (typeof token === 'string') {
        return manifest.removeAll(Type.from(token), key);
      }
      const target = ServiceDescriptor.value(keyedType(token, key), undefined);
      return Iterator.from(manifest)
        .filter(descriptor => ServiceDescriptor.matches(descriptor, target))
        .reduce((man, descriptor) => man.remove(descriptor), manifest);
    },
  };

registerAugmentations(tokenfor<IManifest>(), ManifestDescriptorAugmentations);
