import { type ConstructorType, type FunctionType, Type } from '@rhombus-std/primitives';
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
  export function addClass(this: Manifest, type: string | Type, ctor: Ctor, implementerType: ConstructorType,
    scope?: string, key?: string): Manifest {
    if (typeof type === 'string') {
      return this.addClass(Type.from(type), ctor, implementerType, scope, key);
    }
    return this.add(ServiceDescriptor.ctor(withKey(type, key), ctor, implementerType, scope));
  }

  /**
   * Registers `factory` under `type` as a factory-built service, always — even when the manifest
   * already holds an entry for the same address.
   *
   * @throws Error - when `key` is given and `type` already carries a tag.
   */
  export function addFactory(this: Manifest, type: string | Type, factory: Func<any[], unknown>,
    implementerType: FunctionType, scope?: string, key?: string): Manifest {
    if (typeof type === 'string') {
      return this.addFactory(Type.from(type), factory, implementerType, scope, key);
    }
    return this.add(ServiceDescriptor.factory(withKey(type, key), factory, implementerType, scope));
  }

  /**
   * Registers `value` under `type` directly, with no construction step, always — even when the
   * manifest already holds an entry for the same address.
   *
   * @throws Error - when `key` is given and `type` already carries a tag.
   */
  export function addValue(this: Manifest, type: string | Type, value: unknown, key?: string): Manifest {
    if (typeof type === 'string') {
      return this.addValue(Type.from(type), value, key);
    }
    return this.add(ServiceDescriptor.value(withKey(type, key), value));
  }
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    addClass(type: string | Type, ctor: Ctor, implementerType: ConstructorType, scope?: Scopes,
      key?: string): Manifest<Scopes>;

    addFactory(type: string | Type, factory: Func<any[], unknown>, implementerType: FunctionType, scope?: Scopes,
      key?: string): Manifest<Scopes>;

    addValue(type: string | Type, value: unknown, key?: string): Manifest<Scopes>;
  }
}

registerAugmentations<Manifest>(ManifestServiceAugmentations);
