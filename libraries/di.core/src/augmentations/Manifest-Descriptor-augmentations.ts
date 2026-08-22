import { type ConstructorType, type FunctionType, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

import { assertNever } from '@rhombus-toolkit/type-guards';
import { openDescription, type ServiceDescriptorBuilderFor } from '../builder';
import type { LifetimeArgument } from '../LifetimeModel';
import { type Manifest } from '../Manifest';
import { ConstantType, ServiceDescriptor } from '../ServiceDescriptor';

declare module '@rhombus-std/di.core' {
  interface Manifest<Lifetime> {
    /** Prepends `descriptor`, ahead of every descriptor already in the chain. */
    add(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime>;
    /**
     * Swaps in `descriptor` for the first descriptor occupying the same registration slot —
     * see {@link ServiceDescriptor.matches} — leaving every other descriptor untouched.
     */
    replace(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime>;
    /** Drops the descriptor that is {@link ServiceDescriptor.equals} to `descriptor`, if one is present. */
    remove(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime>;

    /** Adds every descriptor in `descriptors`, in order — the last one ends up newest. */
    addMany(descriptors: Iterable<ServiceDescriptor<Lifetime>>): Manifest<Lifetime>;
    /** Adds each descriptor whose registration slot no existing descriptor occupies. */
    tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Lifetime>>): Manifest<Lifetime>;

    /** Registers `ctor` — constructed with `new` — as the implementation of `serviceType`. */
    add(serviceType: Type, ctor: Ctor, ctorType: ConstructorType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s constructor shape, registering only when the slot is unclaimed. */
    tryAdd(serviceType: Type, ctor: Ctor, ctorType: ConstructorType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s constructor shape, swapping in for the registration already in the slot. */
    replace(serviceType: Type, ctor: Ctor, ctorType: ConstructorType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;

    /** Registers `factory` — called, never `new`ed — as the producer of `serviceType`. */
    add(serviceType: Type, factory: Func, factoryType: FunctionType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s factory shape, registering only when the slot is unclaimed. */
    tryAdd(serviceType: Type, factory: Func, factoryType: FunctionType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s factory shape, swapping in for the registration already in the slot. */
    replace(serviceType: Type, factory: Func, factoryType: FunctionType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;

    /**
     * Registers `value` under `serviceType` as it stands: it is handed back on resolution, never
     * constructed or called. The {@link ConstantType} marker is what says so — a callable's own
     * type cannot, so the call site carries the choice.
     */
    add(serviceType: Type, value: unknown, valueType: ConstantType): Manifest<Lifetime>;
    /** {@link Manifest.add}'s value shape, registering only when the slot is unclaimed. */
    tryAdd(serviceType: Type, value: unknown, valueType: ConstantType): Manifest<Lifetime>;
    /** {@link Manifest.add}'s value shape, swapping in for the registration already in the slot. */
    replace(serviceType: Type, value: unknown, valueType: ConstantType): Manifest<Lifetime>;

    /**
     * Opens a registration chain for `serviceType`: choose the implementer through one of the
     * `as*` doors, refined by `withLifetime`/`taggedAs`. Once a door is taken the node IS a
     * {@link ServiceDescriptor} — hand it to the descriptor-taking verbs, hold it in a variable,
     * or build several in a helper and register them together.
     */
    describe(serviceType: Type): ServiceDescriptorBuilderFor<any, Lifetime>;

    /** Drops the first descriptor registered for `serviceType`, if one is present. */
    remove(serviceType: Type): Manifest<Lifetime>;
    /** Drops every descriptor registered for `serviceType`, leaving every other entry untouched. */
    removeAll(serviceType: Type): Manifest<Lifetime>;
  }
}

registerAugmentations<Manifest<unknown>>({
  add(this: Manifest<unknown>, descriptor: ServiceDescriptor<any>): Manifest<unknown> {
    // The factory throws at the earliest point that can see an abstract constructor; this is the
    // door a hand-written descriptor literal enters by, so the same refusal stands here too.
    if ('ctor' in descriptor && descriptor.ctorType.abstract) {
      throw new TypeError(`${Type.stringify(descriptor.ctorType)} is abstract — nothing can \`new\` it directly`);
    }
    return this._add(descriptor);
  },
  replace(this: Manifest<unknown>, descriptor: ServiceDescriptor<any>): Manifest<unknown> {
    return this._replace(descriptor);
  },
  remove(this: Manifest<unknown>, descriptor: ServiceDescriptor<any>): Manifest<unknown> {
    return this._remove(descriptor);
  },
});

registerAugmentations<Manifest<unknown>>({
  addMany(this: Manifest<unknown>, descriptors: Iterable<ServiceDescriptor<unknown>>): Manifest<unknown> {
    return Iterator.from(descriptors).reduce((man, descriptor) => man.add(descriptor), this);
  },
  tryAdd(this: Manifest<unknown>, ...descriptors: ReadonlyArray<ServiceDescriptor<unknown>>): Manifest<unknown> {
    return Iterator.from(descriptors)
      .filter(newDesc => !Iterator.from(this).some(existingDesc => ServiceDescriptor.matches(newDesc, existingDesc)))
      .reduce((man, descriptor) => man.add(descriptor), this);
  },
  remove(this: Manifest<unknown>, serviceType: Type): Manifest<unknown> {
    const found = Iterator.from(this).find(descriptor => descriptor.serviceType === serviceType);
    return found ? this.remove(found) : this;
  },
  removeAll(this: Manifest<unknown>, serviceType: Type): Manifest<unknown> {
    return Iterator.from(this)
      .filter(descriptor => descriptor.serviceType === serviceType)
      .reduce((man, descriptor) => man.remove(descriptor), this);
  },
});

registerAugmentations<Manifest<unknown>>({
  add(this: Manifest<unknown>, serviceType: Type, implementer: unknown, implementerType: ConstructorType | FunctionType | ConstantType, lifetime?: any): Manifest<unknown> {
    return this.add(toDescriptor(serviceType, implementer, implementerType, lifetime));
  },
  tryAdd(this: Manifest<unknown>, serviceType: Type, implementer: unknown, implementerType: ConstructorType | FunctionType | ConstantType, lifetime?: any): Manifest<unknown> {
    return this.tryAdd(toDescriptor(serviceType, implementer, implementerType, lifetime));
  },
  replace(this: Manifest<unknown>, serviceType: Type, implementer: unknown, implementerType: ConstructorType | FunctionType | ConstantType, lifetime?: any): Manifest<unknown> {
    return this.replace(toDescriptor(serviceType, implementer, implementerType, lifetime));
  },
});

registerAugmentations<Manifest<unknown>>({
  describe(this: Manifest<unknown>, serviceType: Type): ServiceDescriptorBuilderFor<any, unknown> {
    return openDescription(serviceType);
  },
});

/** The descriptor the uniform three-argument shape describes, its door chosen by the implementer type's kind. */
function toDescriptor(serviceType: Type, implementer: unknown, implementerType: ConstructorType | FunctionType | ConstantType, lifetime?: unknown): ServiceDescriptor<unknown> {
  switch (implementerType.kind) {
    case 'ctor':
      return ServiceDescriptor.ctor(serviceType, implementer as Ctor, implementerType, lifetime);
    case 'func':
      return ServiceDescriptor.factory(serviceType, implementer as Func, implementerType, lifetime);
    case 'constant':
      return ServiceDescriptor.value(serviceType, implementer);
    default:
      return assertNever(implementerType);
  }
}
