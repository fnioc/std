import { type ConstructorType, type FunctionType, Type, type TypeSignatures } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { withKey } from './service-type';
import { ServiceDescriptor } from './ServiceDescriptor';

/** A step the lambda has not spent yet. Each verb removes its own, so none can be taken twice. */
type Slot = 'implementer' | 'implementerType' | 'lifetime' | 'tag';

/**
 * The steps still open, as one type: an intersection of the interfaces whose slots survive, plus
 * {@link IComplete} once the registration is whole.
 */
type Pending<T, ImplementerNode extends Type, Scopes extends string, Slots extends Slot, Ready extends boolean> =
  & (Ready extends true ? IComplete : unknown)
  & ('implementer' extends Slots ? IAsImplementer<T, Scopes, Slots, Ready> : unknown)
  & ('implementerType' extends Slots ? IWithImplementerType<T, ImplementerNode, Scopes, Slots> : unknown)
  & ('lifetime' extends Slots ? IWithLifetime<T, ImplementerNode, Scopes, Slots, Ready> : unknown)
  & ('tag' extends Slots ? ITaggedAs<T, ImplementerNode, Scopes, Slots, Ready> : unknown);

/**
 * Choosing what produces the service. Each door takes only implementations that produce `T`, so a
 * registration that could not satisfy its own address is refused where it is written.
 */
interface IAsImplementer<T, Scopes extends string, Slots extends Slot, Ready extends boolean> {
  asClass(
    ctor: Ctor<any[], T>,
  ): Pending<T, ConstructorType, Scopes, Exclude<Slots, 'implementer'> | 'implementerType', Ready>;
  asFactory(
    fn: Func<any[], T>,
  ): Pending<T, FunctionType, Scopes, Exclude<Slots, 'implementer'> | 'implementerType', Ready>;
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
interface IWithImplementerType<T, ImplementerNode extends Type, Scopes extends string, Slots extends Slot> {
  /** The parameter types the implementation is handed, in order — the address supplies the rest. */
  withSignature(
    ...paramTypes: Array<Type | string>
  ): Pending<T, ImplementerNode, Scopes, Exclude<Slots, 'implementerType'>, true>;

  /**
   * The parameter rows an overloaded implementation is handed — one row per call it accepts, each
   * a list of parameter types in order.
   */
  withSignatures(
    ...signatures: ReadonlyArray<ReadonlyArray<Type | string>>
  ): Pending<T, ImplementerNode, Scopes, Exclude<Slots, 'implementerType'>, true>;

  /**
   * The implementation's whole type — a constructor type after {@link IAsImplementer.asClass}, a function
   * type after {@link IAsImplementer.asFactory}. Its parameter rows are the calls the container may build
   * the service through.
   */
  withType(
    implementerType: ImplementerNode,
  ): Pending<T, ImplementerNode, Scopes, Exclude<Slots, 'implementerType'>, true>;
}

interface IWithLifetime<T, ImplementerNode extends Type, Scopes extends string, Slots extends Slot,
  Ready extends boolean> {
  withLifetime(scope: Scopes): Pending<T, ImplementerNode, Scopes, Exclude<Slots, 'lifetime'>, Ready>;
}

interface ITaggedAs<T, ImplementerNode extends Type, Scopes extends string, Slots extends Slot, Ready extends boolean> {
  taggedAs(key: string): Pending<T, ImplementerNode, Scopes, Exclude<Slots, 'tag'>, Ready>;
}

declare const implementerTypeSupplied: unique symbol;

/**
 * A registration the lambda may hand back: an implementation is chosen and its call shape named.
 * The brand is unexported, so only this module's own steps can produce one.
 */
export interface IComplete {
  readonly [implementerTypeSupplied]: void;
}

/** A registration with nothing chosen yet — what the configure lambda is handed. */
export type Unstarted<T = any, Scopes extends string = any> = Pending<
  T,
  never,
  Scopes,
  'implementer' | 'lifetime' | 'tag',
  false
>;

/** How the implementation's call shape was named — through one door or the other, never both. */
export type ImplementerShape =
  | { readonly kind: 'signatures'; readonly signatures: ReadonlyArray<ReadonlyArray<Type | string>>; }
  | { readonly kind: 'type'; readonly implementerType: Type; };

/** What a configured lambda leaves behind, ready to become a descriptor. */
export interface PendingState<Scopes extends string> {
  readonly implementer: { kind: 'ctor'; ctor: Ctor; } | { kind: 'factory'; fn: Func; } | { kind: 'value';
    value: unknown; } | undefined;
  readonly implementerShape: ImplementerShape | undefined;
  readonly scope: Scopes | undefined;
  readonly tag: string | undefined;
}

/**
 * The node the configure lambda walks. Every step hands back a new node, so a discarded
 * intermediate configures nothing — the same rule the manifest itself follows.
 */
export class PendingRegistration<Scopes extends string> implements PendingState<Scopes> {
  readonly implementer: PendingState<Scopes>['implementer'];
  readonly implementerShape: ImplementerShape | undefined;
  readonly scope: Scopes | undefined;
  readonly tag: string | undefined;

