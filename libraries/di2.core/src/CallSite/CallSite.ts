import { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { ServiceDescriptor } from '../ServiceDescriptor.js';
import type { Type } from '../Type/index.js';
import type { TypeVisitor } from '../Type/TypeVisitor.js';
import { isAllThere } from '../utils.js';
import { realizeCallSite } from './RealizeVisitor.js';

export type { RealizeContext } from './RealizeVisitor.js';

export type CallSite =
  | CtorCallSite
  | FactoryCallSite
  | LateBoundCallSite
  | ConstantCallSite
  | AdHocCallSite
  | ServiceProviderCallSite
  | IterableCallSite;

export namespace CallSite {
  export namespace make {
    export function ctor(ctor: Ctor, ...args: CallSite[]): CtorCallSite {
      return { kind: 'ctor', ctor, args };
    }
    export function factory(factory: Func, ...args: CallSite[]): FactoryCallSite {
      return { kind: 'factory', factory, args };
    }
    export function latebound(result: CallSite, ...params: string[]): LateBoundCallSite {
      return { kind: 'latebound', result, params };
    }
    export function constant(value: any): ConstantCallSite {
      return { kind: 'constant', value };
    }
    export function adhoc(label: string): AdHocCallSite {
      return { kind: 'adhoc', label };
    }
    export function serviceProvider(): ServiceProviderCallSite {
      return { kind: 'service-provider' };
    }
    export function iterable(types: Iterable<CallSite>): IterableCallSite {
      return { kind: 'iterable', types };
    }
  }

  export const realize = realizeCallSite;

  /**
   * Lowers an ALREADY-CLOSED descriptor — run it through {@link ServiceDescriptor.substitute}
   * first if the match captured placeholders. `visitor` supplies the recursion that turns each
   * signature parameter into the call site producing it.
   *
   * @throws {UnsatisfiableError} when no signature has every parameter satisfiable.
   */
  export function fromDescriptor(descriptor: ServiceDescriptor<string>, visitor: TypeVisitor<CallSite | undefined>):
    | CallSite
    | undefined {
    try {
      switch (descriptor.kind) {
        case 'value':
          return make.constant(descriptor.value);
        case 'ctor':
          return make.ctor(descriptor.ctor, ...lowerSignature(descriptor.signatures, visitor));
        case 'factory':
          return make.factory(descriptor.factory, ...lowerSignature(descriptor.signatures, visitor));
        default:
          return assertNever(descriptor);
      }
    } catch (error) {
      if (error == 'failzor') {
        return undefined;
      }
      throw error;
    }
  }

  /** The first signature whose every parameter lowers to a call site. */
  function lowerSignature(signatures: ReadonlyArray<readonly Type[]>,
    visitor: TypeVisitor<CallSite | undefined>): CallSite[] {
    const lowered = Array.from(signatures)
      .sort((a, b) => b.length - a.length)
      .map(signature => signature.map(param => visitor.visit(param)))
      .find(isAllThere);
    if (!lowered) {
      throw 'failzor';
    }
    return lowered;
  }
}

export interface CtorCallSite {
  readonly kind: 'ctor';
  readonly ctor: Ctor;
  readonly args: CallSite[];
}
/** A registered factory the engine invokes — {@link args} realize its parameters. */
export interface FactoryCallSite {
  readonly kind: 'factory';
  readonly factory: Func;
  readonly args: CallSite[];
}
/**
 * A function value handed back to the caller; each invocation realizes {@link result} with the
 * call's arguments filling the ad-hoc holes named by {@link params}, in order.
 */
export interface LateBoundCallSite {
  readonly kind: 'latebound';
  readonly result: CallSite;
  readonly params: readonly string[];
}
export interface ConstantCallSite {
  readonly kind: 'constant';
  readonly value: any;
}
export interface AdHocCallSite {
  readonly kind: 'adhoc';
  readonly label: string;
}
export interface ServiceProviderCallSite {
  readonly kind: 'service-provider';
}
export interface IterableCallSite {
  readonly kind: 'iterable';
  readonly types: Iterable<CallSite>;
}
