import { type ButNot, concat, type ConstructorType, type FunctionType, type Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { AbstractCtor, Ctor, Func } from '@rhombus-toolkit/func';

import { openDescription, type ServiceDescriptorBuilderFor } from '../builder';
import type { LifetimeArgument } from '../LifetimeModel';
import { DefaultManifest, type Manifest } from '../Manifest';
import { ServiceDescriptor } from '../ServiceDescriptor';

declare module '@rhombus-std/di.core' {
  interface Manifest<Lifetime> {
    /** Prepends `descriptor`, ahead of every descriptor already in the chain. */
    add(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime>;
    /**
     * Swaps in `descriptor` for the first descriptor registered under the same service type, leaving
     * every other descriptor untouched.
     */
    replace(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime>;
    /** Drops the descriptor that is {@link ServiceDescriptor.equals} to `descriptor`, if one is present. */
    remove(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime>;

    /** Adds every descriptor in `descriptors`, in order — the last one ends up newest. */
    addMany(descriptors: Iterable<ServiceDescriptor<Lifetime>>): Manifest<Lifetime>;
    /**
     * Folds `source`'s descriptors in as one batch, ahead of everything already in the chain and
     * in `source`'s own order — `source` re-invoked once per resulting manifest iteration, never
     * called here.
     */
    include(source: Func<[], Iterable<ServiceDescriptor<Lifetime>>>): Manifest<Lifetime>;
    /** {@link Manifest.include}'s plain-iterable shape — `source` re-iterated once per resulting manifest iteration, never read here. */
    include(source: Iterable<ServiceDescriptor<Lifetime>>): Manifest<Lifetime>;
    /** Adds each descriptor whose service type has no registration yet. */
    tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Lifetime>>): Manifest<Lifetime>;

    /** Registers `ctor` — constructed with `new` — as the implementation of `serviceType`. */
    add(serviceType: Type, ctor: Ctor, ctorType: ConstructorType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s constructor shape, registering only when the service type has no registration yet. */
    tryAdd(serviceType: Type, ctor: Ctor, ctorType: ConstructorType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s constructor shape, replacing the service type's existing registration. */
    replace(serviceType: Type, ctor: Ctor, ctorType: ConstructorType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;

    /** Registers `factory` — called, never `new`ed — as the producer of `serviceType`. */
    add(serviceType: Type, factory: Func, factoryType: FunctionType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s factory shape, registering only when the service type has no registration yet. */
    tryAdd(serviceType: Type, factory: Func, factoryType: FunctionType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s factory shape, replacing the service type's existing registration. */
    replace(serviceType: Type, factory: Func, factoryType: FunctionType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;

    /**
     * Registers a non-callable `value` under `serviceType` as it stands: it is handed back on
     * resolution, never constructed or called. A callable cannot come in this door — its own
     * type cannot say it is data — so a function meant as a value goes through
     * {@link Manifest.addValue}.
     */
    add<Value>(serviceType: Type, value: ButNot<Value, Func | AbstractCtor>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s value shape, registering only when the service type has no registration yet. */
    tryAdd<Value>(serviceType: Type, value: ButNot<Value, Func | AbstractCtor>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s value shape, replacing the service type's existing registration. */
    replace<Value>(serviceType: Type, value: ButNot<Value, Func | AbstractCtor>): Manifest<Lifetime>;
    /**
     * {@link Manifest.add}'s value shape as its own verb: the door that forces a callable down
     * the value path, and takes any value besides.
     */
    addValue(serviceType: Type, value: unknown): Manifest<Lifetime>;
    /** {@link Manifest.addValue}, registering only when the service type has no registration yet. */
    tryAddValue(serviceType: Type, value: unknown): Manifest<Lifetime>;
    /** {@link Manifest.addValue}, replacing the service type's existing registration. */
    replaceValue(serviceType: Type, value: unknown): Manifest<Lifetime>;

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

// ServiceDescriptor
registerAugmentations<Manifest<unknown>>({
  add(this: Manifest<unknown>, descriptor: ServiceDescriptor<any>): Manifest<unknown> {
    return this._add(descriptor);
  },
  replace(this: Manifest<unknown>, descriptor: ServiceDescriptor<any>): Manifest<unknown> {
    return this._replace(descriptor);
  },
  remove(this: Manifest<unknown>, descriptor: ServiceDescriptor<any>): Manifest<unknown> {
    return this._remove(descriptor);
  },
});

// Iterable<ServiceDescriptor>
// ServiceDescriptor[]
// ServiceType
registerAugmentations<Manifest<unknown>>({
  addMany(this: Manifest<unknown>, descriptors: Iterable<ServiceDescriptor<unknown>>): Manifest<unknown> {
    return Iterator.from(descriptors).reduce((man, descriptor) => man.add(descriptor), this);
  },
  include(this: Manifest<unknown>, source: Iterable<ServiceDescriptor<unknown>>): Manifest<unknown> {
    return new DefaultManifest<unknown>(() => concat(source, this));
  },
  tryAdd(this: Manifest<unknown>, ...descriptors: ReadonlyArray<ServiceDescriptor<unknown>>): Manifest<unknown> {
    return Iterator.from(descriptors)
      .filter(newDesc => !Iterator.from(this).some(existingDesc => existingDesc.serviceType === newDesc.serviceType))
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

// ServiceType - Ctor - ConstructorType - Lifetime
registerAugmentations<Manifest<unknown>>({
  add(this: Manifest<unknown>, serviceType: Type, ctor: Ctor, ctorType: ConstructorType, lifetime?: any): Manifest<unknown> {
    return this.add(ServiceDescriptor.ctor(serviceType, ctor, ctorType, lifetime));
  },
  tryAdd(this: Manifest<unknown>, serviceType: Type, ctor: Ctor, ctorType: ConstructorType, lifetime?: any): Manifest<unknown> {
    return this.tryAdd(ServiceDescriptor.ctor(serviceType, ctor, ctorType, lifetime));
  },
  replace(this: Manifest<unknown>, serviceType: Type, ctor: Ctor, ctorType: ConstructorType, lifetime?: any): Manifest<unknown> {
    return this.replace(ServiceDescriptor.ctor(serviceType, ctor, ctorType, lifetime));
  },
});

// ServiceType - Factory - FunctionType - Lifetime
registerAugmentations<Manifest<unknown>>({
  add(this: Manifest<unknown>, serviceType: Type, factory: Func, factoryType: FunctionType, lifetime?: any): Manifest<unknown> {
    return this.add(ServiceDescriptor.factory(serviceType, factory, factoryType, lifetime));
  },
  tryAdd(this: Manifest<unknown>, serviceType: Type, factory: Func, factoryType: FunctionType, lifetime?: any): Manifest<unknown> {
    return this.tryAdd(ServiceDescriptor.factory(serviceType, factory, factoryType, lifetime));
  },
  replace(this: Manifest<unknown>, serviceType: Type, factory: Func, factoryType: FunctionType, lifetime?: any): Manifest<unknown> {
    return this.replace(ServiceDescriptor.factory(serviceType, factory, factoryType, lifetime));
  },
});

// ServiceType - Value
registerAugmentations<Manifest<unknown>>({
  add(this: Manifest<unknown>, serviceType: Type, value: unknown): Manifest<unknown> {
    return this.add(ServiceDescriptor.value(serviceType, value));
  },
  tryAdd(this: Manifest<unknown>, serviceType: Type, value: unknown): Manifest<unknown> {
    return this.tryAdd(ServiceDescriptor.value(serviceType, value));
  },
  replace(this: Manifest<unknown>, serviceType: Type, value: unknown): Manifest<unknown> {
    return this.replace(ServiceDescriptor.value(serviceType, value));
  },
  addValue(this: Manifest<unknown>, serviceType: Type, value: unknown): Manifest<unknown> {
    return this.add(ServiceDescriptor.value(serviceType, value));
  },
  tryAddValue(this: Manifest<unknown>, serviceType: Type, value: unknown): Manifest<unknown> {
    return this.tryAdd(ServiceDescriptor.value(serviceType, value));
  },
  replaceValue(this: Manifest<unknown>, serviceType: Type, value: unknown): Manifest<unknown> {
    return this.replace(ServiceDescriptor.value(serviceType, value));
  },
});

registerAugmentations<Manifest<unknown>>({
  describe(this: Manifest<unknown>, serviceType: Type): ServiceDescriptorBuilderFor<any, unknown> {
    return openDescription(serviceType);
  },
});

// Func<[], Iterable<ServiceDescriptor>>
registerAugmentations<Manifest<unknown>>({
  include(this: Manifest<unknown>, source: Func<[], Iterable<ServiceDescriptor<unknown>>>): Manifest<unknown> {
    return new DefaultManifest<unknown>(() => concat(source(), this));
  },
});
