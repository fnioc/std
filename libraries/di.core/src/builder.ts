import { type CtorType, type FunctionType, Type } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { ServiceDescriptor, type TypeSignatures } from './ServiceDescriptor';

/** A step the lambda has not spent yet. Each verb removes its own, so none can be taken twice. */
type Slot = 'impl' | 'implType' | 'lifetime' | 'tag';

/**
 * The steps still open, as one type: an intersection of the interfaces whose slots survive, plus
 * {@link IComplete} once the registration is whole.
 */
type Pending<T, ImplNode extends Type, Scopes extends string, Slots extends Slot, Ready extends boolean> =
  & (Ready extends true ? IComplete : unknown)
  & ('impl' extends Slots ? IAsImpl<T, Scopes, Slots, Ready> : unknown)
  & ('implType' extends Slots ? IWithImplType<T, ImplNode, Scopes, Slots> : unknown)
  & ('lifetime' extends Slots ? IWithLifetime<T, ImplNode, Scopes, Slots, Ready> : unknown)
  & ('tag' extends Slots ? ITaggedAs<T, ImplNode, Scopes, Slots, Ready> : unknown);

/**
 * Choosing what produces the service. Each door takes only implementations that produce `T`, so a
 * registration that could not satisfy its own address is refused where it is written.
 */
interface IAsImpl<T, Scopes extends string, Slots extends Slot, Ready extends boolean> {
  asClass(ctor: Ctor<any[], T>): Pending<T, CtorType, Scopes, Exclude<Slots, 'impl'> | 'implType', Ready>;
  asFactory(fn: Func<any[], T>): Pending<T, FunctionType, Scopes, Exclude<Slots, 'impl'> | 'implType', Ready>;
  asValue(value: T): Pending<T, never, Scopes, Extract<Slots, 'tag'>, true>;
}

/**
 * Naming the implementation's call shape — the one step that completes a constructed registration,
 * and the only place a signature is spelled.
 *
 * @remarks
 * Two doors onto one slot: taking either spends it, so a registration names its call shape exactly
 * once and the two spellings can never disagree.
 */
interface IWithImplType<T, ImplNode extends Type, Scopes extends string, Slots extends Slot> {
  /** The argument types the implementation is handed, in order — the address supplies the rest. */
  withSignature(...paramTypes: Array<Type | string>): Pending<T, ImplNode, Scopes, Exclude<Slots, 'implType'>, true>;

  /**
   * The implementation's whole type. An intersection of them describes an overloaded
   * implementation, where each member is one call signature the container may use.
   */
  withType(implType: ImplNode): Pending<T, ImplNode, Scopes, Exclude<Slots, 'implType'>, true>;
}

interface IWithLifetime<T, ImplNode extends Type, Scopes extends string, Slots extends Slot, Ready extends boolean> {
  withLifetime(scope: Scopes): Pending<T, ImplNode, Scopes, Exclude<Slots, 'lifetime'>, Ready>;
}

interface ITaggedAs<T, ImplNode extends Type, Scopes extends string, Slots extends Slot, Ready extends boolean> {
  taggedAs(key: string): Pending<T, ImplNode, Scopes, Exclude<Slots, 'tag'>, Ready>;
}

declare const implTypeSupplied: unique symbol;

/**
 * A registration the lambda may hand back: an implementation is chosen and its call shape named.
 * The brand is unexported, so only this module's own steps can produce one.
 */
export interface IComplete {
  readonly [implTypeSupplied]: void;
}

/** A registration with nothing chosen yet — what the configure lambda is handed. */
export type Unstarted<T = any, Scopes extends string = any> = Pending<
  T,
  never,
  Scopes,
  'impl' | 'lifetime' | 'tag',
  false
>;

/** How the implementation's call shape was named — through one door or the other, never both. */
export type ImplShape =
  | { readonly kind: 'signature'; readonly paramTypes: ReadonlyArray<Type | string>; }
  | { readonly kind: 'type'; readonly implType: Type; };

