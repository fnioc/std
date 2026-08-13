import { AugmentationSet2, type ConstructorType, type Flatten, type FunctionType, type IntersectionType, Token,
  Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

import { describe, type DescribeArgs, type IComplete, type Unstarted } from '../builder';
import { type Manifest } from '../Manifest';
import { withKey } from '../service-type';
import { ServiceDescriptor, type Signatures, TypeSignatures } from '../ServiceDescriptor';
interface IManifestDescriptorAugmentations<Scopes extends string> {
  add(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
  add<T = any>(type: Type | string, configure: Func<[Unstarted<T, Scopes>], IComplete>): Manifest<Scopes>;
  add<T = any>(type: Type | string, ctor: Ctor<any[], T>, implType: ConstructorType | IntersectionType, scope?: Scopes,
    key?: string): Manifest<Scopes>;
  add<T = any>(type: Type | string, factory: Func<any[], T>, implType: FunctionType | IntersectionType, scope?: Scopes,
    key?: string): Manifest<Scopes>;
  remove(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
  replace(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
  addMany(descriptors: Iterable<ServiceDescriptor<Scopes>>): Manifest<Scopes>;
  tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Scopes>>): Manifest<Scopes>;

  tryAdd<T = any>(type: Type | string, configure: Func<[Unstarted<T, Scopes>], IComplete>): this;
  tryAdd<T = any>(type: Type | string, ctor: Ctor<any[], T>, implType: ConstructorType | IntersectionType,
    scope?: Scopes, key?: string): this;
  tryAdd<T = any>(type: Type | string, factory: Func<any[], T>, implType: FunctionType | IntersectionType,
    scope?: Scopes, key?: string): this;

  tryAddClass(token: Token | Type, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): Manifest<Scopes>;
  tryAddFactory(token: Token | Type, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
    key?: string): Manifest<Scopes>;
  tryAddValue(token: Token | Type, value: unknown, key?: string): Manifest<Scopes>;

  /**
   * Swaps the first registration of `token` for a constructor registration, at the position the
   * old one held. Nothing registered for `token` means nothing to replace, so the manifest comes
   * back unchanged — reach for `addClass` to register regardless.
   */
  replaceClass(token: Token | Type, ctor: Ctor, signatures: Signatures, scope: Scopes | undefined,
    key?: string): Manifest<Scopes>;

  /**
   * Swaps the first registration of `token` for a factory registration, at the position the old
   * one held. Nothing registered for `token` means nothing to replace, so the manifest comes back
   * unchanged — reach for `addFactory` to register regardless.
   */
  replaceFactory(token: Token | Type, factory: Func<any[], unknown>, signatures: Signatures, scope: Scopes | undefined,
    key?: string): Manifest<Scopes>;

  /**
   * Swaps the first registration of `token` for `value`, at the position the old one held. Nothing
   * registered for `token` means nothing to replace, so the manifest comes back unchanged — reach
   * for `addValue` to register regardless.
   */
  replaceValue(token: Token | Type, value: unknown, key?: string): Manifest<Scopes>;

  removeAll(token: Token | Type, key?: string): Manifest<Scopes>;
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends IManifestDescriptorAugmentations<Scopes> {}
}

export const ManifestDescriptorAugmentations: AugmentationSet2<Manifest,
  Flatten<IManifestDescriptorAugmentations<any>>> = {
    add(descriptorOrType: any, ...rest: any[]) {
      if (!rest.length) {
        return this._add(descriptorOrType);
      }
      return this._add(describe(descriptorOrType, ...rest as DescribeArgs<any>));
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
      // A descriptor never reaches the second slot as a function, so that is what separates the
      // two type-first forms from the rest-of-descriptors one.
      const descriptors: ReadonlyArray<ServiceDescriptor<any>> = typeof args[1] === 'function'
        ? [describe(args[0], ...args.slice(1) as DescribeArgs<any>)]
        : args;
      return Iterator.from(descriptors)
        .filter(newDesc => !Iterator.from(this).some(existingDesc => ServiceDescriptor.matches(newDesc, existingDesc)))
        .reduce((man, descriptor) => man._add(descriptor), this);
    },
    tryAddClass(token, ctor, signatures, scope, key) {
      if (typeof token === 'string') {
        return this.tryAddClass(Type.from(token), ctor, signatures, scope, key);
      }
      return this.tryAdd(
        ServiceDescriptor.ctor(withKey(token, key), ctor, TypeSignatures.from(signatures), scope),
      );
    },
    tryAddFactory(token, factory, signatures, scope, key) {
      if (typeof token === 'string') {
        return this.tryAddFactory(Type.from(token), factory, signatures, scope, key);
      }
      return this.tryAdd(
        ServiceDescriptor.factory(withKey(token, key), factory, TypeSignatures.from(signatures), scope),
      );
    },
    tryAddValue(token, value, key) {
      if (typeof token === 'string') {
        return this.tryAddValue(Type.from(token), value, key);
      }
      return this.tryAdd(ServiceDescriptor.value(withKey(token, key), value));
    },

    replaceClass(token, ctor, signatures, scope, key) {
      if (typeof token === 'string') {
        return this.replaceClass(Type.from(token), ctor, signatures, scope, key);
      }
      return this._replace(
        ServiceDescriptor.ctor(withKey(token, key), ctor, TypeSignatures.from(signatures), scope),
      );
    },

    replaceFactory(token, factory, signatures, scope, key) {
      if (typeof token === 'string') {
        return this.replaceFactory(Type.from(token), factory, signatures, scope, key);
      }
      return this._replace(
        ServiceDescriptor.factory(withKey(token, key), factory, TypeSignatures.from(signatures), scope),
      );
    },
    replaceValue(token, value, key) {
      if (typeof token === 'string') {
        return this.replaceValue(Type.from(token), value, key);
      }
      return this._replace(ServiceDescriptor.value(withKey(token, key), value));
    },

    removeAll(token, key) {
      if (typeof token === 'string') {
        return this.removeAll(Type.from(token), key);
      }
      const target = ServiceDescriptor.value(withKey(token, key), undefined);
      return Iterator.from(this)
        .filter(descriptor => ServiceDescriptor.matches(descriptor, target))
        .reduce((man, descriptor) => man._remove(descriptor), this);
    },
  };

registerAugmentations<Manifest>(ManifestDescriptorAugmentations);
