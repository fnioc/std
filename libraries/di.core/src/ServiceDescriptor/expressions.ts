import { ConstructorType, FunctionType, Type } from '@rhombus-std/primitives';
import { Ctor, Func } from '@rhombus-toolkit/func';

/**
 * One registration: what a manifest resolves `serviceType` to, discriminated by {@link kind} —
 * a constructor, a factory function, or a fixed value.
 */
export type ServiceDescriptor<Scopes extends string> =
  | CtorServiceDescriptor<Scopes>
  | FactoryServiceDescriptor<Scopes>
  | ValuedServiceDescriptor<Scopes>;

/**
 * A constructor-built registration. {@link implType} is the constructor's whole type, so its
 * `args` are the parameter rows the container may build the instance through.
 */
export interface CtorServiceDescriptor<out Scopes extends string> {
  readonly kind: 'ctor';
  readonly serviceType: Type;
  readonly ctor: Ctor;
  readonly implType: ConstructorType;
  readonly scope?: Scopes;
}

/**
 * A factory-built registration. {@link implType} is the factory's whole type, so its `args` are
 * the parameter rows the container may call it through.
 */
export interface FactoryServiceDescriptor<out Scopes extends string> {
  readonly kind: 'factory';
  readonly serviceType: Type;
  readonly factory: Func;
  readonly implType: FunctionType;
  readonly scope?: Scopes;
}

export interface ValuedServiceDescriptor<out Scopes extends string> {
  readonly kind: 'value';
  readonly serviceType: Type;
  readonly value: any;
}
