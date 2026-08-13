import { type ConstructorType, type FunctionType, type IntersectionType, Type } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { withKey } from './service-type';
import { ServiceDescriptor, TypeSignatures } from './ServiceDescriptor';

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
  /** The argument types the implementation is handed, in order — the address supplies the rest. */
  withSignature(...paramTypes: Array<Type | string>): Pending<T, ImplNode, Scopes, Exclude<Slots, 'implType'>, true>;

  /**
   * The implementation's whole type — a constructor type after {@link IAsImpl.asClass}, a function
   * type after {@link IAsImpl.asFactory}. An intersection of them describes an overloaded
   * implementation, where each member is one call signature the container may use.
   */
  withType(implType: ImplNode | IntersectionType): Pending<T, ImplNode, Scopes, Exclude<Slots, 'implType'>, true>;
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
    const serviceType = withKey(type, this.tag);
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
    return TypeSignatures.fromImplType(shape.implType as ConstructorType | FunctionType | IntersectionType);
  }
}

/**
 * What a registration verb takes after its service type: the lambda that walks the steps, or the
 * whole registration stated at once.
 *
 * @remarks
 * The terse form names the implementation's composed type rather than a bare argument list, so a
 * signature is spelled in one place and one place only. Compose it with the ADDRESS in the instance
 * slot — "a constructable producing the addressed type" is the strongest claim the container holds
 * for an explicit registration, and the instance slot is read by nothing else.
 */
export type DescribeArgs<Scopes extends string> =
  | [configure: Func<[Unstarted<any, Scopes>], IComplete>]
  | [impl: Ctor | Func, implType: Type, scope?: Scopes, key?: string];

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

/** The same node, reached in one statement rather than a walk. */
function stateSteps<Scopes extends string>(impl: Ctor | Func, implType: Type, scope: Scopes | undefined,
  key: string | undefined): PendingRegistration<Scopes> {
  const start = new PendingRegistration<Scopes>();
  const chosen = namesAConstructor(implType) ? start.asClass(impl as Ctor) : start.asFactory(impl as Func);
  const shaped = chosen.withType(implType);
  const scoped = scope === undefined ? shaped : shaped.withLifetime(scope);
  return key === undefined ? scoped : scoped.taggedAs(key);
}

/**
 * Whether the composed type calls its implementation with `new` — which is the whole of what the
 * terse form needs the node for beyond its argument lists.
 *
 * @throws Error - when the type describes nothing callable, or an overload set that is called both
 * ways at once.
 */
function namesAConstructor(implType: Type): boolean {
  if (implType.kind === 'ctor') {
    return true;
  }
  if (implType.kind === 'func') {
    return false;
  }
  if (implType.kind === 'intersection') {
    const constructors = implType.members.filter(member => member.kind === 'ctor');
    if (constructors.length && constructors.length !== implType.members.length) {
      throw new Error(
        `${Type.stringify(implType)} mixes constructor and function signatures; one implementation `
          + 'is called one way or the other.',
      );
    }
    return !!constructors.length;
  }
  throw new Error(
    `${Type.stringify(implType)} describes nothing callable; name a constructor or function type, `
      + 'or an intersection of them for an overloaded implementation.',
  );
}
