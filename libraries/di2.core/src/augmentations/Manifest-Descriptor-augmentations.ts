import { /*type AugmentationSet, */ IterableObject, registerAugmentations, Token } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

import { AugmentationSet2 } from '@rhombus-std/primitives/tokens/augmentations';
import { type IManifest } from '../IManifest';
import { ServiceDescriptor } from '../ServiceDescriptor';
import { Type } from '../Type';
import { DepSignatures } from '../types';
import { Flatten } from '../utils';

type IManifestDescriptorAugmentations<Scopes extends string> = {
  addMany(descriptors: Iterable<ServiceDescriptor<Scopes>>): IManifest<Scopes>;
  tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Scopes>>): IManifest<Scopes>;

  tryAddClass(token: Token, ctor: Ctor, signatures: DepSignatures, scope?: Scopes, key?: string): IManifest<Scopes>;
  tryAddFactory(token: Token, factory: Func<any[], unknown>, signatures: DepSignatures, scope?: Scopes,
    key?: string): IManifest<Scopes>;
  tryAddValue(token: Token, value: unknown, key?: string): IManifest<Scopes>;

  replaceClass(token: Token, ctor: Ctor, signatures: DepSignatures, scope: Scopes | undefined,
    key?: string): IManifest<Scopes>;
  replaceFactory(token: Token, factory: Func<any[], unknown>, signatures: DepSignatures, scope: Scopes | undefined,
    key?: string): IManifest<Scopes>;
  replaceValue(token: Token, value: unknown, key?: string): IManifest<Scopes>;

  removeAll(token: Token, key?: string): IManifest<Scopes>;
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
    tryAddClass(manifest, token, ctor, signatures, scope?, key?) {
      return manifest.tryAdd(ServiceDescriptor.make.ctor(token, ctor, signatures, scope, key));
    },
    tryAddFactory(manifest, token, factory, signatures, scope?, key?) {
      return manifest.tryAdd(ServiceDescriptor.make.factory(token, factory, signatures, scope, key));
    },
    tryAddValue(manifest, token, value, key?) {
      return manifest.tryAdd(ServiceDescriptor.make.value(token, value, key));
    },

    replaceClass(manifest, token, ctor, signatures, scope?, key?) {
      return manifest.removeAll(token, key).addClass(token, ctor, signatures, scope, key);
    },

    replaceFactory(manifest, token, factory, signatures, scope?, key?) {
      return manifest.removeAll(token, key).addFactory(token, factory, signatures, scope, key);
    },
    replaceValue(manifest, token, value, key?) {
      return manifest.removeAll(token, key).addValue(token, value, key);
    },

    removeAll(manifest, token, key?) {
      const target = ServiceDescriptor.make.value(Type.parse(token), undefined, key);
      return Iterator.from(manifest)
        .filter(descriptor => ServiceDescriptor.matches(descriptor, target))
        .reduce((man, descriptor) => man.remove(descriptor), manifest);
    },
  };

registerAugmentations(tokenfor<IManifest>(), ManifestDescriptorAugmentations);
