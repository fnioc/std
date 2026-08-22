import { ConstantType, type Manifest, type ServiceDescriptorBuilderFor } from '@rhombus-std/di.core';
import { registerInlineBodies, typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

declare module '@rhombus-std/di.core' {
  interface Manifest<Lifetime> {
    /**
     * Registers a constructor as the implementation of `ServiceType`, the service type derived from the
     * type argument instead of taken explicitly.
     */
    add<ServiceType>(implementer: Ctor<any[], ServiceType>, lifetime?: Lifetime): Manifest<Lifetime>;
    /**
     * Registers a factory as the producer of `ServiceType`, the service type derived from the
     * type argument instead of taken explicitly.
     */
    add<ServiceType>(implementer: Func<any[], ServiceType>, lifetime?: Lifetime): Manifest<Lifetime>;
    /**
     * Registers `value` as-is under `ServiceType`, the service type derived from the type
     * argument instead of taken explicitly.
     */
    addValue<ServiceType>(value: ServiceType): Manifest<Lifetime>;

    /** {@link Manifest.add}'s constructor shape, registering only when the slot is unclaimed. */
    tryAdd<ServiceType>(implementer: Ctor<any[], ServiceType>, lifetime?: Lifetime): Manifest<Lifetime>;
    /** {@link Manifest.add}'s factory shape, registering only when the slot is unclaimed. */
    tryAdd<ServiceType>(implementer: Func<any[], ServiceType>, lifetime?: Lifetime): Manifest<Lifetime>;
    /** {@link Manifest.addValue}, registering only when the slot is unclaimed. */
    tryAddValue<ServiceType>(value: ServiceType): Manifest<Lifetime>;

    /** {@link Manifest.add}'s constructor shape, swapping in for the registration already in the slot. */
    replace<ServiceType>(implementer: Ctor<any[], ServiceType>, lifetime?: Lifetime): Manifest<Lifetime>;
    /** {@link Manifest.add}'s factory shape, swapping in for the registration already in the slot. */
    replace<ServiceType>(implementer: Func<any[], ServiceType>, lifetime?: Lifetime): Manifest<Lifetime>;
    /** {@link Manifest.addValue}, swapping in for the registration already in the slot. */
    replaceValue<ServiceType>(value: ServiceType): Manifest<Lifetime>;

    /**
     * Drops every registration of `ServiceType`, the service type derived from the type argument
     * instead of taken explicitly.
     */
    removeAll<ServiceType>(): Manifest<Lifetime>;

    /**
     * {@link Manifest.describe} with `ServiceType` derived from the type argument instead of
     * taken explicitly.
     */
    describe<ServiceType>(): ServiceDescriptorBuilderFor<ServiceType, Lifetime>;
  }
}

export const ManifestDescriptorAugmentations = {
  add<ServiceType>(this: Manifest<unknown>, implementer: any, lifetime?: unknown): Manifest<unknown> {
    return this.add(typefor<ServiceType>(), implementer, typefor(implementer), lifetime);
  },
  addValue<ServiceType>(this: Manifest<unknown>, value: ServiceType): Manifest<unknown> {
    return this.add(typefor<ServiceType>(), value, ConstantType);
  },
  tryAdd<ServiceType>(this: Manifest<unknown>, implementer: any, lifetime?: unknown): Manifest<unknown> {
    return this.tryAdd(typefor<ServiceType>(), implementer, typefor(implementer), lifetime);
  },
  tryAddValue<ServiceType>(this: Manifest<unknown>, value: ServiceType): Manifest<unknown> {
    return this.tryAdd(typefor<ServiceType>(), value, ConstantType);
  },
  replace<ServiceType>(this: Manifest<unknown>, implementer: any, lifetime?: unknown): Manifest<unknown> {
    return this.replace(typefor<ServiceType>(), implementer, typefor(implementer), lifetime);
  },
  replaceValue<ServiceType>(this: Manifest<unknown>, value: ServiceType): Manifest<unknown> {
    return this.replace(typefor<ServiceType>(), value, ConstantType);
  },
  removeAll<ServiceType>(this: Manifest<unknown>): Manifest<unknown> {
    return this.removeAll(typefor<ServiceType>());
  },
  describe<ServiceType>(this: Manifest<unknown>) {
    return this.describe(typefor<ServiceType>());
  },
};
registerInlineBodies<Manifest<unknown>>(ManifestDescriptorAugmentations);
