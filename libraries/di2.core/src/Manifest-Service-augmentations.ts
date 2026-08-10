import { AugmentationSet2, registerAugmentations, Token } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { Ctor, Func } from '@rhombus-toolkit/func';
import { IManifest } from './IManifest';
import { ServiceDescriptor } from './ServiceDescriptor';
import { DepSignatures } from './types';

type IManifestServiceAugmentations<Scopes extends string> = {
  addClass(token: Token, ctor: Ctor, signatures: DepSignatures, scope?: Scopes, key?: string): IManifest<Scopes>;
  addFactory(token: Token, factory: Func<any[], unknown>, signatures: DepSignatures, scope?: Scopes,
    key?: string): IManifest<Scopes>;
  addValue(token: Token, value: unknown, key?: string): IManifest<Scopes>;
};

declare module '@rhombus-std/di2.core' {
  interface IManifest<Scopes extends string> extends IManifestServiceAugmentations<Scopes> {}
}

export const ManifestServiceAugmentations: AugmentationSet2<IManifest, IManifestServiceAugmentations<string>> = {
  addClass(receiver, token, ctor, signatures, scope?, key?) {
    return receiver.add(ServiceDescriptor.make.ctor(token, ctor, signatures, scope, key));
  },
  addFactory(receiver, token, factory, signatures, scope?, key?) {
    return receiver.add(ServiceDescriptor.make.factory(token, factory, signatures, scope, key));
  },
  addValue(receiver, token, value, key?) {
    return receiver.add(ServiceDescriptor.make.value(token, value, key));
  },
};

registerAugmentations(tokenfor<IManifest>(), ManifestServiceAugmentations);
