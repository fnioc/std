import { Type } from '@rhombus-std/primitives';
import { Ctor, Func } from '@rhombus-toolkit/func';

/**
 * One registration: what a manifest resolves `serviceType` to, discriminated by {@link kind} —
 * a constructor, a factory function, or a fixed value.
 */
export type ServiceDescriptor<Scopes extends string> =
  | CtorServiceDescriptor<Scopes>
  | FactoryServiceDescriptor<Scopes>
  | ValuedServiceDescriptor<Scopes>;

export interface CtorServiceDescriptor<out Scopes extends string> {
  readonly kind: 'ctor';
  readonly serviceType: Type;
  readonly ctor: Ctor;
  readonly signatures: ReadonlyArray<readonly Type[]>;
  readonly scope?: Scopes;
}

export interface FactoryServiceDescriptor<out Scopes extends string> {
  readonly kind: 'factory';
  readonly serviceType: Type;
  readonly factory: Func;
  readonly signatures: ReadonlyArray<readonly Type[]>;
  readonly scope?: Scopes;
}

export interface ValuedServiceDescriptor<out Scopes extends string> {
  readonly kind: 'value';
  readonly serviceType: Type;
  readonly value: any;
}
