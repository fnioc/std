import { registerAugmentations, Token, Type } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

import { AugmentationSet2 } from '@rhombus-std/primitives';
import { type IManifest } from '../IManifest';
import { ServiceDescriptor } from '../ServiceDescriptor';
import { Signatures, TypeSignatures } from '../types';

type IManifestDescriptorAugmentations<Scopes extends string> = {
  addMany(descriptors: Iterable<ServiceDescriptor<Scopes>>): IManifest<Scopes>;
  tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Scopes>>): IManifest<Scopes>;

  tryAddClass(type: Type, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): IManifest<Scopes>;
  tryAddClass(token: Token, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): IManifest<Scopes>;
  tryAddFactory(type: Type, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
    key?: string): IManifest<Scopes>;
  tryAddFactory(token: Token, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
    key?: string): IManifest<Scopes>;
  tryAddValue(type: Type, value: unknown, key?: string): IManifest<Scopes>;
  tryAddValue(token: Token, value: unknown, key?: string): IManifest<Scopes>;

  replaceClass(type: Type, ctor: Ctor, signatures: Signatures, scope: Scopes | undefined,
    key?: string): IManifest<Scopes>;
  replaceClass(token: Token, ctor: Ctor, signatures: Signatures, scope: Scopes | undefined,
    key?: string): IManifest<Scopes>;
  replaceFactory(type: Type, factory: Func<any[], unknown>, signatures: Signatures, scope: Scopes | undefined,
    key?: string): IManifest<Scopes>;
  replaceFactory(token: Token, factory: Func<any[], unknown>, signatures: Signatures, scope: Scopes | undefined,
    key?: string): IManifest<Scopes>;
  replaceValue(type: Type, value: unknown, key?: string): IManifest<Scopes>;
  replaceValue(token: Token, value: unknown, key?: string): IManifest<Scopes>;

  removeAll(type: Type, key?: string): IManifest<Scopes>;
  removeAll(token: Token, key?: string): IManifest<Scopes>;
};

declare module '@rhombus-std/di2.core' {
  interface IManifest<Scopes extends string> extends IManifestDescriptorAugmentations<Scopes> {}
}

// Decoupled from the public overloads above -- see the matching comment in
// Manifest-Service-augmentations.ts: `AugmentationSet2` reads a member's
// params via `Parameters<Impl[K]>`, which only sees the LAST arm of a
// genuinely overloaded signature, so a union-of-tuples rest parameter keeps
// both arms visible instead. Every object-literal method below repeats these
// same tuple types on its own `manifest`/`...args` parameters rather than
// leaving them to infer from context -- see the same file's comment for why.
type TryAddClassArgs<Scopes extends string> = [type: Type, ctor: Ctor, signatures: Signatures, scope?: Scopes,
  key?: string] | [token: Token, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string];
type TryAddFactoryArgs<Scopes extends string> = [type: Type, factory: Func<any[], unknown>, signatures: Signatures,
  scope?: Scopes, key?: string] | [token: Token, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
  key?: string];
type TryAddValueArgs = [type: Type, value: unknown, key?: string] | [token: Token, value: unknown, key?: string];

type ReplaceClassArgs<Scopes extends string> = [type: Type, ctor: Ctor, signatures: Signatures,
  scope: Scopes | undefined, key?: string] | [token: Token, ctor: Ctor, signatures: Signatures,
  scope: Scopes | undefined, key?: string];
type ReplaceFactoryArgs<Scopes extends string> = [type: Type, factory: Func<any[], unknown>, signatures: Signatures,
  scope: Scopes | undefined, key?: string] | [token: Token, factory: Func<any[], unknown>, signatures: Signatures,
  scope: Scopes | undefined, key?: string];
type ReplaceValueArgs = [type: Type, value: unknown, key?: string] | [token: Token, value: unknown, key?: string];

type RemoveAllArgs = [type: Type, key?: string] | [token: Token, key?: string];

