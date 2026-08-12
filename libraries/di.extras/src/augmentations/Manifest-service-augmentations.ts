import type { IComplete, Manifest, ServiceDescriptor, Signatures, Unstarted } from '@rhombus-std/di.core';
import { AugmentationSet2, type Flatten, Token, Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import { Ctor, Func } from '@rhombus-toolkit/func';

interface IManifestServiceAugmentations<Scopes extends string> {
  add<T>(configure: Func<[Unstarted<Scopes>], IComplete>): Manifest<Scopes>;
  addClass<T>(ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): this;
  addFactory<T>(factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes, key?: string): this;
  addValue<T>(value: unknown, key?: string): this;
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends IManifestServiceAugmentations<Scopes> {}
}

export const ManifestServiceAugmentations: AugmentationSet2<Manifest, Flatten<IManifestServiceAugmentations<string>>> =
  {
    add<T>(manifest: Manifest, ...rest: any[]) {
      return (manifest as any).add(typefor<T>(), ...rest);
    },
    addClass<T>(manifest: Manifest, ...rest: any[]) {
      return (manifest as any).addClass(typefor<T>(), ...rest);
    },
    addFactory<T>(manifest: Manifest, ...rest: any[]) {
      return (manifest as any).addFactory(typefor<T>(), ...rest);
    },
    addValue<T>(manifest: Manifest, ...rest: any[]) {
      return (manifest as any).addValue(typefor<T>(), ...rest);
    },
  };

registerAugmentations<Manifest>(ManifestServiceAugmentations);
