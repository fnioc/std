import type { Type } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { CtorServiceDescriptor, FactoryServiceDescriptor, ValuedServiceDescriptor } from './expressions';
import type { TypeSignatures } from './Signature';

export function ctor<Scopes extends string>(serviceType: Type, implementation: Ctor, signatures: TypeSignatures,
  scope?: Scopes): CtorServiceDescriptor<Scopes> {
  return { kind: 'ctor', serviceType, ctor: implementation, signatures, scope };
}

export function factory<Scopes extends string>(serviceType: Type, implementation: Func, signatures: TypeSignatures,
  scope?: Scopes): FactoryServiceDescriptor<Scopes> {
  return { kind: 'factory', serviceType, factory: implementation, signatures, scope };
}

export function value<Scopes extends string>(serviceType: Type, value: any): ValuedServiceDescriptor<Scopes> {
  return { kind: 'value', serviceType, value };
}
