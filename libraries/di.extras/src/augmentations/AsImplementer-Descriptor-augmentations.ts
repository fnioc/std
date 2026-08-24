import type { CtorDescriptor, FactoryDescriptor } from '@rhombus-std/di.core';
import type { IAsImplementer, ServiceDescriptorBuilder, Slot } from '@rhombus-std/di.core/builders';
import { registerInlineBodies, typefor } from '@rhombus-std/primitives.extras';
import type { AbstractCtor, Ctor, Func } from '@rhombus-toolkit/func';

declare module '@rhombus-std/di.core/builders' {
  interface IAsImplementer<T, Lifetime, Slots extends Slot> {
    /**
     * Takes the constructor door with the implementer's type observed from `ctor` instead of
     * taken explicitly.
     */
    asClass(ctor: AbstractCtor<any[], T> & Ctor): ServiceDescriptorBuilder<T, Lifetime, Exclude<Slots, 'implementer'>, CtorDescriptor<Lifetime>>;
    /**
     * Takes the factory door with the producer's type observed from `fn` instead of taken
     * explicitly.
     */
    asFactory(fn: Func<any[], T>): ServiceDescriptorBuilder<T, Lifetime, Exclude<Slots, 'implementer'>, FactoryDescriptor<Lifetime>>;
  }
}

export const AsImplementerDescriptorAugmentations = {
  asClass(this: IAsImplementer<any, any, Slot>, ctor: Ctor) {
    return this.asClass(ctor, typefor(ctor));
  },
  asFactory(this: IAsImplementer<any, any, Slot>, fn: Func) {
    return this.asFactory(fn, typefor(fn));
  },
};
registerInlineBodies<IAsImplementer<any, any, Slot>>(AsImplementerDescriptorAugmentations);
