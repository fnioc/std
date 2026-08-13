import { AugmentationSet2, type Flatten, Token, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

import { describe, type IComplete, type Unstarted } from '../builder';
import { type Manifest } from '../Manifest';
import { ServiceDescriptor, type Signatures, TypeSignatures } from '../ServiceDescriptor';
interface IManifestDescriptorAugmentations<Scopes extends string> {
  add(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
  add<T = any>(type: Type | string, configure: Func<[Unstarted<T, Scopes>], IComplete>): Manifest<Scopes>;
  remove(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
  replace(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
  addMany(descriptors: Iterable<ServiceDescriptor<Scopes>>): Manifest<Scopes>;
  tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Scopes>>): Manifest<Scopes>;

  tryAdd<T = any>(type: Type | string, configure: Func<[Unstarted<T, Scopes>], IComplete>): this;

  tryAddClass(token: Token | Type, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): Manifest<Scopes>;
  tryAddFactory(token: Token | Type, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
    key?: string): Manifest<Scopes>;
  tryAddValue(token: Token | Type, value: unknown, key?: string): Manifest<Scopes>;

  replaceClass(token: Token | Type, ctor: Ctor, signatures: Signatures, scope: Scopes | undefined,
    key?: string): Manifest<Scopes>;
  replaceFactory(token: Token | Type, factory: Func<any[], unknown>, signatures: Signatures, scope: Scopes | undefined,
    key?: string): Manifest<Scopes>;
  replaceValue(token: Token | Type, value: unknown, key?: string): Manifest<Scopes>;

  removeAll(token: Token | Type, key?: string): Manifest<Scopes>;
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends IManifestDescriptorAugmentations<Scopes> {}
}

export const ManifestDescriptorAugmentations: AugmentationSet2<Manifest,
  Flatten<IManifestDescriptorAugmentations<any>>> = {
    add(descriptorOrType: any, configure?: any) {
      return this._add(
        configure === undefined ? descriptorOrType : describe<any, any>(descriptorOrType, configure),
      );
    },
    remove(descriptor) {
      return this._remove(descriptor);
    },
    replace(descriptor) {
      return this._replace(descriptor);
    },
    addMany(descriptors) {
      return Iterator.from(descriptors).reduce((man, descriptor) => man._add(descriptor), this);
    },
    tryAdd(...args: any[]) {
      const descriptors: ReadonlyArray<ServiceDescriptor<any>> = typeof args[1] === 'function'
        ? [describe(args[0], args[1])]
        : args;
      return Iterator.from(descriptors)
        .filter(newDesc => !Iterator.from(this).some(existingDesc => ServiceDescriptor.matches(newDesc, existingDesc)))
        .reduce((man, descriptor) => man._add(descriptor), this);
    },
    tryAddClass(token, ctor, signatures, scope, key) {
      if (typeof token === 'string') {
        return this.tryAddClass(Type.from(token), ctor, signatures, scope, key);
      }
      if (key !== undefined && token.kind === 'tag') {
        throw new Error(`${Type.stringify(token)} already carries a tag; it cannot take the key ${key}.`);
      }
      return this.tryAdd(
        ServiceDescriptor.ctor(key === undefined ? token : Type.tag(token, key), ctor, TypeSignatures.from(signatures),
          scope),
      );
    },
    tryAddFactory(token, factory, signatures, scope, key) {
      if (typeof token === 'string') {
        return this.tryAddFactory(Type.from(token), factory, signatures, scope, key);
      }
      if (key !== undefined && token.kind === 'tag') {
        throw new Error(`${Type.stringify(token)} already carries a tag; it cannot take the key ${key}.`);
      }
      return this.tryAdd(
        ServiceDescriptor.factory(key === undefined ? token : Type.tag(token, key), factory,
          TypeSignatures.from(signatures), scope),
      );
    },
    tryAddValue(token, value, key) {
      if (typeof token === 'string') {
        return this.tryAddValue(Type.from(token), value, key);
      }
      if (key !== undefined && token.kind === 'tag') {
        throw new Error(`${Type.stringify(token)} already carries a tag; it cannot take the key ${key}.`);
      }
      return this.tryAdd(ServiceDescriptor.value(key === undefined ? token : Type.tag(token, key), value));
    },

    replaceClass(token, ctor, signatures, scope, key) {
      return this.removeAll(token, key).addClass(token, ctor, signatures, scope, key);
    },

    replaceFactory(token, factory, signatures, scope, key) {
      return this.removeAll(token, key).addFactory(token, factory, signatures, scope, key);
    },
    replaceValue(token, value, key) {
      return this.removeAll(token, key).addValue(token, value, key);
    },

    removeAll(token, key) {
      if (typeof token === 'string') {
        return this.removeAll(Type.from(token), key);
      }
      if (key !== undefined && token.kind === 'tag') {
        throw new Error(`${Type.stringify(token)} already carries a tag; it cannot take the key ${key}.`);
      }
      const target = ServiceDescriptor.value(key === undefined ? token : Type.tag(token, key), undefined);
      return Iterator.from(this)
        .filter(descriptor => ServiceDescriptor.matches(descriptor, target))
        .reduce((man, descriptor) => man._remove(descriptor), this);
    },
  };

registerAugmentations<Manifest>(ManifestDescriptorAugmentations);
