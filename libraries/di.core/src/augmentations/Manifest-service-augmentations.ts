import { AugmentationSet2, type Flatten, registerAugmentations, Token, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
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
    addClass(manifest, type, ctor, signatures, scope, key) {
      if (typeof type === 'string') {
        return manifest.addClass(Type.from(type), ctor, signatures, scope, key);
      }
      if (key !== undefined && type.kind === 'tag') {
        throw new Error(`${Type.stringify(type)} already carries a tag; it cannot take the key ${key}.`);
      }
      return manifest.add(
        ServiceDescriptor.ctor(key === undefined ? type : Type.tag(type, key), ctor, TypeSignatures.from(signatures),
          scope),
      );
    },
    addFactory(manifest, type, factory, signatures, scope, key) {
      if (typeof type === 'string') {
        return manifest.addFactory(Type.from(type), factory, signatures, scope, key);
      }
      if (key !== undefined && type.kind === 'tag') {
        throw new Error(`${Type.stringify(type)} already carries a tag; it cannot take the key ${key}.`);
      }
      return manifest.add(
        ServiceDescriptor.factory(key === undefined ? type : Type.tag(type, key), factory,
          TypeSignatures.from(signatures), scope),
      );
    },
    addValue(manifest, type, value, key) {
      if (typeof type === 'string') {
        return manifest.addValue(Type.from(type), value, key);
      }
      if (key !== undefined && type.kind === 'tag') {
        throw new Error(`${Type.stringify(type)} already carries a tag; it cannot take the key ${key}.`);
      }
      return manifest._add(ServiceDescriptor.value(key === undefined ? type : Type.tag(type, key), value));
    },
  };

registerAugmentations(typefor<Manifest>(), ManifestServiceAugmentations);