/** What a configured lambda leaves behind, ready to become a descriptor. */
export interface PendingState<Scopes extends string> {
  readonly impl: { kind: 'ctor'; ctor: Ctor; } | { kind: 'factory'; fn: Func; } | { kind: 'value'; value: unknown; }
    | undefined;
  readonly implShape: ImplShape | undefined;
  readonly scope: Scopes | undefined;
  readonly tag: string | undefined;
}

/**
 * The node the configure lambda walks. Every step hands back a new node, so a discarded
 * intermediate configures nothing — the same rule the manifest itself follows.
 */
export class PendingRegistration<Scopes extends string> implements PendingState<Scopes> {
  readonly impl: PendingState<Scopes>['impl'];
  readonly implShape: ImplShape | undefined;
  readonly scope: Scopes | undefined;
  readonly tag: string | undefined;

  constructor(state?: Partial<PendingState<Scopes>>) {
    this.impl = state?.impl;
    this.implShape = state?.implShape;
    this.scope = state?.scope;
    this.tag = state?.tag;
  }

  #with(change: Partial<PendingState<Scopes>>): PendingRegistration<Scopes> {
    return new PendingRegistration<Scopes>({ ...this, ...change });
  }

  /** @throws Error - when a call shape was already named. */
  #withShape(implShape: ImplShape): PendingRegistration<Scopes> {
    if (this.implShape !== undefined) {
      throw new Error(
        `the implementation's call shape is already named by ${
          this.implShape.kind === 'type' ? 'withType' : 'withSignature'
        }; the two are one choice, taken once.`,
      );
    }
    return this.#with({ implShape });
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

  withSignature(...paramTypes: Array<Type | string>) {
    return this.#withShape({ kind: 'signature', paramTypes });
  }

  withType(implType: Type) {
    return this.#withShape({ kind: 'type', implType });
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
    const impl = this.impl;
    if (impl === undefined) {
      throw new Error(`no implementation was chosen for ${Type.stringify(type)}.`);
    }
    if (impl.kind === 'value') {
      return ServiceDescriptor.value(serviceType, impl.value);
    }
    const signatures = this.#signatures(type);
    switch (impl.kind) {
      case 'ctor':
        return ServiceDescriptor.ctor(serviceType, impl.ctor, signatures, this.scope);
      case 'factory':
        return ServiceDescriptor.factory(serviceType, impl.fn, signatures, this.scope);
      default:
        return assertNever(impl);
    }
  }

  /** @throws Error - when no call shape was named. */
  #signatures(type: Type): TypeSignatures {
    const shape = this.implShape;
    if (shape === undefined) {
      throw new Error(
        `no call shape was named for ${Type.stringify(type)}; give the implementation's argument `
          + 'types to withSignature, or its whole type to withType.',
      );
    }
    if (shape.kind === 'signature') {
      return [shape.paramTypes.map(param => typeof param === 'string' ? Type.from(param) : param)];
    }
    return [...callSignatures(shape.implType)];
  }
}

/** Runs a configure lambda over a fresh node and returns the descriptor it describes. */
export function describe<T, Scopes extends string>(type: Type | string,
  configure: Func<[Unstarted<T, Scopes>], IComplete>): ServiceDescriptor<Scopes> {
  const node = new PendingRegistration<Scopes>();
  const configured = configure(node as unknown as Unstarted<T, Scopes>) as unknown as PendingRegistration<Scopes>;
  return configured.toDescriptor(typeof type === 'string' ? Type.from(type) : type);
}

/**
 * The argument lists a composed implementation type describes, one per call signature.
 *
 * @throws Error - when the type describes nothing callable.
 */
function* callSignatures(implType: Type): Generator<readonly Type[]> {
  switch (implType.kind) {
    case 'ctor':
    case 'function': {
      yield implType.args;
      return;
    }
    case 'intersection': {
      for (const member of implType.members) {
        yield* callSignatures(member);
      }
      return;
    }
    default: {
      throw new Error(
        `${Type.stringify(implType)} describes nothing callable; withType takes a constructor or `
          + 'function type, or an intersection of them for an overloaded implementation.',
      );
    }
  }
}
