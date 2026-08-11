import { Ctor, Func } from '@rhombus-toolkit/func';

type Slot = 'signature' | 'signatures' | 'lifetime' | 'tag';

type Pending<Scopes extends string, Slots extends Slot, Ready extends boolean> =
  & (Ready extends true ? IComplete : unknown)
  & ('impl' extends Slots ? IAsImpl<Scopes, Slots, Ready> : unknown)
  & ('signature' extends Slots ? IUsingSignature<Scopes, Slots, Ready> : unknown)
  & ('signatures' extends Slots ? IUsingSignatures<Scopes, Slots> : unknown)
  & ('lifetime' extends Slots ? IWithLifetime<Scopes, Slots, Ready> : unknown)
  & ('tag' extends Slots ? ITaggedAs<Scopes, Slots, Ready> : unknown);

interface IUsingSignature<Scopes extends string, Slots extends Slot, Ready extends boolean> {
  usingSignature(...types: Array<Type | string>): Pending<Scopes, Exclude<Slots, 'signatures'>, true>;
}
interface IUsingSignatures<Scopes extends string, Slots extends Slot> {
  usingSignatures(
    ...overloads: Array<Array<Type | string>>
  ): Pending<Scopes, Exclude<Slots, 'signature' | 'signatures'>, true>;
}
interface IWithLifetime<Scopes extends string, Slots extends Slot, Ready extends boolean> {
  withLifetime(scope: Scopes): Pending<Scopes, Exclude<Slots, 'lifetime'>, Ready>;
}
interface IAsImpl<Scopes extends string, Slots extends Slot, Ready extends boolean> {
  asClass(ctor: Ctor): Pending<Scopes, Exclude<Slots, 'impl'> | 'signature' | 'signatures', Ready>;
  asFactory(fn: Func): Pending<Scopes, Exclude<Slots, 'impl'> | 'signature' | 'signatures', Ready>;
  asValue(value: unknown): Pending<Scopes, 'tag', true>;
}
interface ITaggedAs<Scopes extends string, Slots extends Slot, Ready extends boolean> {
  taggedAs(key: string): Pending<Scopes, Exclude<Slots, 'tag'>, Ready>;
}

declare const signatureSupplied: unique symbol;
interface IComplete {
  readonly [signatureSupplied]: void;
}

export type Unstarted<Scopes extends string> = Pending<Scopes, 'impl' | 'lifetime' | 'tag', false>;
// interface IUnstarted<Scopes extends string> {
//   asClass(ctor: Ctor): Pending<Scopes, 'signature' | 'signatures' | 'lifetime' | 'tag', false>;
//   asFactory(fn: Func): Pending<Scopes, 'signature' | 'signatures' | 'lifetime' | 'tag', false>;
//   asValue(value: unknown): Pending<Scopes, 'tag', true>;
// }
