import { AugmentationSet2, type Flatten, Token, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { Ctor, Func } from '@rhombus-toolkit/func';
import { describe, type IComplete, type Unstarted } from '../builder';
import { Manifest } from '../Manifest';
import { withKey } from '../service-type';
import { ServiceDescriptor, type Signatures, TypeSignatures } from '../ServiceDescriptor';

interface IManifestServiceAugmentations<Scopes extends string> {
  /**
   * Registers `ctor` under `type` as a constructor-built service, always — even when the manifest
   * already holds an entry for the same address.
   *
   * @throws Error - when `key` is given and `type` already carries a tag.
   */
  addClass(type: Token | Type, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): this;

  /**
   * Registers `factory` under `type` as a factory-built service, always — even when the manifest
   * already holds an entry for the same address.
   *
   * @throws Error - when `key` is given and `type` already carries a tag.
   */
  addFactory(type: Token | Type, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
    key?: string): this;

  /**
   * Registers `value` under `type` directly, with no construction step, always — even when the
   * manifest already holds an entry for the same address.
   *
   * @throws Error - when `key` is given and `type` already carries a tag.
   */
  addValue(type: Token | Type, value: unknown, key?: string): this;
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends IManifestServiceAugmentations<Scopes> {}
}

export const ManifestServiceAugmentations: AugmentationSet2<Manifest, Flatten<IManifestServiceAugmentations<string>>> =
  {
    addClass(type, ctor, signatures, scope, key) {
      if (typeof type === 'string') {
        return this.addClass(Type.from(type), ctor, signatures, scope, key);
      }
      return this.add(
        ServiceDescriptor.ctor(withKey(type, key), ctor, TypeSignatures.from(signatures), scope),
      );
    },
    addFactory(type, factory, signatures, scope, key) {
      if (typeof type === 'string') {
        return this.addFactory(Type.from(type), factory, signatures, scope, key);
      }
      return this.add(
        ServiceDescriptor.factory(withKey(type, key), factory, TypeSignatures.from(signatures), scope),
      );
    },
    addValue(type, value, key) {
      if (typeof type === 'string') {
        return this.addValue(Type.from(type), value, key);
      }
      return this._add(ServiceDescriptor.value(withKey(type, key), value));
    },
  };

registerAugmentations<Manifest>(ManifestServiceAugmentations);
