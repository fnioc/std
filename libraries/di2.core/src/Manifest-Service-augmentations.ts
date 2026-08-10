import { AugmentationSet2, registerAugmentations, Token, Type } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { Ctor, Func } from '@rhombus-toolkit/func';
import { IManifest } from './IManifest';
import { ServiceDescriptor } from './ServiceDescriptor';
import { Signatures, TypeSignatures } from './types';

declare module '@rhombus-std/di2.core' {
  interface IManifest<Scopes extends string> {
    addClass(type: Type, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): IManifest<Scopes>;
    addClass(token: Token, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string): IManifest<Scopes>;
    addFactory(type: Type, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
      key?: string): IManifest<Scopes>;
    addFactory(token: Token, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
      key?: string): IManifest<Scopes>;
    addValue(type: Type, value: unknown, key?: string): IManifest<Scopes>;
    addValue(token: Token, value: unknown, key?: string): IManifest<Scopes>;
  }
}

// Decoupled from the public overloads above: `AugmentationSet2` reads a
// member's params via `Parameters<Impl[K]>`, which only sees the LAST arm of
// a genuinely overloaded signature. A single signature per member with a
// union-of-tuples rest parameter carries both arms through `Parameters<>`
// intact -- every arm returns the same `IManifest<Scopes>`, so nothing is
// lost by not overloading the return type.
//
// Every object-literal method below repeats these same tuple types on its
// own `receiver`/`...args` parameters rather than leaving them to infer from
// the `AugmentationSet2<...>` context: a contextually-inferred
// `(receiver, ...args)` split loses the union's per-branch positional
// alignment and widens every slot to the union of ALL positions across both
// branches instead of keeping each branch's own shape.
type AddClassArgs<Scopes extends string> = [type: Type, ctor: Ctor, signatures: Signatures, scope?: Scopes,
  key?: string] | [token: Token, ctor: Ctor, signatures: Signatures, scope?: Scopes, key?: string];
type AddFactoryArgs<Scopes extends string> = [type: Type, factory: Func<any[], unknown>, signatures: Signatures,
  scope?: Scopes, key?: string] | [token: Token, factory: Func<any[], unknown>, signatures: Signatures, scope?: Scopes,
  key?: string];
type AddValueArgs = [type: Type, value: unknown, key?: string] | [token: Token, value: unknown, key?: string];

type IManifestServiceAugmentationsImpl<Scopes extends string> = {
  addClass(...args: AddClassArgs<Scopes>): IManifest<Scopes>;
  addFactory(...args: AddFactoryArgs<Scopes>): IManifest<Scopes>;
  addValue(...args: AddValueArgs): IManifest<Scopes>;
};

export const ManifestServiceAugmentations: AugmentationSet2<IManifest, IManifestServiceAugmentationsImpl<string>> = {
  addClass(receiver: IManifest, ...args: AddClassArgs<string>): IManifest {
    const [token, ctor, signatures, scope, key] = args;
    if (typeof token === 'string') {
      return receiver.addClass(Type.from(token), ctor, signatures, scope, key);
    }
    return receiver.add(ServiceDescriptor.ctor(token, ctor, TypeSignatures.from(signatures), scope, key));
  },
  addFactory(receiver: IManifest, ...args: AddFactoryArgs<string>): IManifest {
    const [token, factory, signatures, scope, key] = args;
    if (typeof token === 'string') {
      return receiver.addFactory(Type.from(token), factory, signatures, scope, key);
    }
    return receiver.add(ServiceDescriptor.factory(token, factory, TypeSignatures.from(signatures), scope, key));
  },
  addValue(receiver: IManifest, ...args: AddValueArgs): IManifest {
    const [token, value, key] = args;
    if (typeof token === 'string') {
      return receiver.addValue(Type.from(token), value, key);
    }
    return receiver.add(ServiceDescriptor.value(token, value, key));
  },
};

registerAugmentations(tokenfor<IManifest>(), ManifestServiceAugmentations);
