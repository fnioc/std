import { Type } from '@rhombus-std/primitives';
import { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';

export type ServiceDescriptor<Scopes extends string> = CtorServiceDescriptor<Scopes> | FactoryServiceDescriptor<Scopes>
  | ValuedServiceDescriptor<Scopes>;

interface CtorServiceDescriptor<Scopes extends string> {
  readonly kind: 'ctor';
  readonly serviceType: Type;
  readonly ctor: Ctor;
  readonly signatures: ReadonlyArray<readonly Type[]>;
  readonly scope?: Scopes;
}

interface FactoryServiceDescriptor<Scopes extends string> {
  readonly kind: 'factory';
  readonly serviceType: Type;
  readonly factory: Func;
  readonly signatures: ReadonlyArray<readonly Type[]>;
  readonly scope?: Scopes;
}

interface ValuedServiceDescriptor<Scopes extends string> {
  readonly kind: 'value';
  readonly serviceType: Type;
  readonly value: any;
}

export namespace ServiceDescriptor {
  export function ctor<Scopes extends string>(serviceType: Type, implementation: Ctor,
    signatures: ReadonlyArray<readonly Type[]>, scope?: Scopes): CtorServiceDescriptor<Scopes> {
    return { kind: 'ctor', serviceType, ctor: implementation, signatures, scope };
  }

  export function factory<Scopes extends string>(serviceType: Type, implementation: Func,
    signatures: ReadonlyArray<readonly Type[]>, scope?: Scopes): FactoryServiceDescriptor<Scopes> {
    return { kind: 'factory', serviceType, factory: implementation, signatures, scope };
  }

  export function value<Scopes extends string>(serviceType: Type, value: any): ValuedServiceDescriptor<Scopes> {
    return { kind: 'value', serviceType, value };
  }

  /**
   * Closes an open registration against the placeholders a `Type.satisfies` match captured,
   * rewriting `serviceType` and every signature parameter so the result stands on its own.
   */
  export function substitute<Scopes extends string>(descriptor: ServiceDescriptor<Scopes>,
    placeholders: ReadonlyMap<string, Type>): ServiceDescriptor<Scopes> {
    if (!placeholders.size) {
      return descriptor;
    }
    const serviceType = Type.substitute(descriptor.serviceType, placeholders);
    switch (descriptor.kind) {
      case 'value':
        return { ...descriptor, serviceType };
      case 'ctor':
        return { ...descriptor, serviceType, signatures: substituteSignatures(descriptor.signatures, placeholders) };
      case 'factory':
        return { ...descriptor, serviceType, signatures: substituteSignatures(descriptor.signatures, placeholders) };
      default:
        return assertNever(descriptor);
    }
  }

  export function equals(left: ServiceDescriptor<string>, right: ServiceDescriptor<string>): boolean {
    if (left === right) {
      return true;
    }
    if (left.kind !== right.kind || !matches(left, right)) {
      return false;
    }
    switch (left.kind) {
      case 'ctor': {
        const other = right as CtorServiceDescriptor<string>;
        return left.ctor === other.ctor && left.scope === other.scope
          && signaturesEqual(left.signatures, other.signatures);
      }
      case 'factory': {
        const other = right as FactoryServiceDescriptor<string>;
        return left.factory === other.factory && left.scope === other.scope
          && signaturesEqual(left.signatures, other.signatures);
      }
      case 'value':
        return left.value === (right as ValuedServiceDescriptor<string>).value;
      default:
        return assertNever(left);
    }
  }
  /**
   * Do the two occupy the same registration slot? The service type is the whole of a
   * registration's identity — a keyed registration carries its key inside that type, as a tag.
   */
  export function matches(left: ServiceDescriptor<string>, right: ServiceDescriptor<string>): boolean {
    return Type.equals(left.serviceType, right.serviceType);
  }
}

function signaturesEqual(left: ReadonlyArray<readonly Type[]>, right: ReadonlyArray<readonly Type[]>): boolean {
  return left.length === right.length && left.every((signature, index) =>
    signature.length === right[index]!.length
    && signature.every((param, position) => Type.equals(param, right[index]![position]!))
  );
}

function substituteSignatures(signatures: ReadonlyArray<readonly Type[]>,
  placeholders: ReadonlyMap<string, Type>): ReadonlyArray<readonly Type[]> {
  return signatures.map(signature => signature.map(param => Type.substitute(param, placeholders)));
}
