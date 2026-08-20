import type { ConstructorType, FunctionType, Type } from '@rhombus-std/primitives';
import type { AbstractCtor, Ctor, Func } from '@rhombus-toolkit/func';
import { withKey } from './service-type';
import { type CtorDescriptor, type FactoryDescriptor, ServiceDescriptor, type ValueDescriptor } from './ServiceDescriptor';

/** A step the chain has not spent yet. Each verb removes its own, so none can be taken twice. */
type Slot = 'implementer' | 'lifetime' | 'tag';

/**
 * The steps still open, as one type: an intersection of the interfaces whose slots survive.
 * `Described` is `unknown` until an implementer is chosen; from then on the node IS that
 * descriptor, refined by whatever steps remain.
 */
type ServiceDescriptorBuilder<T, Scopes extends string, Slots extends Slot, Described> =
  & Described
  & ('implementer' extends Slots ? IAsImplementer<T, Scopes, Slots> : unknown)
  & ('lifetime' extends Slots ? IWithLifetime<T, Scopes, Slots, Described> : unknown)
  & ('tag' extends Slots ? ITaggedAs<T, Scopes, Slots, Described> : unknown);

/**
 * Choosing what produces the service. Each door takes the implementation together with its own
 * type — the node carrying its parameter rows — and takes only implementations that produce `T`,
 * so a registration that could not satisfy its own address is refused where it is written. Taking
 * a door completes the registration: the result is a {@link ServiceDescriptor}.
 */
interface IAsImplementer<T, Scopes extends string, Slots extends Slot> {
  asClass(
    ctor: AbstractCtor<any[], T> & Ctor,
    ctorType: ConstructorType,
  ): ServiceDescriptorBuilder<T, Scopes, Exclude<Slots, 'implementer'>, CtorDescriptor<Scopes>>;
  asFactory(
    fn: Func<any[], T>,
    fnType: FunctionType,
  ): ServiceDescriptorBuilder<T, Scopes, Exclude<Slots, 'implementer'>, FactoryDescriptor<Scopes>>;
  asValue(value: T): ServiceDescriptorBuilder<T, Scopes, Extract<Slots, 'tag'>, ValueDescriptor>;
}

interface IWithLifetime<T, Scopes extends string, Slots extends Slot, Described> {
  withLifetime(scope: Scopes): ServiceDescriptorBuilder<T, Scopes, Exclude<Slots, 'lifetime'>, Described>;
}

interface ITaggedAs<T, Scopes extends string, Slots extends Slot, Described> {
  taggedAs(key: string): ServiceDescriptorBuilder<T, Scopes, Exclude<Slots, 'tag'>, Described>;
}

/** A registration with nothing chosen yet — what {@link Manifest.describe} opens. */
export type ServiceDescriptorBuilderFor<T, Scopes extends string> = ServiceDescriptorBuilder<T, Scopes, 'implementer' | 'lifetime' | 'tag', unknown>;

/**
 * The chain `describe` opens. Every step hands back a new node, so a discarded intermediate
 * configures nothing — the same rule the manifest itself follows.
 */
export function openDescription<Scopes extends string>(serviceType: Type): ServiceDescriptorBuilderFor<any, Scopes> {
  return new PendingRegistration<Scopes>(serviceType) as unknown as ServiceDescriptorBuilderFor<any, Scopes>;
}

/** The node the chain walks before an implementer is chosen. */
class PendingRegistration<Scopes extends string> {
  readonly #serviceType: Type;
  readonly #scope: Scopes | undefined;
  readonly #tag: string | undefined;

  constructor(serviceType: Type, scope?: Scopes, tag?: string) {
    this.#serviceType = serviceType;
    this.#scope = scope;
    this.#tag = tag;
  }

  asClass(ctor: Ctor, ctorType: ConstructorType) {
    return described(ServiceDescriptor.ctor(this.#address(), ctor, ctorType, this.#scope));
  }

  asFactory(fn: Func, fnType: FunctionType) {
    return described(ServiceDescriptor.factory(this.#address(), fn, fnType, this.#scope));
  }

  asValue(value: unknown) {
    return described(ServiceDescriptor.value(this.#address(), value));
  }

  withLifetime(scope: Scopes) {
    return new PendingRegistration<Scopes>(this.#serviceType, scope, this.#tag);
  }

  taggedAs(key: string) {
    return new PendingRegistration<Scopes>(this.#serviceType, this.#scope, key);
  }

  #address(): Type {
    return withKey(this.#serviceType, this.#tag);
  }
}

/**
 * A descriptor wearing the chain's remaining steps. The steps are installed non-enumerably, so
 * the node spreads, compares, and registers as the plain descriptor it is.
 */
function described<Scopes extends string, D extends ServiceDescriptor<Scopes>>(descriptor: D): D {
  return Object.defineProperties({ ...descriptor }, {
    withLifetime: {
      value: function(this: D, scope: Scopes) {
        return described<Scopes, D>({ ...this, scope });
      },
    },
    taggedAs: {
      value: function(this: D, key: string) {
        return described<Scopes, D>({ ...this, serviceType: withKey(this.serviceType, key) });
      },
    },
  }) as D;
}
