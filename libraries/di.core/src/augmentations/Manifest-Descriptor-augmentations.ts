import { AugmentationSet2, type ConstructorType, type Flatten, type FunctionType, Token,
  Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

import { describe, type DescribeArgs, type IComplete, type Unstarted } from '../builder';
import { type Manifest } from '../Manifest';
import { withKey } from '../service-type';
import { ServiceDescriptor } from '../ServiceDescriptor';

interface IManifestDescriptorAugmentations<Scopes extends string> {
  /**
   * Adds a service registration to the manifest: a {@link ServiceDescriptor} directly, `type`
   * paired with a configure lambda run against the fluent builder, or `type` paired with a
   * constructor or factory and its implementation type. Always registers, even when the manifest
   * already holds an entry for the same address.
   */
  add(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
  add<T = any>(type: Type | string, configure: Func<[Unstarted<T, Scopes>], IComplete>): Manifest<Scopes>;
  add<T = any>(type: Type | string, ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: Scopes,
    key?: string): Manifest<Scopes>;
  add<T = any>(type: Type | string, factory: Func<any[], T>, implementerType: FunctionType, scope?: Scopes,
    key?: string): Manifest<Scopes>;

  /** Drops the descriptor equal to `descriptor`, if the manifest holds one; otherwise unchanged. */
  remove(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;

  /**
   * Swaps in `descriptor` for the first descriptor occupying the same registration slot — see
   * {@link ServiceDescriptor.matches} — leaving every other descriptor untouched. Nothing
   * occupying that slot means the manifest comes back unchanged.
   */
  replace(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;

  /** Adds every descriptor in `descriptors` to the manifest, in order — the last one ends up newest. */
  addMany(descriptors: Iterable<ServiceDescriptor<Scopes>>): Manifest<Scopes>;

  /**
   * Adds each of the given descriptors — or, given `type` paired with a configure lambda, a
   * constructor, or a factory, the single descriptor that shape describes — skipping any whose
   * address already {@link ServiceDescriptor.matches} an existing entry.
   */
  tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Scopes>>): Manifest<Scopes>;

  tryAdd<T = any>(type: Type | string, configure: Func<[Unstarted<T, Scopes>], IComplete>): this;
  tryAdd<T = any>(type: Type | string, ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: Scopes,
    key?: string): this;
  tryAdd<T = any>(type: Type | string, factory: Func<any[], T>, implementerType: FunctionType, scope?: Scopes,
    key?: string): this;

  /**
   * The typed shorthand for {@link tryAdd}'s constructor form: registers `ctor` under `token`
   * unless the manifest already holds a matching entry.
   *
   * @throws Error - when `key` is given and `token` already carries a tag.
   */
  tryAddClass(token: Token | Type, ctor: Ctor, implementerType: ConstructorType, scope?: Scopes,
    key?: string): Manifest<Scopes>;

  /**
   * The typed shorthand for {@link tryAdd}'s factory form: registers `factory` under `token`
   * unless the manifest already holds a matching entry.
   *
   * @throws Error - when `key` is given and `token` already carries a tag.
   */
  tryAddFactory(token: Token | Type, factory: Func<any[], unknown>, implementerType: FunctionType, scope?: Scopes,
    key?: string): Manifest<Scopes>;

  /**
   * Registers `value` under `token` directly, with no construction step, unless the manifest
   * already holds a matching entry.
   *
   * @throws Error - when `key` is given and `token` already carries a tag.
   */
  tryAddValue(token: Token | Type, value: unknown, key?: string): Manifest<Scopes>;

  /**
   * Swaps the first registration of `token` for a constructor registration, at the position the
   * old one held. Nothing registered for `token` means nothing to replace, so the manifest comes
   * back unchanged — reach for `addClass` to register regardless.
   */
  replaceClass(token: Token | Type, ctor: Ctor, implementerType: ConstructorType, scope: Scopes | undefined,
    key?: string): Manifest<Scopes>;

  /**
   * Swaps the first registration of `token` for a factory registration, at the position the old
   * one held. Nothing registered for `token` means nothing to replace, so the manifest comes back
   * unchanged — reach for `addFactory` to register regardless.
   */
  replaceFactory(token: Token | Type, factory: Func<any[], unknown>, implementerType: FunctionType,
    scope: Scopes | undefined, key?: string): Manifest<Scopes>;

  /**
   * Swaps the first registration of `token` for `value`, at the position the old one held. Nothing
   * registered for `token` means nothing to replace, so the manifest comes back unchanged — reach
   * for `addValue` to register regardless.
   */
  replaceValue(token: Token | Type, value: unknown, key?: string): Manifest<Scopes>;

  /** Drops every descriptor registered for `token` (narrowed by `key`, if given), leaving every
   * other entry untouched. */
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
    tryAddClass(token, ctor, implementerType, scope, key) {
      if (typeof token === 'string') {
        return this.tryAddClass(Type.from(token), ctor, implementerType, scope, key);
      }
      return this.tryAdd(ServiceDescriptor.ctor(withKey(token, key), ctor, implementerType, scope));
    },
    tryAddFactory(token, factory, implementerType, scope, key) {
      if (typeof token === 'string') {
        return this.tryAddFactory(Type.from(token), factory, implementerType, scope, key);
      }
      return this.tryAdd(ServiceDescriptor.factory(withKey(token, key), factory, implementerType, scope));
    },
    tryAddValue(token, value, key) {
      if (typeof token === 'string') {
        return this.tryAddValue(Type.from(token), value, key);
      }
      return this.tryAdd(ServiceDescriptor.value(withKey(token, key), value));
    },

    replaceClass(token, ctor, implementerType, scope, key) {
      if (typeof token === 'string') {
        return this.replaceClass(Type.from(token), ctor, implementerType, scope, key);
      }
      return this._replace(ServiceDescriptor.ctor(withKey(token, key), ctor, implementerType, scope));
    },

    replaceFactory(token, factory, implementerType, scope, key) {
      if (typeof token === 'string') {
        return this.replaceFactory(Type.from(token), factory, implementerType, scope, key);
      }
      return this._replace(ServiceDescriptor.factory(withKey(token, key), factory, implementerType, scope));
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
