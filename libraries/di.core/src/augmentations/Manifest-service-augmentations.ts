import { AugmentationSet2, type Flatten, Token, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { Ctor, Func } from '@rhombus-toolkit/func';
import { describe, type IComplete, type Unstarted } from '../builder';
import { Manifest } from '../Manifest';
import { ServiceDescriptor, type Signatures, TypeSignatures } from '../ServiceDescriptor';

interface IManifestServiceAugmentations<Scopes extends string> {
  addClass(type: Token | Type, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): this;
  addFactory(type: Token | Type, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
    key?: string): this;
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
      if (key !== undefined && type.kind === 'tag') {
        throw new Error(`${Type.stringify(type)} already carries a tag; it cannot take the key ${key}.`);
      }
      return this.add(
        ServiceDescriptor.ctor(key === undefined ? type : Type.tag(type, key), ctor, TypeSignatures.from(signatures),
          scope),
      );
    },
    addFactory(type, factory, signatures, scope, key) {
      if (typeof type === 'string') {
        return this.addFactory(Type.from(type), factory, signatures, scope, key);
      }
      if (key !== undefined && type.kind === 'tag') {
        throw new Error(`${Type.stringify(type)} already carries a tag; it cannot take the key ${key}.`);
      }
      return this.add(
        ServiceDescriptor.factory(key === undefined ? type : Type.tag(type, key), factory,
          TypeSignatures.from(signatures), scope),
      );
    },
    addValue(type, value, key) {
      if (typeof type === 'string') {
        return this.addValue(Type.from(type), value, key);
      }
      if (key !== undefined && type.kind === 'tag') {
        throw new Error(`${Type.stringify(type)} already carries a tag; it cannot take the key ${key}.`);
      }
      return this._add(ServiceDescriptor.value(key === undefined ? type : Type.tag(type, key), value));
    },
  };

registerAugmentations<Manifest>(ManifestServiceAugmentations);
