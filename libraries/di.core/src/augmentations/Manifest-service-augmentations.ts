import { type ConstructorType, type Flatten, type FunctionType, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { Ctor, Func } from '@rhombus-toolkit/func';
import { Manifest } from '../Manifest';
import { withKey } from '../service-type';
import { ServiceDescriptor } from '../ServiceDescriptor';

export namespace ManifestServiceAugmentations {
  /**
   * Registers `ctor` under `type` as a constructor-built service, always — even when the manifest
   * already holds an entry for the same address.
   *
   * @throws Error - when `key` is given and `type` already carries a tag.
   */
  export function addClass<Self extends Manifest<S>, S extends string = string>(this: Self, type: string | Type,
    ctor: Ctor, implementerType: ConstructorType, scope?: NoInfer<S>, key?: string): Self {
    if (typeof type === 'string') {
      return this.addClass(Type.from(type), ctor, implementerType, scope, key);
    }
    return this.add(ServiceDescriptor.ctor(withKey(type, key), ctor, implementerType, scope)) as Self;
  }

  /**
   * Registers `factory` under `type` as a factory-built service, always — even when the manifest
   * already holds an entry for the same address.
   *
   * @throws Error - when `key` is given and `type` already carries a tag.
   */
  export function addFactory<Self extends Manifest<S>, S extends string = string>(this: Self, type: string | Type,
    factory: Func<any[], unknown>, implementerType: FunctionType, scope?: NoInfer<S>, key?: string): Self {
    if (typeof type === 'string') {
      return this.addFactory(Type.from(type), factory, implementerType, scope, key);
    }
    return this.add(ServiceDescriptor.factory(withKey(type, key), factory, implementerType, scope)) as Self;
  }

  /**
   * Registers `value` under `type` directly, with no construction step, always — even when the
   * manifest already holds an entry for the same address.
   *
   * @throws Error - when `key` is given and `type` already carries a tag.
   */
  export function addValue<Self extends Manifest<S>, S extends string = string>(this: Self, type: string | Type,
    value: unknown, key?: string): Self {
    if (typeof type === 'string') {
      return this.addValue(Type.from(type), value, key);
    }
    return this._add(ServiceDescriptor.value(withKey(type, key), value)) as Self;
  }
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends Flatten<typeof ManifestServiceAugmentations> {
    addClass<Self extends Manifest<S>, S extends string = string>(this: Self, type: string | Type, ctor: Ctor,
      implementerType: ConstructorType, scope?: NoInfer<S>, key?: string): Self;

    addFactory<Self extends Manifest<S>, S extends string = string>(this: Self, type: string | Type,
      factory: Func<any[], unknown>, implementerType: FunctionType, scope?: NoInfer<S>, key?: string): Self;

    addValue<Self extends Manifest<S>, S extends string = string>(this: Self, type: string | Type, value: unknown,
      key?: string): Self;
  }
}

registerAugmentations<Manifest>(ManifestServiceAugmentations);
