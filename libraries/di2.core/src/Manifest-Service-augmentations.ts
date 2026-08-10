import { AugmentationSet2, registerAugmentations, Token, Type } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { Ctor, Func } from '@rhombus-toolkit/func';
import { IManifest } from './IManifest';
import { ServiceDescriptor } from './ServiceDescriptor';
import { keyedType, Signatures, TypeSignatures } from './types';

type IManifestServiceAugmentations<Scopes extends string> = {
  addClass(type: Type, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): IManifest<Scopes>;
  addClass(token: Token, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): IManifest<Scopes>;
  addFactory(type: Type, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
    key?: string): IManifest<Scopes>;
  addFactory(token: Token, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
    key?: string): IManifest<Scopes>;
  addValue(type: Type, value: unknown, key?: string): IManifest<Scopes>;
  addValue(token: Token, value: unknown, key?: string): IManifest<Scopes>;
};

declare module '@rhombus-std/di2.core' {
  interface IManifest<Scopes extends string> extends IManifestServiceAugmentations<Scopes> {}
}

export const ManifestServiceAugmentations: AugmentationSet2<IManifest, IManifestServiceAugmentations<string>> = {
  addClass(receiver: IManifest,
    ...args: [type: Type, ctor: Ctor, signatures: Signatures, scope?: string, key?: string] | [token: Token, ctor: Ctor,
      signatures: Signatures, scope?: string, key?: string]) {
    const [token, ctor, signatures, scope, key] = args;
    if (typeof token === 'string') {
      return receiver.addClass(Type.from(token), ctor, signatures, scope, key);
    }
    return receiver.add(ServiceDescriptor.ctor(keyedType(token, key), ctor, TypeSignatures.from(signatures), scope));
  },
  addFactory(receiver: IManifest,
    ...args: [type: Type, factory: Func<any[], unknown>, signatures: Signatures, scope?: string, key?: string] | [
      token: Token,
      factory: Func<any[], unknown>,
      signatures: Signatures,
      scope?: string,
      key?: string,
    ]) {
    const [token, factory, signatures, scope, key] = args;
    if (typeof token === 'string') {
      return receiver.addFactory(Type.from(token), factory, signatures, scope, key);
    }
    return receiver.add(
      ServiceDescriptor.factory(keyedType(token, key), factory, TypeSignatures.from(signatures), scope),
    );
  },
  addValue(receiver: IManifest,
    ...args: [type: Type, value: unknown, key?: string] | [token: Token, value: unknown, key?: string]) {
    const [token, value, key] = args;
    if (typeof token === 'string') {
      return receiver.addValue(Type.from(token), value, key);
    }
    return receiver.add(ServiceDescriptor.value(keyedType(token, key), value));
  },
};

registerAugmentations(tokenfor<IManifest>(), ManifestServiceAugmentations);
