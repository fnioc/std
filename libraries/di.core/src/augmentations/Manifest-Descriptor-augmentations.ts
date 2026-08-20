import { type ConstructorType, type FunctionType, type MergeStrategies, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { AbstractCtor, Ctor, Func } from '@rhombus-toolkit/func';

import { assertNever } from '@rhombus-toolkit/type-guards';
import { type DescribeArgs, type IComplete, runBuilder, type ServiceDescriptorBuilderFor } from '../builder';
import { type Manifest } from '../Manifest';
import { withKey } from '../service-type';
import { ServiceDescriptor } from '../ServiceDescriptor';

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    add(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
    replace(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
    remove(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;

    addMany(descriptors: Iterable<ServiceDescriptor<Scopes>>): Manifest<Scopes>;
    tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Scopes>>): Manifest<Scopes>;

    add(type: Type, ctor: Ctor, ctorType: ConstructorType, scope?: Scopes): Manifest<Scopes>;
    tryAdd(type: Type, ctor: Ctor, ctorType: ConstructorType, scope?: Scopes): Manifest<Scopes>;
    replace(type: Type, ctor: Ctor, ctorType: ConstructorType, scope?: Scopes): Manifest<Scopes>;

    add(type: Type, factory: Func, factoryType: FunctionType, scope?: Scopes): Manifest<Scopes>;
    tryAdd(type: Type, factory: Func, factoryType: FunctionType, scope?: Scopes): Manifest<Scopes>;
    replace(type: Type, factory: Func, factoryType: FunctionType, scope?: Scopes): Manifest<Scopes>;

    add(type: Type, value: unknown): Manifest<Scopes>;
    tryAdd(type: Type, value: unknown): Manifest<Scopes>;
    replace(type: Type, value: unknown): Manifest<Scopes>;

    add(type: Type, configure: Func<[ServiceDescriptorBuilderFor<any, Scopes>], IComplete>): Manifest<Scopes>;
    tryAdd(type: Type, configure: Func<[ServiceDescriptorBuilderFor<any, Scopes>], IComplete>): Manifest<Scopes>;
    replace(type: Type, configure: Func<[ServiceDescriptorBuilderFor<any, Scopes>], IComplete>): Manifest<Scopes>;

    remove(serviceType: Type): Manifest<Scopes>;
    removeAll(type: Type): Manifest<Scopes>;
  }
}

registerAugmentations<Manifest<any>>({
  add(this: Manifest<any>, descriptor: ServiceDescriptor<any>): Manifest<any> {
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
  /** Adds every descriptor in `descriptors` to the manifest, in order — the last one ends up newest. */
  add(this: Manifest<string>, descriptors: Iterable<ServiceDescriptor<string>>): Manifest<string> {
    return Iterator.from(descriptors).reduce((man, descriptor) => man.add(descriptor), this);
  },
  tryAdd(this: Manifest<string>, ...descriptors: ReadonlyArray<ServiceDescriptor<string>>): Manifest<string> {
    return Iterator.from(descriptors)
      .filter(newDesc => !Iterator.from(this).some(existingDesc => ServiceDescriptor.matches(newDesc, existingDesc)))
      .reduce((man, descriptor) => man.add(descriptor), this);
  },
  remove(this: Manifest<string>, serviceType: Type): Manifest<string> {
    const found = Iterator.from(this).find(descriptor => descriptor.serviceType === serviceType);
    return found ? this.remove(found) : this;
  },
  /** Drops every descriptor registered for `type` (narrowed by `key`, if given), leaving every
   * other entry untouched. */
  removeAll(this: Manifest<string>, type: Type): Manifest<string> {
    return Iterator.from(this)
      .filter(({ serviceType }) => serviceType === type)
      .reduce((man, descriptor) => man.remove(descriptor), this);
  },
});

registerAugmentations<Manifest<any>>({
  add(this: Manifest<any>, type: Type, ctor: Ctor, ctorType: ConstructorType, scope?: any): Manifest<any> {
    return this.add(ServiceDescriptor.ctor(type, ctor, ctorType, scope));
  },
  tryAdd(this: Manifest<any>, type: Type, ctor: Ctor, ctorType: ConstructorType, scope?: any): Manifest<any> {
    return this.tryAdd(ServiceDescriptor.ctor(type, ctor, ctorType, scope));
  },
  replace(this: Manifest<any>, type: Type, ctor: Ctor, ctorType: ConstructorType, scope?: any): Manifest<any> {
    return this.replace(ServiceDescriptor.ctor(type, ctor, ctorType, scope));
  },
});

registerAugmentations<Manifest<any>>({
  add(this: Manifest<any>, type: Type, factory: Func, factoryType: FunctionType, scope?: any): Manifest<any> {
    return this.add(ServiceDescriptor.factory(type, factory, factoryType, scope));
  },
  tryAdd(this: Manifest<any>, type: Type, factory: Func, factoryType: FunctionType, scope?: any): Manifest<any> {
    return this.tryAdd(ServiceDescriptor.factory(type, factory, factoryType, scope));
  },
  replace(this: Manifest<any>, type: Type, factory: Func, factoryType: FunctionType, scope?: any): Manifest<any> {
    return this.replace(ServiceDescriptor.factory(type, factory, factoryType, scope));
  },
});

registerAugmentations<Manifest<any>>({
  add(this: Manifest<any>, type: Type, value: unknown): Manifest<any> {
    return this.add(ServiceDescriptor.value(type, value));
  },
  tryAdd(this: Manifest<any>, type: Type, value: unknown): Manifest<any> {
    return this.tryAdd(ServiceDescriptor.value(type, value));
  },
  replace(this: Manifest<any>, type: Type, value: unknown): Manifest<any> {
    return this.replace(ServiceDescriptor.value(type, value));
  },
});

registerAugmentations<Manifest<any>>({
  add(this: Manifest<any>, type: Type, configure: Func<[ServiceDescriptorBuilderFor<any, any>], IComplete>): Manifest<any> {
    return this.add(runBuilder(type, configure));
  },
  tryAdd(this: Manifest<any>, type: Type, configure: Func<[ServiceDescriptorBuilderFor<any, any>], IComplete>): Manifest<any> {
    return this.tryAdd(runBuilder(type, configure));
  },
  replace(this: Manifest<any>, type: Type, configure: Func<[ServiceDescriptorBuilderFor<any, any>], IComplete>): Manifest<any> {
    return this.replace(runBuilder(type, configure));
  },
});

// function isDescriptor(value: unknown): value is ServiceDescriptor<any> {
//   return typeof value === 'object' && value !== null && 'type' in value;
// }

// // `add`'s sugared shapes land on a name the receiver's own primitive already holds. Routing a lone
// // descriptor to the primitive is both halves of the job: it keeps the primitive reachable through
// // the mounted method, and it keeps the sugar — which finishes by handing the descriptor it just
// // built back to `add` — from re-entering itself.
// const descriptorMerge = {
//   add(original, incoming) {
//     return function(this: Manifest<string>, ...args: unknown[]) {
//       return isDescriptor(args[0]) ? original.call(this, ...args) : incoming.call(this, ...args);
//     };
//   },
// } satisfies MergeStrategies<Manifest>;