  constructor(state?: Partial<PendingState<Scopes>>) {
    this.implementer = state?.implementer;
    this.implementerShape = state?.implementerShape;
    this.scope = state?.scope;
    this.tag = state?.tag;
  }

  #with(change: Partial<PendingState<Scopes>>): PendingRegistration<Scopes> {
    return new PendingRegistration<Scopes>({ ...this, ...change });
  }

  /** @throws Error - when a call shape was already named. */
  #withShape(implementerShape: ImplementerShape): PendingRegistration<Scopes> {
    if (this.implementerShape !== undefined) {
      throw new Error(
        "the implementation's call shape is already named; withType and withSignature/withSignatures "
          + 'are one choice, taken once.',
      );
    }
    return this.#with({ implementerShape });
  }

  asClass(ctor: Ctor) {
    return this.#with({ implementer: { kind: 'ctor', ctor } });
  }

  asFactory(fn: Func) {
    return this.#with({ implementer: { kind: 'factory', fn } });
  }

  asValue(value: unknown) {
    return this.#with({ implementer: { kind: 'value', value } });
  }

  withSignature(...paramTypes: Array<Type | string>) {
    return this.#withShape({ kind: 'signatures', signatures: [paramTypes] });
  }

  withSignatures(...signatures: ReadonlyArray<ReadonlyArray<Type | string>>) {
    return this.#withShape({ kind: 'signatures', signatures });
  }

  withType(implementerType: Type) {
    return this.#withShape({ kind: 'type', implementerType });
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
    const implementer = this.implementer;
    if (implementer === undefined) {
      throw new Error(`no implementer was chosen for ${Type.stringify(type)}.`);
    }
    if (implementer.kind === 'value') {
      return ServiceDescriptor.value(serviceType, implementer.value);
    }
    switch (implementer.kind) {
      case 'ctor':
        return ServiceDescriptor.ctor(serviceType, implementer.ctor, this.#constructorType(type), this.scope);
      case 'factory':
        return ServiceDescriptor.factory(serviceType, implementer.fn, this.#functionType(type), this.scope);
      default:
        return assertNever(implementer);
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
      return Type.ctor({ instanceType: type, args: rows(shape.signatures), genericArgs: [] });
    }
    if (shape.implementerType.kind !== 'ctor') {
      throw new Error(
        `${Type.stringify(shape.implementerType)} is not a constructor type; a class registration names `
          + "one with withType, or the constructor's parameters with withSignature.",
      );
    }
    return shape.implementerType;
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
      return Type.func({ returnType: type, args: rows(shape.signatures), genericArgs: [] });
    }
    if (shape.implementerType.kind !== 'func') {
      throw new Error(
        `${Type.stringify(shape.implementerType)} is not a function type; a factory registration names one `
          + "with withType, or the factory's parameters with withSignature.",
      );
    }
    return shape.implementerType;
  }

  /** @throws Error - when no call shape was named. */
  #shape(type: Type): ImplementerShape {
    const shape = this.implementerShape;
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
  | [implementer: Ctor | Func, implementerType: ConstructorType | FunctionType, scope?: Scopes, key?: string];

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
function stateSteps<Scopes extends string>(implementer: Ctor | Func, implementerType: ConstructorType | FunctionType,
  scope: Scopes | undefined, key: string | undefined): PendingRegistration<Scopes> {
  const start = new PendingRegistration<Scopes>();
  const chosen = implementerType.kind === 'ctor'
    ? start.asClass(implementer as Ctor)
    : start.asFactory(implementer as Func);
  const shaped = chosen.withType(implementerType);
  const scoped = scope === undefined ? shaped : shaped.withLifetime(scope);
  return key === undefined ? scoped : scoped.taggedAs(key);
}
