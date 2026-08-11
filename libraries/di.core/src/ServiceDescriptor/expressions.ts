import { Type } from '@rhombus-std/primitives';
import { Ctor, Func } from '@rhombus-toolkit/func';

export type ServiceDescriptor<Scopes extends string> = CtorServiceDescriptor<Scopes> | FactoryServiceDescriptor<Scopes>
  | ValuedServiceDescriptor<Scopes>;

export interface CtorServiceDescriptor<Scopes extends string> {
  readonly kind: 'ctor';
  readonly serviceType: Type;
  readonly ctor: Ctor;
  readonly signatures: ReadonlyArray<readonly Type[]>;
  readonly scope?: Scopes;
}

export interface FactoryServiceDescriptor<Scopes extends string> {
  readonly kind: 'factory';
  readonly serviceType: Type;
  readonly factory: Func;
  readonly signatures: ReadonlyArray<readonly Type[]>;
  readonly scope?: Scopes;
}

export interface ValuedServiceDescriptor<Scopes extends string> {
  readonly kind: 'value';
  readonly serviceType: Type;
  readonly value: any;
}
