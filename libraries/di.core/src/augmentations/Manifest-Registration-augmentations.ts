import { type ButNot, concat, type ConstructorType, type FunctionType, type Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { AbstractCtor, Ctor, Func } from '@rhombus-toolkit/func';

import { openRegistration, type RegistrationBuilderFor } from '../builder';
import type { LifetimeArgument } from '../LifetimeModel';
import { DefaultManifest, type Manifest } from '../Manifest';
import { Registration } from '../Registration';

declare module '@rhombus-std/di.core' {
  interface Manifest<Lifetime> {
    /** Prepends `registration`, ahead of every registration already in the chain. */
    add(registration: Registration<Lifetime>): Manifest<Lifetime>;
    /**
     * Merges `manifest`'s registrations in as one batch, ahead of everything already in the
     * chain, in `manifest`'s own order.
     */
    add(manifest: Manifest<Lifetime>): Manifest<Lifetime>;
    /**
     * Files each registration in `registrations` in turn, exactly as calling {@link Manifest.add}
     * for each in order would — the last one ends up newest. A `Manifest` binds the wholesale-merge
     * overload above instead, order preserved.
     */
    add(registrations: ButNot<Iterable<Registration<Lifetime>>, Manifest<any>>): Manifest<Lifetime>;
    /**
     * Swaps in `registration` for the first registration registered under the same service type, leaving
     * every other registration untouched.
     */
    replace(registration: Registration<Lifetime>): Manifest<Lifetime>;
    /** Drops the registration that is {@link Registration.equals} to `registration`, if one is present. */
    remove(registration: Registration<Lifetime>): Manifest<Lifetime>;

    /** Adds each registration whose service type has no registration yet. */
    tryAdd(...registrations: ReadonlyArray<Registration<Lifetime>>): Manifest<Lifetime>;

    /** Registers `ctor` — constructed with `new` — as the implementation of `address`. */
    add(address: Type, ctor: Ctor, ctorType: ConstructorType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s constructor shape, registering only when the service type has no registration yet. */
    tryAdd(address: Type, ctor: Ctor, ctorType: ConstructorType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s constructor shape, replacing the service type's existing registration. */
    replace(address: Type, ctor: Ctor, ctorType: ConstructorType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;

    /** Registers `factory` — called, never `new`ed — as the producer of `address`. */
    add(address: Type, factory: Func, factoryType: FunctionType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s factory shape, registering only when the service type has no registration yet. */
    tryAdd(address: Type, factory: Func, factoryType: FunctionType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s factory shape, replacing the service type's existing registration. */
    replace(address: Type, factory: Func, factoryType: FunctionType, ...lifetime: LifetimeArgument<Lifetime>): Manifest<Lifetime>;

    /**
     * Registers a non-callable `value` under `address` as it stands: it is handed back on
     * resolution, never constructed or called. A callable cannot come in this door — its own
     * type cannot say it is data — so a function meant as a value goes through
     * {@link Manifest.addValue}.
     */
    add<Value>(address: Type, value: ButNot<Value, Func | AbstractCtor>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s value shape, registering only when the service type has no registration yet. */
    tryAdd<Value>(address: Type, value: ButNot<Value, Func | AbstractCtor>): Manifest<Lifetime>;
    /** {@link Manifest.add}'s value shape, replacing the service type's existing registration. */
    replace<Value>(address: Type, value: ButNot<Value, Func | AbstractCtor>): Manifest<Lifetime>;
    /**
     * {@link Manifest.add}'s value shape as its own verb: the door that forces a callable down
     * the value path, and takes any value besides.
     */
    addValue(address: Type, value: unknown): Manifest<Lifetime>;
    /** {@link Manifest.addValue}, registering only when the service type has no registration yet. */
    tryAddValue(address: Type, value: unknown): Manifest<Lifetime>;
    /** {@link Manifest.addValue}, replacing the service type's existing registration. */
    replaceValue(address: Type, value: unknown): Manifest<Lifetime>;

    /**
     * Opens a registration chain for `address`: choose the implementer through one of the
     * `as*` doors, refined by `withLifetime`/`taggedAs`. Once a door is taken the node IS a
     * {@link Registration} — hand it to the registration-taking verbs, hold it in a variable,
     * or build several in a helper and register them together.
     */
    describe(address: Type): RegistrationBuilderFor<any, Lifetime>;

    /** Drops the first registration registered for `address`, if one is present. */
    remove(address: Type): Manifest<Lifetime>;
    /** Drops every registration registered for `address`, leaving every other entry untouched. */
    removeAll(address: Type): Manifest<Lifetime>;
  }
}

// Registration
registerAugmentations<Manifest<unknown>>({
  add(this: Manifest<unknown>, registration: Registration<any>): Manifest<unknown> {
    return this._add(registration);
  },
  replace(this: Manifest<unknown>, registration: Registration<any>): Manifest<unknown> {
    return this._replace(registration);
  },
  remove(this: Manifest<unknown>, registration: Registration<any>): Manifest<unknown> {
    return this._remove(registration);
  },
});

registerAugmentations<Manifest<unknown>>({
  add(this: Manifest<unknown>, manifest: Manifest<unknown>): Manifest<unknown> {
    return new DefaultManifest<unknown>(() => concat(manifest, this));
  },
});

registerAugmentations<Manifest<unknown>>({
  add(this: Manifest<unknown>, registrations: Iterable<Registration<unknown>>): Manifest<unknown> {
    // The synthesized dispatch never actually reaches the Manifest-shaped contribution above — a
    // Manifest is itself iterable, and every call lands here regardless of its static overload.
    // This check is what makes the merge behavior real: a Manifest gets the order-preserving
    // merge, anything else the consecutive-adds fold.
    if (registrations instanceof DefaultManifest) {
      return new DefaultManifest<unknown>(() => concat(registrations, this));
    }
    return Iterator.from(concat(registrations)).reduce((man, registration) => man._add(registration), this);
  },
});

// Registration[]
// ServiceType
registerAugmentations<Manifest<unknown>>({
  tryAdd(this: Manifest<unknown>, ...registrations: ReadonlyArray<Registration<unknown>>): Manifest<unknown> {
    return registrations.reduce<Manifest<unknown>>((man, registration) => {
      if (Iterator.from(man).some(existing => existing.address === registration.address)) {
        return man;
      }
      return man._add(registration);
    }, this);
  },
  remove(this: Manifest<unknown>, address: Type): Manifest<unknown> {
    const found = Iterator.from(this).find(registration => registration.address === address);
    return found ? this.remove(found) : this;
  },
  removeAll(this: Manifest<unknown>, address: Type): Manifest<unknown> {
    return Iterator.from(this)
      .filter(registration => registration.address === address)
      .reduce((man, registration) => man.remove(registration), this);
  },
});

// ServiceType - Ctor - ConstructorType - Lifetime
registerAugmentations<Manifest<unknown>>({
  add(this: Manifest<unknown>, address: Type, ctor: Ctor, ctorType: ConstructorType, lifetime?: any): Manifest<unknown> {
    return this.add(Registration.ctor(address, ctor, ctorType, lifetime));
  },
  tryAdd(this: Manifest<unknown>, address: Type, ctor: Ctor, ctorType: ConstructorType, lifetime?: any): Manifest<unknown> {
    return this.tryAdd(Registration.ctor(address, ctor, ctorType, lifetime));
  },
  replace(this: Manifest<unknown>, address: Type, ctor: Ctor, ctorType: ConstructorType, lifetime?: any): Manifest<unknown> {
    return this.replace(Registration.ctor(address, ctor, ctorType, lifetime));
  },
});

// ServiceType - Factory - FunctionType - Lifetime
registerAugmentations<Manifest<unknown>>({
  add(this: Manifest<unknown>, address: Type, factory: Func, factoryType: FunctionType, lifetime?: any): Manifest<unknown> {
    return this.add(Registration.factory(address, factory, factoryType, lifetime));
  },
  tryAdd(this: Manifest<unknown>, address: Type, factory: Func, factoryType: FunctionType, lifetime?: any): Manifest<unknown> {
    return this.tryAdd(Registration.factory(address, factory, factoryType, lifetime));
  },
  replace(this: Manifest<unknown>, address: Type, factory: Func, factoryType: FunctionType, lifetime?: any): Manifest<unknown> {
    return this.replace(Registration.factory(address, factory, factoryType, lifetime));
  },
});

// ServiceType - Value
registerAugmentations<Manifest<unknown>>({
  add(this: Manifest<unknown>, address: Type, value: unknown): Manifest<unknown> {
    return this.add(Registration.value(address, value));
  },
  tryAdd(this: Manifest<unknown>, address: Type, value: unknown): Manifest<unknown> {
    return this.tryAdd(Registration.value(address, value));
  },
  replace(this: Manifest<unknown>, address: Type, value: unknown): Manifest<unknown> {
    return this.replace(Registration.value(address, value));
  },
  addValue(this: Manifest<unknown>, address: Type, value: unknown): Manifest<unknown> {
    return this.add(Registration.value(address, value));
  },
  tryAddValue(this: Manifest<unknown>, address: Type, value: unknown): Manifest<unknown> {
    return this.tryAdd(Registration.value(address, value));
  },
  replaceValue(this: Manifest<unknown>, address: Type, value: unknown): Manifest<unknown> {
    return this.replace(Registration.value(address, value));
  },
});

registerAugmentations<Manifest<unknown>>({
  describe(this: Manifest<unknown>, address: Type): RegistrationBuilderFor<any, unknown> {
    return openRegistration(address);
  },
});
