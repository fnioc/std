import { type ConstructorType, type FunctionType, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

import { assertNever } from '@rhombus-toolkit/type-guards';
import { openDescription, type ServiceDescriptorBuilderFor } from '../builder';
import { type Manifest } from '../Manifest';
import { ConstantType, ServiceDescriptor } from '../ServiceDescriptor';

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes> {
    /** Prepends `descriptor`, ahead of every descriptor already in the chain. */
    add(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
    /**
     * Swaps in `descriptor` for the first descriptor occupying the same registration slot —
     * see {@link ServiceDescriptor.matches} — leaving every other descriptor untouched.
     */
    replace(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
    /** Drops the descriptor that is {@link ServiceDescriptor.equals} to `descriptor`, if one is present. */
    remove(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;

    /** Adds every descriptor in `descriptors`, in order — the last one ends up newest. */
    addMany(descriptors: Iterable<ServiceDescriptor<Scopes>>): Manifest<Scopes>;
    /** Adds each descriptor whose registration slot no existing descriptor occupies. */
    tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Scopes>>): Manifest<Scopes>;

    /** Registers `ctor` — constructed with `new` — as the implementation of `serviceType`. */
    add(serviceType: Type, ctor: Ctor, ctorType: ConstructorType, scope?: Scopes): Manifest<Scopes>;
    /** {@link Manifest.add}'s constructor shape, registering only when the slot is unclaimed. */
    tryAdd(serviceType: Type, ctor: Ctor, ctorType: ConstructorType, scope?: Scopes): Manifest<Scopes>;
    /** {@link Manifest.add}'s constructor shape, swapping in for the registration already in the slot. */
    replace(serviceType: Type, ctor: Ctor, ctorType: ConstructorType, scope?: Scopes): Manifest<Scopes>;

    /** Registers `factory` — called, never `new`ed — as the producer of `serviceType`. */
    add(serviceType: Type, factory: Func, factoryType: FunctionType, scope?: Scopes): Manifest<Scopes>;
    /** {@link Manifest.add}'s factory shape, registering only when the slot is unclaimed. */
    tryAdd(serviceType: Type, factory: Func, factoryType: FunctionType, scope?: Scopes): Manifest<Scopes>;
    /** {@link Manifest.add}'s factory shape, swapping in for the registration already in the slot. */
    replace(serviceType: Type, factory: Func, factoryType: FunctionType, scope?: Scopes): Manifest<Scopes>;

    /**
     * Registers `value` under `serviceType` as it stands: it is handed back on resolution, never
     * constructed or called. The {@link ConstantType} marker is what says so — a callable's own
     * type cannot, so the call site carries the choice.
     */
    add(serviceType: Type, value: unknown, valueType: ConstantType): Manifest<Scopes>;
    /** {@link Manifest.add}'s value shape, registering only when the slot is unclaimed. */
    tryAdd(serviceType: Type, value: unknown, valueType: ConstantType): Manifest<Scopes>;
    /** {@link Manifest.add}'s value shape, swapping in for the registration already in the slot. */
    replace(serviceType: Type, value: unknown, valueType: ConstantType): Manifest<Scopes>;

    /**
     * Opens a registration chain for `serviceType`: choose the implementer through one of the
     * `as*` doors, refined by `withLifetime`/`taggedAs`. Once a door is taken the node IS a
     * {@link ServiceDescriptor} — hand it to the descriptor-taking verbs, hold it in a variable,
     * or build several in a helper and register them together.
     */
    describe(serviceType: Type): ServiceDescriptorBuilderFor<any, Scopes>;

    /** Drops the first descriptor registered for `serviceType`, if one is present. */
    remove(serviceType: Type): Manifest<Scopes>;
    /** Drops every descriptor registered for `serviceType`, leaving every other entry untouched. */
    removeAll(serviceType: Type): Manifest<Scopes>;
  }
}

registerAugmentations<Manifest<any>>({
  add(this: Manifest<any>, descriptor: ServiceDescriptor<any>): Manifest<any> {
    // The factory throws at the earliest point that can see an abstract constructor; this is the
    // door a hand-written descriptor literal enters by, so the same refusal stands here too.
    if ('ctor' in descriptor && descriptor.ctorType.abstract) {
      throw new TypeError(`${Type.stringify(descriptor.ctorType)} is abstract — nothing can \`new\` it directly`);
    }
    return this._add(descriptor);
  },
  replace(this: Manifest<any>, descriptor: ServiceDescriptor<any>): Manifest<any> {
    return this._replace(descriptor);
  },
  remove(this: Manifest<any>, descriptor: ServiceDescriptor<any>): Manifest<any> {
    return this._remove(descriptor);
  },
});

registerAugmentations<Manifest<any>>({
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

registerAugmentations<Manifest<any>>({
  add(this: Manifest<any>, serviceType: Type, implementer: unknown, implementerType: ConstructorType | FunctionType | ConstantType, scope?: any): Manifest<any> {
    return this.add(toDescriptor(serviceType, implementer, implementerType, scope));
  },
  tryAdd(this: Manifest<any>, serviceType: Type, implementer: unknown, implementerType: ConstructorType | FunctionType | ConstantType, scope?: any): Manifest<any> {
    return this.tryAdd(toDescriptor(serviceType, implementer, implementerType, scope));
  },
  replace(this: Manifest<any>, serviceType: Type, implementer: unknown, implementerType: ConstructorType | FunctionType | ConstantType, scope?: any): Manifest<any> {
    return this.replace(toDescriptor(serviceType, implementer, implementerType, scope));
  },
});

registerAugmentations<Manifest<any>>({
  describe(this: Manifest<unknown>, serviceType: Type): ServiceDescriptorBuilderFor<any, unknown> {
    return openDescription(serviceType);
  },
});

/** The descriptor the uniform three-argument shape describes, its door chosen by the implementer type's kind. */
function toDescriptor(serviceType: Type, implementer: unknown, implementerType: ConstructorType | FunctionType | ConstantType, scope?: unknown): ServiceDescriptor<unknown> {
  switch (implementerType.kind) {
    case 'ctor':
      return ServiceDescriptor.ctor(serviceType, implementer as Ctor, implementerType, scope);
    case 'func':
      return ServiceDescriptor.factory(serviceType, implementer as Func, implementerType, scope);
    case 'constant':
      return ServiceDescriptor.value(serviceType, implementer);
    default:
      return assertNever(implementerType);
  }
}
