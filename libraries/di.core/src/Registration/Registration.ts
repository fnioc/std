import { ConstructorType, FunctionType, Type } from '@rhombus-std/primitives';
import type { Ctor, Flatten, Func } from '@rhombus-toolkit/types';

/**
 * One registration: what a manifest resolves `address` to. The member naming the
 * implementer — `ctor`, `factory`, or `value` — is what says which door the registration came in
 * by: the implementer's own type cannot (a `Func` registered as a value is handed back; the same
 * `Func` registered as a factory is called).
 */
export type Registration<Lifetime> =
  | CtorRegistration<Lifetime>
  | FactoryRegistration<Lifetime>
  | ValueRegistration;

/**
 * The lifetime a constructed registration is cached under — a model's own vocabulary value.
 * Omittable only where the vocabulary admits `undefined`.
 */
interface WithLifetimeMembers<Lifetime> {
  readonly lifetime: Lifetime;
}
type WithLifetime<Lifetime> = Readonly<undefined extends Lifetime ? Partial<WithLifetimeMembers<Lifetime>> : Required<WithLifetimeMembers<Lifetime>>>;
/**
 * A registration the container constructs with `new`.
 *
 * @remarks
 * `ctorType` is where the registration's signatures live, so `ctor` and the calls it answers
 * to are read from one place and cannot disagree.
 */
export type CtorRegistration<Lifetime> = Flatten<
  {
    readonly address: Type;
    readonly ctor: Ctor;
    readonly ctorType: ConstructorType;
  } & WithLifetime<Lifetime>
>;

/** A registration the container calls. */
export type FactoryRegistration<Lifetime> = Flatten<
  {
    readonly address: Type;
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
export interface ValueRegistration {
  readonly address: Type;
  readonly value: unknown;
}
