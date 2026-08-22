import { ConstructorType, FunctionType, Type } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { Flatten } from '@rhombus-toolkit/type-helpers';

/**
 * One registration: what a manifest resolves `serviceType` to. The member naming the
 * implementer — `ctor`, `factory`, or `value` — is what says which door the registration came in
 * by: the implementer's own type cannot (a `Func` registered as a value is handed back; the same
 * `Func` registered as a factory is called).
 */
export type ServiceDescriptor<Lifetime> =
  | CtorDescriptor<Lifetime>
  | FactoryDescriptor<Lifetime>
  | ValueDescriptor;

/** The lifetime a constructed registration is cached under; absent means the manifest's default. */
interface WithLifetime<Lifetime> {
  readonly lifetime?: Lifetime;
}

/**
 * A registration the container constructs with `new`.
 *
 * @remarks
 * `ctorType` is where the registration's parameter signatures live, so `ctor` and the calls it answers
 * to are read from one place and cannot disagree.
 */
export type CtorDescriptor<Lifetime> = Flatten<
  {
    readonly serviceType: Type;
    readonly ctor: Ctor;
    readonly ctorType: ConstructorType;
  } & WithLifetime<Lifetime>
>;

/** A registration the container calls. */
export type FactoryDescriptor<Lifetime> = Flatten<
  {
    readonly serviceType: Type;
    readonly factory: Func;
    readonly factoryType: FunctionType;
  } & WithLifetime<Lifetime>
>;

/**
 * A registration the container hands back as it stands.
 *
 * @remarks
 * It carries no lifetime: a value IS its instance, so there is no construction for a lifetime to
 * govern and nothing a lifetime could mean. And it carries no implementer type — a value has no
 * signature to read, no injection list, and nothing to call.
 */
export interface ValueDescriptor {
  readonly serviceType: Type;
  readonly value: unknown;
}
