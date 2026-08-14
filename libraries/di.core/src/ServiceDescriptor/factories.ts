import type { ConstructorType, FunctionType, Type } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { CtorServiceDescriptor, FactoryServiceDescriptor, ValuedServiceDescriptor } from './expressions';

export function ctor<Scopes extends string>(serviceType: Type, implementation: Ctor, implType: ConstructorType,
  scope?: Scopes): CtorServiceDescriptor<Scopes> {
  return { kind: 'ctor', serviceType, ctor: implementation, implType, scope };
}

export function factory<Scopes extends string>(serviceType: Type, implementation: Func, implType: FunctionType,
  scope?: Scopes): FactoryServiceDescriptor<Scopes> {
  return { kind: 'factory', serviceType, factory: implementation, implType, scope };
}

export function value<Scopes extends string>(serviceType: Type, value: any): ValuedServiceDescriptor<Scopes> {
  return { kind: 'value', serviceType, value };
}
