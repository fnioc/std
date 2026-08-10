import { AugmentationSet2, registerAugmentations, Token, Type } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { Ctor, Func } from '@rhombus-toolkit/func';
import { Manifest } from './Manifest';
import { ServiceDescriptor } from './ServiceDescriptor';
import { keyedType, Signatures, TypeSignatures } from './types';
import { Flatten } from './utils';

interface IManifestServiceAugmentations<Scopes extends string> {
  addClass(token: Token | Type, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): this;
  addFactory(token: Token | Type, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
    key?: string): this;
  addValue(token: Token | Type, value: unknown, key?: string): this;
}

declare module '@rhombus-std/di2.core' {
  interface Manifest<Scopes extends string> extends IManifestServiceAugmentations<Scopes> {}
}

export const ManifestServiceAugmentations: AugmentationSet2<Manifest, Flatten<IManifestServiceAugmentations<string>>> =
  {
    addClass(receiver, token, ctor, signatures, scope, key) {
      if (typeof token === 'string') {
        return receiver.addClass(Type.from(token), ctor, signatures, scope, key);
      }
      return receiver.add(ServiceDescriptor.ctor(keyedType(token, key), ctor, TypeSignatures.from(signatures), scope));
    },
    addFactory(receiver, token, factory, signatures, scope, key) {
      if (typeof token === 'string') {
        return receiver.addFactory(Type.from(token), factory, signatures, scope, key);
      }
      return receiver.add(
        ServiceDescriptor.factory(keyedType(token, key), factory, TypeSignatures.from(signatures), scope),
      );
    },
    addValue(receiver, token, value, key) {
      if (typeof token === 'string') {
        return receiver.addValue(Type.from(token), value, key);
      }
      return receiver.add(ServiceDescriptor.value(keyedType(token, key), value));
    },
  };

registerAugmentations(tokenfor<Manifest>(), ManifestServiceAugmentations);
