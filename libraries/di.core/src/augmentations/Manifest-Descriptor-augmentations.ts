import { type ConstructorType, type FunctionType, type MergeStrategies, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { AbstractCtor, Ctor, Func } from '@rhombus-toolkit/func';

import { describe, type DescribeArgs, type IComplete, type Unstarted } from '../builder';
import { type Manifest } from '../Manifest';
import { withKey } from '../service-type';
import { ServiceDescriptor } from '../ServiceDescriptor';

export namespace ManifestDescriptorAugmentations {
  /**
   * Describes one registration and adds it: `type` paired with a configure lambda run against the
   * fluent builder, or `type` paired with a constructor or factory and its implementer type.
   * Always registers, even when the manifest already holds an entry for the same address.
   */
  export function add<T = any>(this: Manifest<string>, type: Type | string,
    configure: Func<[Unstarted<T, string>], IComplete>): Manifest<string>;
  export function add<T = any>(this: Manifest<string>, type: Type | string, ctor: AbstractCtor<any[], T> & Ctor,
    implementerType: ConstructorType, scope?: string, key?: string): Manifest<string>;
  export function add<T = any>(this: Manifest<string>, type: Type | string, factory: Func<any[], T>,
    implementerType: FunctionType, scope?: string, key?: string): Manifest<string>;
  export function add<T = any>(this: Manifest<string>, type: Type | string,
    configureOrImplementer: Func<[Unstarted<T, string>], IComplete> | Ctor<any[], T> | Func<any[], T>,
    implementerType?: ConstructorType | FunctionType, scope?: string, key?: string): Manifest<string> {
    // `describe` reads its argument COUNT to tell the configure form from the terse one, so the
    // two shapes reach it as separate calls rather than one call padded with `undefined`.
    if (implementerType === undefined) {
      return this.add(describe<string>(type, configureOrImplementer as Func<[Unstarted<any, string>], IComplete>));
    }
    return this.add(
      describe<string>(type, configureOrImplementer as Ctor | Func, implementerType, scope, key),
    );
  }

  /** Adds every descriptor in `descriptors` to the manifest, in order — the last one ends up newest. */
  export function addMany(this: Manifest<string>, descriptors: Iterable<ServiceDescriptor<string>>): Manifest<string> {
    return Iterator.from(descriptors).reduce((man, descriptor) => man.add(descriptor), this);
  }

  /**
   * Adds each of the given descriptors — or, given `type` paired with a configure lambda, a
   * constructor, or a factory, the single descriptor that shape describes — skipping any whose
   * address already {@link ServiceDescriptor.matches} an existing entry.
   */
  export function tryAdd(this: Manifest<string>,
    ...descriptors: ReadonlyArray<ServiceDescriptor<string>>): Manifest<string>;
  export function tryAdd<T = any>(this: Manifest<string>, type: Type | string,
    configure: Func<[Unstarted<T, string>], IComplete>): Manifest<string>;
  export function tryAdd<T = any>(this: Manifest<string>, type: Type | string, ctor: AbstractCtor<any[], T> & Ctor,
    implementerType: ConstructorType, scope?: string, key?: string): Manifest<string>;
  export function tryAdd<T = any>(this: Manifest<string>, type: Type | string, factory: Func<any[], T>,
    implementerType: FunctionType, scope?: string, key?: string): Manifest<string>;
  export function tryAdd(this: Manifest<string>, first: ServiceDescriptor<string> | Type | string,
    ...rest: readonly any[]): Manifest<string> {
    // A descriptor never reaches the second slot as a function, so that is what separates the
    // two type-first forms from the rest-of-descriptors one.
    const descriptors: ReadonlyArray<ServiceDescriptor<string>> = typeof rest[0] === 'function'
      ? [describe<string>(first as Type | string, ...rest as DescribeArgs<string>)]
      : [first as ServiceDescriptor<string>, ...rest as ReadonlyArray<ServiceDescriptor<string>>];
    return Iterator.from(descriptors)
      .filter(newDesc => !Iterator.from(this).some(existingDesc => ServiceDescriptor.matches(newDesc, existingDesc)))
      .reduce((man, descriptor) => man.add(descriptor), this);
  }

  /**
   * The typed shorthand for {@link tryAdd}'s constructor form: registers `ctor` under `token`
   * unless the manifest already holds a matching entry.
   *
   * @throws Error - when `key` is given and `token` already carries a tag.
   */
  export function tryAddClass<T extends AbstractCtor>(this: Manifest<string>, token: string | Type, ctor: T & Ctor,
    implementerType: ConstructorType, scope?: string, key?: string): Manifest<string> {
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
  export function tryAddFactory(this: Manifest<string>, token: string | Type, factory: Func<any[], unknown>,
    implementerType: FunctionType, scope?: string, key?: string): Manifest<string> {
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
  export function tryAddValue(this: Manifest<string>, token: string | Type, value: unknown,
    key?: string): Manifest<string> {
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
  export function replaceClass<T extends AbstractCtor>(this: Manifest<string>, token: string | Type, ctor: T & Ctor,
    implementerType: ConstructorType, scope: string | undefined, key?: string): Manifest<string> {
    if (typeof token === 'string') {
      return this.replaceClass(Type.from(token), ctor, implementerType, scope, key);
    }
    return this.replace(ServiceDescriptor.ctor(withKey(token, key), ctor, implementerType, scope));
  }

  /**
   * Swaps the first registration of `token` for a factory registration, at the position the old
   * one held. Nothing registered for `token` means nothing to replace, so the manifest comes back
   * unchanged — reach for `addFactory` to register regardless.
   */
  export function replaceFactory(this: Manifest<string>, token: string | Type, factory: Func<any[], unknown>,
    implementerType: FunctionType, scope: string | undefined, key?: string): Manifest<string> {
    if (typeof token === 'string') {
      return this.replaceFactory(Type.from(token), factory, implementerType, scope, key);
    }
    return this.replace(ServiceDescriptor.factory(withKey(token, key), factory, implementerType, scope));
  }

  /**
   * Swaps the first registration of `token` for `value`, at the position the old one held. Nothing
   * registered for `token` means nothing to replace, so the manifest comes back unchanged — reach
   * for `addValue` to register regardless.
   */
  export function replaceValue(this: Manifest<string>, token: string | Type, value: unknown,
    key?: string): Manifest<string> {
    if (typeof token === 'string') {
      return this.replaceValue(Type.from(token), value, key);
    }
    return this.replace(ServiceDescriptor.value(withKey(token, key), value));
  }

  /** Drops every descriptor registered for `token` (narrowed by `key`, if given), leaving every
   * other entry untouched. */
  export function removeAll(this: Manifest<string>, token: string | Type, key?: string): Manifest<string> {
    if (typeof token === 'string') {
      return this.removeAll(Type.from(token), key);
    }
    const target = ServiceDescriptor.value(withKey(token, key), undefined);
    return Iterator.from(this)
      .filter(descriptor => ServiceDescriptor.matches(descriptor, target))
      .reduce((man, descriptor) => man.remove(descriptor), this);
  }
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    add<T = any>(type: Type | string, configure: Func<[Unstarted<T, Scopes>], IComplete>): Manifest<Scopes>;
    add<T = any>(type: Type | string, ctor: AbstractCtor<any[], T> & Ctor, implementerType: ConstructorType,
      scope?: Scopes, key?: string): Manifest<Scopes>;
    add<T = any>(type: Type | string, factory: Func<any[], T>, implementerType: FunctionType, scope?: Scopes,
      key?: string): Manifest<Scopes>;

    addMany(descriptors: Iterable<ServiceDescriptor<Scopes>>): Manifest<Scopes>;

    tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Scopes>>): Manifest<Scopes>;
    tryAdd<T = any>(type: Type | string, configure: Func<[Unstarted<T, Scopes>], IComplete>): Manifest<Scopes>;
    tryAdd<T = any>(type: Type | string, ctor: AbstractCtor<any[], T> & Ctor, implementerType: ConstructorType,
      scope?: Scopes, key?: string): Manifest<Scopes>;
    tryAdd<T = any>(type: Type | string, factory: Func<any[], T>, implementerType: FunctionType, scope?: Scopes,
      key?: string): Manifest<Scopes>;

    tryAddClass<T extends AbstractCtor>(token: string | Type, ctor: T & Ctor, implementerType: ConstructorType,
      scope?: Scopes, key?: string): Manifest<Scopes>;

    tryAddFactory(token: string | Type, factory: Func<any[], unknown>, implementerType: FunctionType, scope?: Scopes,
      key?: string): Manifest<Scopes>;

    tryAddValue(token: string | Type, value: unknown, key?: string): Manifest<Scopes>;

    replaceClass<T extends AbstractCtor>(token: string | Type, ctor: T & Ctor, implementerType: ConstructorType,
      scope: Scopes | undefined, key?: string): Manifest<Scopes>;

    replaceFactory(token: string | Type, factory: Func<any[], unknown>, implementerType: FunctionType,
      scope: Scopes | undefined, key?: string): Manifest<Scopes>;

    replaceValue(token: string | Type, value: unknown, key?: string): Manifest<Scopes>;

    removeAll(token: string | Type, key?: string): Manifest<Scopes>;
  }
}

/** A descriptor pairs an address with what fills it, so it is the only first argument carrying a
 * `serviceType` of its own — a service type IS one, and never holds another. */
function isDescriptor(value: unknown): value is ServiceDescriptor<string> {
  return typeof value === 'object' && value !== null && 'serviceType' in value;
}

// `add`'s sugared shapes land on a name the receiver's own primitive already holds. Routing a lone
// descriptor to the primitive is both halves of the job: it keeps the primitive reachable through
// the mounted method, and it keeps the sugar — which finishes by handing the descriptor it just
// built back to `add` — from re-entering itself.
const descriptorMerge = { add(original, incoming) {
  return function(this: Manifest<string>, ...args: unknown[]) {
    return isDescriptor(args[0]) ? original.call(this, ...args) : incoming.call(this, ...args);
  };
} } satisfies MergeStrategies<Manifest>;

registerAugmentations<Manifest>(ManifestDescriptorAugmentations, descriptorMerge);
