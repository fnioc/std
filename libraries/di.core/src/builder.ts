import type { ConstructorType, FunctionType, Type } from '@rhombus-std/primitives';
import type { AbstractCtor, Ctor, Func } from '@rhombus-toolkit/func';
import { withKey } from './service-type';
import { type CtorDescriptor, type FactoryDescriptor, ServiceDescriptor, type ValueDescriptor } from './ServiceDescriptor';

/** A step the chain has not spent yet. Each verb removes its own, so none can be taken twice. */
type Slot = 'implementer' | 'lifetime' | 'tag';

/**
 * The steps still open, as one type: an intersection of the interfaces whose slots survive.
 * `Described` is `unknown` until an implementer is chosen; from then on the node IS that
 * descriptor, refined by whatever steps remain — except while a required lifetime is unspent:
 * when `undefined` is not assignable to `Lifetime` and the `lifetime` slot is still open, the
 * node withholds descriptor-ness, so a manifest verb refuses it until `withLifetime` is taken.
 */
type ServiceDescriptorBuilder<T, Lifetime, Slots extends Slot, Described> =
  & ('lifetime' extends Slots ? (undefined extends Lifetime ? Described : unknown) : Described)
  & ('implementer' extends Slots ? IAsImplementer<T, Lifetime, Slots> : unknown)
  & ('lifetime' extends Slots ? IWithLifetime<T, Lifetime, Slots, Described> : unknown)
  & ('tag' extends Slots ? ITaggedAs<T, Lifetime, Slots, Described> : unknown);

/**
 * Choosing what produces the service. Each door takes the implementation together with its own
 * type — the node carrying its parameter signatures — and takes only implementations that produce `T`,
 * so a registration that could not satisfy its own address is refused where it is written. Taking
 * a door completes the registration: the result is a {@link ServiceDescriptor}.
 */
interface IAsImplementer<T, Lifetime, Slots extends Slot> {
  asClass(
    ctor: AbstractCtor<any[], T> & Ctor,
    ctorType: ConstructorType,
  ): ServiceDescriptorBuilder<T, Lifetime, Exclude<Slots, 'implementer'>, CtorDescriptor<Lifetime>>;
  asFactory(
    fn: Func<any[], T>,
    fnType: FunctionType,
  ): ServiceDescriptorBuilder<T, Lifetime, Exclude<Slots, 'implementer'>, FactoryDescriptor<Lifetime>>;
  asValue(value: T): ServiceDescriptorBuilder<T, Lifetime, Extract<Slots, 'tag'>, ValueDescriptor>;
}

interface IWithLifetime<T, Lifetime, Slots extends Slot, Described> {
  withLifetime(lifetime: Lifetime): ServiceDescriptorBuilder<T, Lifetime, Exclude<Slots, 'lifetime'>, Described>;
}

interface ITaggedAs<T, Lifetime, Slots extends Slot, Described> {
  taggedAs(key: string): ServiceDescriptorBuilder<T, Lifetime, Exclude<Slots, 'tag'>, Described>;
}

/** A registration with nothing chosen yet — what {@link Manifest.describe} opens. */
export type ServiceDescriptorBuilderFor<T, Lifetime> = ServiceDescriptorBuilder<T, Lifetime, 'implementer' | 'lifetime' | 'tag', unknown>;

/**
 * The chain `describe` opens. Every step hands back a new node, so a discarded intermediate
 * configures nothing — the same rule the manifest itself follows.
 */
export function openDescription<Lifetime>(serviceType: Type): ServiceDescriptorBuilderFor<any, Lifetime> {
  return new PendingRegistration<Lifetime>(serviceType) as unknown as ServiceDescriptorBuilderFor<any, Lifetime>;
}

/** The node the chain walks before an implementer is chosen. */
class PendingRegistration<Lifetime> {
  readonly #serviceType: Type;
  readonly #lifetime: Lifetime | undefined;
  readonly #tag: string | undefined;

  constructor(serviceType: Type, lifetime?: Lifetime, tag?: string) {
    this.#serviceType = serviceType;
    this.#lifetime = lifetime;
    this.#tag = tag;
  }

  asClass(ctor: Ctor, ctorType: ConstructorType) {
    return described(ServiceDescriptor.ctor(this.#address(), ctor, ctorType, this.#lifetime));
  }

  asFactory(fn: Func, fnType: FunctionType) {
    return described(ServiceDescriptor.factory(this.#address(), fn, fnType, this.#lifetime));
  }

  asValue(value: unknown) {
    return described(ServiceDescriptor.value(this.#address(), value));
  }

  withLifetime(lifetime: Lifetime) {
    return new PendingRegistration<Lifetime>(this.#serviceType, lifetime, this.#tag);
  }

  taggedAs(key: string) {
    return new PendingRegistration<Lifetime>(this.#serviceType, this.#lifetime, key);
  }

  #address(): Type {
    return withKey(this.#serviceType, this.#tag);
  }
}

/**
 * A descriptor wearing the chain's remaining steps. The steps are installed non-enumerably, so
 * the node spreads, compares, and registers as the plain descriptor it is.
 */
function described<Lifetime, D extends ServiceDescriptor<Lifetime>>(descriptor: D): D {
  return Object.defineProperties({ ...descriptor }, {
    withLifetime: {
      value: function(this: D, lifetime: Lifetime) {
        return described<Lifetime, D>({ ...this, lifetime });
      },
    },
    taggedAs: {
      value: function(this: D, key: string) {
        return described<Lifetime, D>({ ...this, serviceType: withKey(this.serviceType, key) });
      },
    },
  }) as D;
}
