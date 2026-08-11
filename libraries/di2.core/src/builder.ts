import { Type } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { ServiceDescriptor, TypeSignatures } from './ServiceDescriptor';

type Slot = 'impl' | 'signature' | 'signatures' | 'lifetime' | 'tag';

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

/**
 * A registration the lambda may hand back: an implementation is chosen and a signature supplied.
 * The brand is unexported, so only this module's own steps can produce one.
 */
export interface IComplete {
  readonly [signatureSupplied]: void;
}

export type Unstarted<Scopes extends string> = Pending<Scopes, 'impl' | 'lifetime' | 'tag', false>;

/** What a configured lambda leaves behind, ready to become a descriptor. */
export interface PendingState<Scopes extends string> {
  readonly impl: { kind: 'ctor'; ctor: Ctor; } | { kind: 'factory'; fn: Func; } | { kind: 'value'; value: unknown; }
    | undefined;
  readonly signatures: ReadonlyArray<ReadonlyArray<Type | string>>;
  readonly scope: Scopes | undefined;
  readonly tag: string | undefined;
}

/**
 * The node the configure lambda walks. Every step hands back a new node, so a discarded
 * intermediate configures nothing — the same rule the manifest itself follows.
 */
export class PendingRegistration<Scopes extends string> implements PendingState<Scopes> {
  readonly impl: PendingState<Scopes>['impl'];
  readonly signatures: ReadonlyArray<ReadonlyArray<Type | string>>;
  readonly scope: Scopes | undefined;
  readonly tag: string | undefined;

  constructor(state?: Partial<PendingState<Scopes>>) {
    this.impl = state?.impl;
    this.signatures = state?.signatures ?? [];
    this.scope = state?.scope;
    this.tag = state?.tag;
  }

  #with(change: Partial<PendingState<Scopes>>): PendingRegistration<Scopes> {
    return new PendingRegistration<Scopes>({ ...this, ...change });
  }

  asClass(ctor: Ctor) {
    return this.#with({ impl: { kind: 'ctor', ctor } });
  }
  asFactory(fn: Func) {
    return this.#with({ impl: { kind: 'factory', fn } });
  }
  asValue(value: unknown) {
    return this.#with({ impl: { kind: 'value', value } });
  }
  usingSignature(...types: Array<Type | string>) {
    return this.#with({ signatures: [...this.signatures, types] });
  }
  usingSignatures(...overloads: Array<Array<Type | string>>) {
    return this.#with({ signatures: overloads });
  }
  withLifetime(scope: Scopes) {
    return this.#with({ scope });
  }
  taggedAs(key: string) {
    return this.#with({ tag: key });
  }

  /** The descriptor this node describes, filed under `type` and whatever tag it carries. */
  toDescriptor(type: Type): ServiceDescriptor<Scopes> {
    if (this.tag !== undefined && type.kind === 'tag') {
      throw new Error(`${Type.stringify(type)} already carries a tag; it cannot take the key ${this.tag}.`);
    }
    const serviceType = this.tag === undefined ? type : Type.tag(type, this.tag);
    const signatures = TypeSignatures.from(this.signatures);
    switch (this.impl?.kind) {
      case 'ctor':
        return ServiceDescriptor.ctor(serviceType, this.impl.ctor, signatures, this.scope);
      case 'factory':
        return ServiceDescriptor.factory(serviceType, this.impl.fn, signatures, this.scope);
      case 'value':
        return ServiceDescriptor.value(serviceType, this.impl.value);
      default:
        throw new Error(`no implementation was chosen for ${Type.stringify(type)}.`);
    }
  }
}

/** Runs a configure lambda over a fresh node and returns the descriptor it describes. */
export function describe<Scopes extends string>(type: Type | string,
  configure: Func<[Unstarted<Scopes>], IComplete>): ServiceDescriptor<Scopes> {
  const node = new PendingRegistration<Scopes>();
  const configured = configure(node as unknown as Unstarted<Scopes>) as unknown as PendingRegistration<Scopes>;
  return configured.toDescriptor(typeof type === 'string' ? Type.from(type) : type);
}
