import { ConstructorType, Flatten, FunctionType, Type } from '@rhombus-std/primitives';
import { Ctor, Func } from '@rhombus-toolkit/func';

/**
 * One registration: what a manifest resolves `serviceType` to, discriminated by {@link kind} —
 * a constructor, a factory function, or a fixed value.
 */
export type ServiceDescriptor<Scopes extends string> =
  | CtorDescriptor<Scopes>
  | FactoryDescriptor<Scopes>
  | ValueDescriptor;

/**
 * What every registration carries, whatever produces its service: the address it answers to, the
 * thing that implements it, and that thing's own type.
 *
 * @remarks
 * `implementerType` is where a constructed registration's parameter rows live, so `implementer`
 * and the calls it answers to are read from one place and cannot disagree.
 */
interface Descriptor<Kind extends string, Implementer, ImplementerType extends Type> {
  readonly kind: Kind;
  readonly serviceType: Type;
  readonly implementer: Implementer;
  readonly implementerType: ImplementerType;
}

/** The lifetime a constructed registration is cached under; absent means the manifest's default. */
interface Scoped<Scopes extends string> {
  readonly scope?: Scopes;
}

/** A registration the container constructs with `new`. */
export type CtorDescriptor<Scopes extends string> = Flatten<
  Descriptor<'ctor', Ctor, ConstructorType> & Scoped<Scopes>
>;

/** A registration the container calls. */
export type FactoryDescriptor<Scopes extends string> = Flatten<
  Descriptor<'factory', Func, FunctionType> & Scoped<Scopes>
>;

/**
 * A registration the container hands back as it stands.
 *
 * @remarks
 * It carries no scope: a value IS its instance, so there is no construction for a lifetime to
 * govern and nothing a scope could mean.
 */
export type ValueDescriptor = Descriptor<'value', unknown, Type>;
