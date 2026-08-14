import { type ConstructorType, type FunctionType, Type, type TypeSignatures } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { withKey } from './service-type';
import { ServiceDescriptor } from './ServiceDescriptor';

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
  asClass(ctor: Ctor<any[], T>): Pending<T, ConstructorType, Scopes, Exclude<Slots, 'impl'> | 'implType', Ready>;
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
  /** The parameter types the implementation is handed, in order — the address supplies the rest. */
  withSignature(...paramTypes: Array<Type | string>): Pending<T, ImplNode, Scopes, Exclude<Slots, 'implType'>, true>;

  /**
   * The parameter rows an overloaded implementation is handed — one row per call it accepts, each
   * a list of parameter types in order.
   */
  withSignatures(
    ...signatures: ReadonlyArray<ReadonlyArray<Type | string>>
  ): Pending<T, ImplNode, Scopes, Exclude<Slots, 'implType'>, true>;

  /**
   * The implementation's whole type — a constructor type after {@link IAsImpl.asClass}, a function
   * type after {@link IAsImpl.asFactory}. Its parameter rows are the calls the container may build
   * the service through.
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
  | { readonly kind: 'signatures'; readonly signatures: ReadonlyArray<ReadonlyArray<Type | string>>; }
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
        "the implementation's call shape is already named; withType and withSignature/withSignatures "
          + 'are one choice, taken once.',
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
    return this.#withShape({ kind: 'signatures', signatures: [paramTypes] });
  }

  withSignatures(...signatures: ReadonlyArray<ReadonlyArray<Type | string>>) {
    return this.#withShape({ kind: 'signatures', signatures });
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
    const serviceType = withKey(type, this.tag);
    const impl = this.impl;
    if (impl === undefined) {
      throw new Error(`no implementation was chosen for ${Type.stringify(type)}.`);
    }
    if (impl.kind === 'value') {
      return ServiceDescriptor.value(serviceType, impl.value);
    }
    switch (impl.kind) {
      case 'ctor':
        return ServiceDescriptor.ctor(serviceType, impl.ctor, this.#constructorType(type), this.scope);
      case 'factory':
        return ServiceDescriptor.factory(serviceType, impl.fn, this.#functionType(type), this.scope);
      default:
        return assertNever(impl);
    }
  }

  /**
   * The constructor type this registration named: the node handed to `withType`, or the anonymous
   * one its parameter rows describe — a constructor building the very type it is registered under,
   * which is the strongest claim a row-only registration makes.
   *
   * @throws Error - when no call shape was named, or the one named is not a constructor type.
   */
  #constructorType(type: Type): ConstructorType {
    const shape = this.#shape(type);
    if (shape.kind === 'signatures') {
      return Type.ctor({ instanceType: type, args: rows(shape.signatures) });
    }
    if (shape.implType.kind !== 'ctor') {
      throw new Error(
        `${Type.stringify(shape.implType)} is not a constructor type; a class registration names `
          + "one with withType, or the constructor's parameters with withSignature.",
      );
    }
    return shape.implType;
  }

  /**
   * The function type this registration named: the node handed to `withType`, or the anonymous one
   * its parameter rows describe — a function producing the very type it is registered under.
   *
   * @throws Error - when no call shape was named, or the one named is not a function type.
   */
  #functionType(type: Type): FunctionType {
    const shape = this.#shape(type);
    if (shape.kind === 'signatures') {
      return Type.func({ returnType: type, args: rows(shape.signatures) });
    }
    if (shape.implType.kind !== 'func') {
      throw new Error(
        `${Type.stringify(shape.implType)} is not a function type; a factory registration names one `
          + "with withType, or the factory's parameters with withSignature.",
      );
    }
    return shape.implType;
  }

  /** @throws Error - when no call shape was named. */
  #shape(type: Type): ImplShape {
    const shape = this.implShape;
    if (shape === undefined) {
      throw new Error(
        `no call shape was named for ${Type.stringify(type)}; give the implementation's parameter `
          + 'types to withSignature, or its whole type to withType.',
      );
    }
    return shape;
  }
}

/** Parameter rows as the node takes them, each token read into the type it spells. */
function rows(signatures: ReadonlyArray<ReadonlyArray<Type | string>>): TypeSignatures {
  return signatures.map(row => row.map(param => typeof param === 'string' ? Type.from(param) : param));
}

/**
 * What a registration verb takes after its service type: the lambda that walks the steps, or the
 * whole registration stated at once.
 *
 * @remarks
 * The terse form names the implementation's composed type rather than a bare parameter list, so a
 * signature is spelled in one place and one place only. Compose it with the ADDRESS in the instance
 * slot — "a constructable producing the addressed type" is the strongest claim the container holds
 * for an explicit registration, and the instance slot is read by nothing else.
 */
export type DescribeArgs<Scopes extends string> =
  | [configure: Func<[Unstarted<any, Scopes>], IComplete>]
  | [impl: Ctor | Func, implType: ConstructorType | FunctionType, scope?: Scopes, key?: string];

/** The descriptor these arguments describe, whichever of the two forms they take. */
export function describe<Scopes extends string>(type: Type | string,
  ...args: DescribeArgs<Scopes>): ServiceDescriptor<Scopes> {
  const configured = args.length === 1
    ? walkSteps<Scopes>(args[0])
    : stateSteps<Scopes>(args[0], args[1], args[2], args[3]);
  return configured.toDescriptor(typeof type === 'string' ? Type.from(type) : type);
}

/** The node a configure lambda leaves behind. */
function walkSteps<Scopes extends string>(
  configure: Func<[Unstarted<any, Scopes>], IComplete>,
): PendingRegistration<Scopes> {
  const start = new PendingRegistration<Scopes>();
  return configure(start as unknown as Unstarted<any, Scopes>) as unknown as PendingRegistration<Scopes>;
}

/**
 * The same node, reached in one statement rather than a walk. The composed type's own kind is what
 * says whether the implementation is called with `new`, which is all the terse form needs it for
 * beyond its parameter rows.
 */
function stateSteps<Scopes extends string>(impl: Ctor | Func, implType: ConstructorType | FunctionType,
  scope: Scopes | undefined, key: string | undefined): PendingRegistration<Scopes> {
  const start = new PendingRegistration<Scopes>();
  const chosen = implType.kind === 'ctor' ? start.asClass(impl as Ctor) : start.asFactory(impl as Func);
  const shaped = chosen.withType(implType);
  const scoped = scope === undefined ? shaped : shaped.withLifetime(scope);
  return key === undefined ? scoped : scoped.taggedAs(key);
}
