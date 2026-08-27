import type { ConstructorType, FunctionType, Type } from '@rhombus-std/primitives';
import type { AbstractCtor, Ctor, Func } from '@rhombus-toolkit/func';
import { withKey } from './address';
import { type CtorRegistration, type FactoryRegistration, Registration, type ValueRegistration } from './Registration';

/** A step the chain has not spent yet. Each verb removes its own, so none can be taken twice. */
export type Slot = 'implementer' | 'lifetime' | 'tag';

/**
 * The steps still open, as one type: an intersection of the interfaces whose slots survive.
 * `Described` is `unknown` until an implementer is chosen; from then on the node IS that
 * registration, refined by whatever steps remain — except while a required lifetime is unspent:
 * when `undefined` is not assignable to `Lifetime` and the `lifetime` slot is still open, the
 * node withholds registration-ness, so a manifest verb refuses it until `withLifetime` is taken.
 */
export type RegistrationBuilder<T, Lifetime, Slots extends Slot, Described> =
  & ('lifetime' extends Slots ? (undefined extends Lifetime ? Described : unknown) : Described)
  & ('implementer' extends Slots ? IAsImplementer<T, Lifetime, Slots> : unknown)
  & ('lifetime' extends Slots ? IWithLifetime<T, Lifetime, Slots, Described> : unknown)
  & ('tag' extends Slots ? ITaggedAs<T, Lifetime, Slots, Described> : unknown);

/**
 * Choosing what produces the service. Each door takes the implementation together with its own
 * type — the node carrying its signatures — and takes only implementations that produce `T`,
 * so a registration that could not satisfy its own address is refused where it is written. Taking
 * a door completes the registration: the result is a {@link Registration}.
 */
export interface IAsImplementer<T, Lifetime, Slots extends Slot> {
  asClass(
    ctor: AbstractCtor<any[], T> & Ctor,
    ctorType: ConstructorType,
  ): RegistrationBuilder<T, Lifetime, Exclude<Slots, 'implementer'>, CtorRegistration<Lifetime>>;
  asFactory(
    fn: Func<any[], T>,
    fnType: FunctionType,
  ): RegistrationBuilder<T, Lifetime, Exclude<Slots, 'implementer'>, FactoryRegistration<Lifetime>>;
  asValue(value: T): RegistrationBuilder<T, Lifetime, Extract<Slots, 'tag'>, ValueRegistration>;
}

interface IWithLifetime<T, Lifetime, Slots extends Slot, Described> {
  withLifetime(lifetime: Lifetime): RegistrationBuilder<T, Lifetime, Exclude<Slots, 'lifetime'>, Described>;
}

interface ITaggedAs<T, Lifetime, Slots extends Slot, Described> {
  taggedAs(key: string): RegistrationBuilder<T, Lifetime, Exclude<Slots, 'tag'>, Described>;
}

/** A registration with nothing chosen yet — what {@link Manifest.describe} opens. */
export type RegistrationBuilderFor<T, Lifetime> = RegistrationBuilder<T, Lifetime, 'implementer' | 'lifetime' | 'tag', unknown>;

/**
 * The chain `describe` opens. Every step hands back a new node, so a discarded intermediate
 * configures nothing — the same rule the manifest itself follows.
 */
export function openRegistration<Lifetime>(address: Type): RegistrationBuilderFor<any, Lifetime> {
  return new PendingRegistration<Lifetime>(address) as unknown as RegistrationBuilderFor<any, Lifetime>;
}

/** The node the chain passes through before an implementer is chosen. */
class PendingRegistration<Lifetime> {
  readonly #baseAddress: Type;
  readonly #lifetime: Lifetime | undefined;
  readonly #tag: string | undefined;

  constructor(baseAddress: Type, lifetime?: Lifetime, tag?: string) {
    this.#baseAddress = baseAddress;
    this.#lifetime = lifetime;
    this.#tag = tag;
  }

  asClass(ctor: Ctor, ctorType: ConstructorType) {
    return described(Registration.ctor(this.#address(), ctor, ctorType, this.#lifetime));
  }

  asFactory(fn: Func, fnType: FunctionType) {
    return described(Registration.factory(this.#address(), fn, fnType, this.#lifetime));
  }

  asValue(value: unknown) {
    return described(Registration.value(this.#address(), value));
  }

  withLifetime(lifetime: Lifetime) {
    return new PendingRegistration<Lifetime>(this.#baseAddress, lifetime, this.#tag);
  }

  taggedAs(key: string) {
    return new PendingRegistration<Lifetime>(this.#baseAddress, this.#lifetime, key);
  }

  #address(): Type {
    return withKey(this.#baseAddress, this.#tag);
  }
}

/**
 * A registration wearing the chain's remaining steps. The steps are installed non-enumerably, so
 * the node spreads, compares, and registers as the plain registration it is.
 */
function described<Lifetime, D extends Registration<Lifetime>>(registration: D): D {
  return Object.defineProperties({ ...registration }, {
    withLifetime: {
      value: function(this: D, lifetime: Lifetime) {
        return described<Lifetime, D>({ ...this, lifetime });
      },
    },
    taggedAs: {
      value: function(this: D, key: string) {
        return described<Lifetime, D>({ ...this, address: withKey(this.address, key) });
      },
    },
  }) as D;
}