type IManifestDescriptorAugmentationsImpl<Scopes extends string> = {
  addMany(descriptors: Iterable<ServiceDescriptor<Scopes>>): IManifest<Scopes>;
  tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Scopes>>): IManifest<Scopes>;

  tryAddClass(...args: TryAddClassArgs<Scopes>): IManifest<Scopes>;
  tryAddFactory(...args: TryAddFactoryArgs<Scopes>): IManifest<Scopes>;
  tryAddValue(...args: TryAddValueArgs): IManifest<Scopes>;

  replaceClass(...args: ReplaceClassArgs<Scopes>): IManifest<Scopes>;
  replaceFactory(...args: ReplaceFactoryArgs<Scopes>): IManifest<Scopes>;
  replaceValue(...args: ReplaceValueArgs): IManifest<Scopes>;

  removeAll(...args: RemoveAllArgs): IManifest<Scopes>;
};

export const ManifestDescriptorAugmentations: AugmentationSet2<IManifest<string>,
  IManifestDescriptorAugmentationsImpl<any>> = {
    addMany(manifest, descriptors) {
      return Iterator.from(descriptors).reduce((man, descriptor) => man.add(descriptor), manifest);
    },
    tryAdd(manifest: IManifest, ...descriptors: ReadonlyArray<ServiceDescriptor<any>>) {
      return Iterator.from(descriptors)
        .filter(newDesc =>
          !Iterator.from(manifest).some(existingDesc => ServiceDescriptor.matches(newDesc, existingDesc))
        )
        .reduce((man, descriptor) => man.add(descriptor), manifest);
    },
    tryAddClass(manifest: IManifest, ...args: TryAddClassArgs<string>): IManifest {
      const [token, ctor, signatures, scope, key] = args;
      if (typeof token === 'string') {
        return manifest.tryAddClass(Type.from(token), ctor, signatures, scope, key);
      }
      return manifest.tryAdd(ServiceDescriptor.ctor(token, ctor, TypeSignatures.from(signatures), scope, key));
    },
    tryAddFactory(manifest: IManifest, ...args: TryAddFactoryArgs<string>): IManifest {
      const [token, factory, signatures, scope, key] = args;
      if (typeof token === 'string') {
        return manifest.tryAddFactory(Type.from(token), factory, signatures, scope, key);
      }
      return manifest.tryAdd(ServiceDescriptor.factory(token, factory, TypeSignatures.from(signatures), scope, key));
    },
    tryAddValue(manifest: IManifest, ...args: TryAddValueArgs): IManifest {
      const [token, value, key] = args;
      if (typeof token === 'string') {
        return manifest.tryAddValue(Type.from(token), value, key);
      }
      return manifest.tryAdd(ServiceDescriptor.value(token, value, key));
    },

    replaceClass(manifest: IManifest, ...args: ReplaceClassArgs<string>): IManifest {
      const [token, ctor, signatures, scope, key] = args;
      // `token`'s union type can't drive an overloaded call directly (neither
      // overload accepts `Type | Token`), so each branch re-narrows it.
      return typeof token === 'string'
        ? manifest.removeAll(token, key).addClass(token, ctor, signatures, scope, key)
        : manifest.removeAll(token, key).addClass(token, ctor, signatures, scope, key);
    },

    replaceFactory(manifest: IManifest, ...args: ReplaceFactoryArgs<string>): IManifest {
      const [token, factory, signatures, scope, key] = args;
      return typeof token === 'string'
        ? manifest.removeAll(token, key).addFactory(token, factory, signatures, scope, key)
        : manifest.removeAll(token, key).addFactory(token, factory, signatures, scope, key);
    },
    replaceValue(manifest: IManifest, ...args: ReplaceValueArgs): IManifest {
      const [token, value, key] = args;
      return typeof token === 'string'
        ? manifest.removeAll(token, key).addValue(token, value, key)
        : manifest.removeAll(token, key).addValue(token, value, key);
    },

    removeAll(manifest: IManifest, ...args: RemoveAllArgs): IManifest {
      const [token, key] = args;
      if (typeof token === 'string') {
        return manifest.removeAll(Type.from(token), key);
      }
      const target = ServiceDescriptor.value(token, undefined, key);
      return Iterator.from(manifest)
        .filter(descriptor => ServiceDescriptor.matches(descriptor, target))
        .reduce((man, descriptor) => man.remove(descriptor), manifest);
    },
  };

registerAugmentations(tokenfor<IManifest>(), ManifestDescriptorAugmentations);
