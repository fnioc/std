import { AugmentationSet2, type Flatten, registerAugmentations, Token, Type } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { Ctor, Func } from '@rhombus-toolkit/func';
import { Manifest } from './Manifest';
import { ServiceDescriptor } from './ServiceDescriptor';
import { keyedType, Signatures, TypeSignatures } from './types';

interface IManifestServiceAugmentations<Scopes extends string> {
  add<T>(configure: Func<[Unstarted<Scopes>], IComplete>): Manifest<Scopes>;
  addClass<T>(ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): this;
  addFactory<T>(factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes, key?: string): this;
  addValue<T>(value: unknown, key?: string): this;
}

declare module '@rhombus-std/di2.core' {
  interface Manifest<Scopes extends string> extends IManifestServiceAugmentations<Scopes> {}
}

export const ManifestServiceAugmentations: AugmentationSet2<Manifest, Flatten<IManifestServiceAugmentations<string>>> =
  {
    add<T>(manifest, ...rest) {
      return manifest.add(tokenfor<T>(), ...rest);
    },
    addClass<T>(manifest, ...rest) {
      return manifest.addClass(tokenfor<T>(), ...rest);
    },
    addFactory<T>(manifest, ...rest) {
      return manifest.addFactory(tokenfor<T>(), ...rest);
    },
    addValue<T>(manifest, ...rest) {
      return manifest.addValue(tokenfor<T>(), ...rest);
    },
  };

registerAugmentations(tokenfor<Manifest>(), ManifestServiceAugmentations);
