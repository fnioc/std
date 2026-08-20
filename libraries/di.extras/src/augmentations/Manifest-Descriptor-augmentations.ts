import { ConstantType, type Manifest, type ServiceDescriptorBuilderFor } from '@rhombus-std/di.core';
import { registerInlineBodies, typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    /**
     * Registers a constructor as the implementation of `ServiceType`, the service type derived from the
     * type argument instead of taken explicitly.
     */
    add<ServiceType>(implementer: Ctor<any[], ServiceType>, scope?: Scopes): Manifest<Scopes>;
    /**
     * Registers a factory as the producer of `ServiceType`, the service type derived from the
     * type argument instead of taken explicitly.
     */
    add<ServiceType>(implementer: Func<any[], ServiceType>, scope?: Scopes): Manifest<Scopes>;
    /**
     * Registers `value` as-is under `ServiceType`, the service type derived from the type
     * argument instead of taken explicitly.
     */
    addValue<ServiceType>(value: ServiceType): Manifest<Scopes>;

    /** {@link Manifest.add}'s constructor shape, registering only when the slot is unclaimed. */
    tryAdd<ServiceType>(implementer: Ctor<any[], ServiceType>, scope?: Scopes): Manifest<Scopes>;
    /** {@link Manifest.add}'s factory shape, registering only when the slot is unclaimed. */
    tryAdd<ServiceType>(implementer: Func<any[], ServiceType>, scope?: Scopes): Manifest<Scopes>;
    /** {@link Manifest.addValue}, registering only when the slot is unclaimed. */
    tryAddValue<ServiceType>(value: ServiceType): Manifest<Scopes>;

    /** {@link Manifest.add}'s constructor shape, swapping in for the registration already in the slot. */
    replace<ServiceType>(implementer: Ctor<any[], ServiceType>, scope?: Scopes): Manifest<Scopes>;
    /** {@link Manifest.add}'s factory shape, swapping in for the registration already in the slot. */
    replace<ServiceType>(implementer: Func<any[], ServiceType>, scope?: Scopes): Manifest<Scopes>;
    /** {@link Manifest.addValue}, swapping in for the registration already in the slot. */
    replaceValue<ServiceType>(value: ServiceType): Manifest<Scopes>;

    /**
     * Drops every registration of `ServiceType`, the service type derived from the type argument
     * instead of taken explicitly.
     */
    removeAll<ServiceType>(): Manifest<Scopes>;

    /**
     * {@link Manifest.describe} with `ServiceType` derived from the type argument instead of
     * taken explicitly.
     */
    describe<ServiceType>(): ServiceDescriptorBuilderFor<ServiceType, Scopes>;
  }
}

export const ManifestDescriptorAugmentations = {
  add<ServiceType>(this: Manifest<string>, implementer: any, scope?: string): Manifest<string> {
    return this.add(typefor<ServiceType>(), implementer, typefor(implementer), scope);
  },
  addValue<ServiceType>(this: Manifest<string>, value: ServiceType): Manifest<string> {
    return this.add(typefor<ServiceType>(), value, ConstantType);
  },
  tryAdd<ServiceType>(this: Manifest<string>, implementer: any, scope?: string): Manifest<string> {
    return this.tryAdd(typefor<ServiceType>(), implementer, typefor(implementer), scope);
  },
  tryAddValue<ServiceType>(this: Manifest<string>, value: ServiceType): Manifest<string> {
    return this.tryAdd(typefor<ServiceType>(), value, ConstantType);
  },
  replace<ServiceType>(this: Manifest<string>, implementer: any, scope?: string): Manifest<string> {
    return this.replace(typefor<ServiceType>(), implementer, typefor(implementer), scope);
  },
  replaceValue<ServiceType>(this: Manifest<string>, value: ServiceType): Manifest<string> {
    return this.replace(typefor<ServiceType>(), value, ConstantType);
  },
  removeAll<ServiceType>(this: Manifest<string>): Manifest<string> {
    return this.removeAll(typefor<ServiceType>());
  },
  describe<ServiceType>(this: Manifest<string>) {
    return this.describe(typefor<ServiceType>());
  },
};
registerInlineBodies<Manifest<string>>(ManifestDescriptorAugmentations);
