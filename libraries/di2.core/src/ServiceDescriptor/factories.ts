import { Type } from '@rhombus-std/primitives';
import { Ctor, Func } from '@rhombus-toolkit/func';

export function ctor<Scopes extends string>(serviceType: Type, implementation: Ctor, signatures: TypeSignature,
  scope?: Scopes): CtorServiceDescriptor<Scopes> {
  return { kind: 'ctor', serviceType, ctor: implementation, signatures, scope };
}

export function factory<Scopes extends string>(serviceType: Type, implementation: Func, signatures: TypeSignature,
  scope?: Scopes): FactoryServiceDescriptor<Scopes> {
  return { kind: 'factory', serviceType, factory: implementation, signatures, scope };
}

export function value<Scopes extends string>(serviceType: Type, value: any): ValuedServiceDescriptor<Scopes> {
  return { kind: 'value', serviceType, value };
}
