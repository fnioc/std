import { type ConstructorType, type Flatten, type FunctionType, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

import { describe, type DescribeArgs, type IComplete, type Unstarted } from '../builder';
import { type Manifest } from '../Manifest';
import { withKey } from '../service-type';
import { ServiceDescriptor } from '../ServiceDescriptor';

export namespace ManifestDescriptorAugmentations {
  /**
   * Adds a service registration to the manifest: a {@link ServiceDescriptor} directly, `type`
   * paired with a configure lambda run against the fluent builder, or `type` paired with a
   * constructor or factory and its implementer type. Always registers, even when the manifest
   * already holds an entry for the same address.
   */
  export function add<S extends string = string>(this: Manifest<S>, descriptor: ServiceDescriptor<S>): Manifest<S>;
  export function add<T = any, S extends string = string>(this: Manifest<S>, type: Type | string,
    configure: Func<[Unstarted<T, S>], IComplete>): Manifest<S>;
  export function add<T = any, S extends string = string>(this: Manifest<S>, type: Type | string, ctor: Ctor<any[], T>,
    implementerType: ConstructorType, scope?: S, key?: string): Manifest<S>;
  export function add<T = any, S extends string = string>(this: Manifest<S>, type: Type | string,
    factory: Func<any[], T>, implementerType: FunctionType, scope?: S, key?: string): Manifest<S>;
  export function add<T = any, S extends string = string>(this: Manifest<S>,
    descriptorOrType: ServiceDescriptor<S> | Type | string,
    configureOrImplementer?: Func<[Unstarted<T, S>], IComplete> | Ctor<any[], T> | Func<any[], T>,
    implementerType?: ConstructorType | FunctionType, scope?: S, key?: string): Manifest<S> {
    if (configureOrImplementer === undefined) {
      return this._add(descriptorOrType as ServiceDescriptor<S>);
    }
    const type = descriptorOrType as Type | string;
    // `describe` reads its argument COUNT to tell the configure form from the terse one, so the
    // two shapes reach it as separate calls rather than one call padded with `undefined`.
    if (implementerType === undefined) {
      return this._add(describe<S>(type, configureOrImplementer as Func<[Unstarted<any, S>], IComplete>));
    }
    return this._add(
      describe<S>(type, configureOrImplementer as Ctor | Func, implementerType, scope, key),
    );
  }

  /** Drops the descriptor equal to `descriptor`, if the manifest holds one; otherwise unchanged. */
  export function remove<S extends string = string>(this: Manifest<S>, descriptor: ServiceDescriptor<S>): Manifest<S> {
    return this._remove(descriptor);
  }

  /**
   * Swaps in `descriptor` for the first descriptor occupying the same registration slot — see
   * {@link ServiceDescriptor.matches} — leaving every other descriptor untouched. Nothing
   * occupying that slot means the manifest comes back unchanged.
   */
  export function replace<S extends string = string>(this: Manifest<S>, descriptor: ServiceDescriptor<S>): Manifest<S> {
    return this._replace(descriptor);
  }

  /** Adds every descriptor in `descriptors` to the manifest, in order — the last one ends up newest. */
  export function addMany<S extends string = string>(this: Manifest<S>,
    descriptors: Iterable<ServiceDescriptor<S>>): Manifest<S> {
    return Iterator.from(descriptors).reduce((man, descriptor) => man._add(descriptor), this);
  }

  /**
   * Adds each of the given descriptors — or, given `type` paired with a configure lambda, a
   * constructor, or a factory, the single descriptor that shape describes — skipping any whose
   * address already {@link ServiceDescriptor.matches} an existing entry.
   */
  export function tryAdd<S extends string = string>(this: Manifest<S>,
    ...descriptors: ReadonlyArray<ServiceDescriptor<S>>): Manifest<S>;
  export function tryAdd<T = any, S extends string = string, Self extends Manifest<S> = Manifest<S>>(this: Self,
    type: Type | string, configure: Func<[Unstarted<T, S>], IComplete>): Self;
  export function tryAdd<T = any, S extends string = string, Self extends Manifest<S> = Manifest<S>>(this: Self,
    type: Type | string, ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: S, key?: string): Self;
  export function tryAdd<T = any, S extends string = string, Self extends Manifest<S> = Manifest<S>>(this: Self,
    type: Type | string, factory: Func<any[], T>, implementerType: FunctionType, scope?: S, key?: string): Self;
  export function tryAdd<S extends string = string>(this: Manifest<S>, first: ServiceDescriptor<S> | Type | string,
    ...rest: readonly any[]): Manifest<S> {
    // A descriptor never reaches the second slot as a function, so that is what separates the
    // two type-first forms from the rest-of-descriptors one.
    const descriptors: ReadonlyArray<ServiceDescriptor<S>> = typeof rest[0] === 'function'
      ? [describe<S>(first as Type | string, ...rest as DescribeArgs<S>)]
      : [first as ServiceDescriptor<S>, ...rest as ReadonlyArray<ServiceDescriptor<S>>];
    return Iterator.from(descriptors)
      .filter(newDesc => !Iterator.from(this).some(existingDesc => ServiceDescriptor.matches(newDesc, existingDesc)))
      .reduce((man, descriptor) => man._add(descriptor), this);
  }

  /**
   * The typed shorthand for {@link tryAdd}'s constructor form: registers `ctor` under `token`
   * unless the manifest already holds a matching entry.
   *
   * @throws Error - when `key` is given and `token` already carries a tag.
   */
  export function tryAddClass<S extends string = string>(this: Manifest<S>, token: string | Type, ctor: Ctor,
    implementerType: ConstructorType, scope?: S, key?: string): Manifest<S> {
    if (typeof token === 'string') {
      return this.tryAddClass(Type.from(token), ctor, implementerType, scope, key);
    }
    return this.tryAdd(ServiceDescriptor.ctor(withKey(token, key), ctor, implementerType, scope));
  }

  /**
   * The typed shorthand for {@link tryAdd}'s factory form: registers `factory` under `token`
   * unless the manifest already holds a matching entry.
   *
   * @throws Error - when `key` is given and `token` already carries a tag.
   */
  export function tryAddFactory<S extends string = string>(this: Manifest<S>, token: string | Type,
    factory: Func<any[], unknown>, implementerType: FunctionType, scope?: S, key?: string): Manifest<S> {
    if (typeof token === 'string') {
      return this.tryAddFactory(Type.from(token), factory, implementerType, scope, key);
    }
    return this.tryAdd(ServiceDescriptor.factory(withKey(token, key), factory, implementerType, scope));
  }

  /**
   * Registers `value` under `token` directly, with no construction step, unless the manifest
   * already holds a matching entry.
   *
   * @throws Error - when `key` is given and `token` already carries a tag.
   */
  export function tryAddValue<S extends string = string>(this: Manifest<S>, token: string | Type, value: unknown,
    key?: string): Manifest<S> {
    if (typeof token === 'string') {
      return this.tryAddValue(Type.from(token), value, key);
    }
    return this.tryAdd(ServiceDescriptor.value(withKey(token, key), value));
  }

  /**
   * Swaps the first registration of `token` for a constructor registration, at the position the
   * old one held. Nothing registered for `token` means nothing to replace, so the manifest comes
   * back unchanged — reach for `addClass` to register regardless.
   */
  export function replaceClass<S extends string = string>(this: Manifest<S>, token: string | Type, ctor: Ctor,
    implementerType: ConstructorType, scope: S | undefined, key?: string): Manifest<S> {
    if (typeof token === 'string') {
      return this.replaceClass(Type.from(token), ctor, implementerType, scope, key);
    }
    return this._replace(ServiceDescriptor.ctor(withKey(token, key), ctor, implementerType, scope));
  }

  /**
   * Swaps the first registration of `token` for a factory registration, at the position the old
   * one held. Nothing registered for `token` means nothing to replace, so the manifest comes back
   * unchanged — reach for `addFactory` to register regardless.
   */
  export function replaceFactory<S extends string = string>(this: Manifest<S>, token: string | Type,
    factory: Func<any[], unknown>, implementerType: FunctionType, scope: S | undefined, key?: string): Manifest<S> {
    if (typeof token === 'string') {
      return this.replaceFactory(Type.from(token), factory, implementerType, scope, key);
    }
    return this._replace(ServiceDescriptor.factory(withKey(token, key), factory, implementerType, scope));
  }

  /**
   * Swaps the first registration of `token` for `value`, at the position the old one held. Nothing
   * registered for `token` means nothing to replace, so the manifest comes back unchanged — reach
   * for `addValue` to register regardless.
   */
  export function replaceValue<S extends string = string>(this: Manifest<S>, token: string | Type, value: unknown,
    key?: string): Manifest<S> {
    if (typeof token === 'string') {
      return this.replaceValue(Type.from(token), value, key);
    }
    return this._replace(ServiceDescriptor.value(withKey(token, key), value));
  }

  /** Drops every descriptor registered for `token` (narrowed by `key`, if given), leaving every
   * other entry untouched. */
  export function removeAll<S extends string = string>(this: Manifest<S>, token: string | Type,
    key?: string): Manifest<S> {
    if (typeof token === 'string') {
      return this.removeAll(Type.from(token), key);
    }
    const target = ServiceDescriptor.value(withKey(token, key), undefined);
    return Iterator.from(this)
      .filter(descriptor => ServiceDescriptor.matches(descriptor, target))
      .reduce((man, descriptor) => man._remove(descriptor), this);
  }
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends Flatten<typeof ManifestDescriptorAugmentations> {
    add<S extends string = string>(this: Manifest<S>, descriptor: ServiceDescriptor<S>): Manifest<S>;
    add<T = any, S extends string = string>(this: Manifest<S>, type: Type | string,
      configure: Func<[Unstarted<T, S>], IComplete>): Manifest<S>;
    add<T = any, S extends string = string>(this: Manifest<S>, type: Type | string, ctor: Ctor<any[], T>,
      implementerType: ConstructorType, scope?: S, key?: string): Manifest<S>;
    add<T = any, S extends string = string>(this: Manifest<S>, type: Type | string, factory: Func<any[], T>,
      implementerType: FunctionType, scope?: S, key?: string): Manifest<S>;

    tryAdd<S extends string = string>(this: Manifest<S>,
      ...descriptors: ReadonlyArray<ServiceDescriptor<S>>): Manifest<S>;
    tryAdd<T = any, S extends string = string, Self extends Manifest<S> = Manifest<S>>(this: Self, type: Type | string,
      configure: Func<[Unstarted<T, S>], IComplete>): Self;
    tryAdd<T = any, S extends string = string, Self extends Manifest<S> = Manifest<S>>(this: Self, type: Type | string,
      ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: S, key?: string): Self;
    tryAdd<T = any, S extends string = string, Self extends Manifest<S> = Manifest<S>>(this: Self, type: Type | string,
      factory: Func<any[], T>, implementerType: FunctionType, scope?: S, key?: string): Self;

    tryAddClass<S extends string = string>(this: Manifest<S>, token: string | Type, ctor: Ctor,
      implementerType: ConstructorType, scope?: S, key?: string): Manifest<S>;

    tryAddFactory<S extends string = string>(this: Manifest<S>, token: string | Type, factory: Func<any[], unknown>,
      implementerType: FunctionType, scope?: S, key?: string): Manifest<S>;

    tryAddValue<S extends string = string>(this: Manifest<S>, token: string | Type, value: unknown,
      key?: string): Manifest<S>;

    replaceClass<S extends string = string>(this: Manifest<S>, token: string | Type, ctor: Ctor,
      implementerType: ConstructorType, scope: S | undefined, key?: string): Manifest<S>;

    replaceFactory<S extends string = string>(this: Manifest<S>, token: string | Type, factory: Func<any[], unknown>,
      implementerType: FunctionType, scope: S | undefined, key?: string): Manifest<S>;

    replaceValue<S extends string = string>(this: Manifest<S>, token: string | Type, value: unknown,
      key?: string): Manifest<S>;

    removeAll<S extends string = string>(this: Manifest<S>, token: string | Type, key?: string): Manifest<S>;
  }
}

registerAugmentations<Manifest>(ManifestDescriptorAugmentations);
