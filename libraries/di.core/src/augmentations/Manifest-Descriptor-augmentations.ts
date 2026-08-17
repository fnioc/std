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
    addMany(descriptors: Iterable<ServiceDescriptor<Scopes>>): Manifest<Scopes>;
    tryAdd(...descriptors: ReadonlyArray<ServiceDescriptor<Scopes>>): Manifest<Scopes>;
    removeAll(type: Type): Manifest<Scopes>;
  }
}
export namespace ManifestDescriptorDescriptorAugmentations {
  /** Adds every descriptor in `descriptors` to the manifest, in order — the last one ends up newest. */
  export function add(this: Manifest<string>, descriptors: Iterable<ServiceDescriptor<string>>): Manifest<string> {
    return Iterator.from(descriptors).reduce((man, descriptor) => man.add(descriptor), this);
  }
  export function tryAdd(this: Manifest<string>, ...descriptors: ReadonlyArray<ServiceDescriptor<string>>): Manifest<string> {
    return Iterator.from(descriptors)
      .filter(newDesc => !Iterator.from(this).some(existingDesc => ServiceDescriptor.matches(newDesc, existingDesc)))
      .reduce((man, descriptor) => man.add(descriptor), this);
  }
  /** Drops every descriptor registered for `type` (narrowed by `key`, if given), leaving every
   * other entry untouched. */
  export function removeAll(this: Manifest<string>, type: Type): Manifest<string> {
    return Iterator.from(this)
      .filter(descriptor => descriptor.serviceType === type)
      .reduce((man, descriptor) => man.remove(descriptor), this);
  }
}
registerAugmentations<Manifest<any>>(ManifestDescriptorDescriptorAugmentations);

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    add(type: Type, ctor: Ctor, ctorType: ConstructorType, scope?: Scopes): Manifest<Scopes>;
    tryAdd(type: Type, ctor: Ctor, ctorType: ConstructorType, scope?: Scopes): Manifest<Scopes>;
    replace(type: Type, ctor: Ctor, ctorType: ConstructorType, scope?: Scopes): Manifest<Scopes>;
  }
}
export namespace ManifestDescriptorClassAugmentations {
  export function add(this: Manifest<any>, type: Type, ctor: Ctor, ctorType: ConstructorType, scope?: any): Manifest<any> {
    return this.add(ServiceDescriptor.ctor(type, ctor, ctorType, scope));
  }
  export function tryAdd(this: Manifest<any>, type: Type, ctor: Ctor, ctorType: ConstructorType, scope?: any): Manifest<any> {
    return this.tryAdd(ServiceDescriptor.ctor(type, ctor, ctorType, scope));
  }
  export function replace(this: Manifest<any>, type: Type, ctor: Ctor, ctorType: ConstructorType, scope?: any): Manifest<any> {
    return this.replaceSingle(ServiceDescriptor.ctor(type, ctor, ctorType, scope));
  }
}
registerAugmentations<Manifest<any>>(ManifestDescriptorClassAugmentations);

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    add(type: Type, factory: Func, factoryType: FunctionType, scope?: Scopes): Manifest<Scopes>;
    tryAdd(type: Type, factory: Func, factoryType: FunctionType, scope?: Scopes): Manifest<Scopes>;
    replace(type: Type, factory: Func, factoryType: FunctionType, scope?: Scopes): Manifest<Scopes>;
  }
}
export namespace ManifestDescriptorFactoryAugmentations {
  export function add(this: Manifest<any>, type: Type, factory: Func, factoryType: FunctionType, scope?: any): Manifest<any> {
    return this.add(ServiceDescriptor.factory(type, factory, factoryType, scope));
  }
  export function tryAdd(this: Manifest<any>, type: Type, factory: Func, factoryType: FunctionType, scope?: any): Manifest<any> {
    return this.tryAdd(ServiceDescriptor.factory(type, factory, factoryType, scope));
  }
  export function replace(this: Manifest<any>, type: Type, factory: Func, factoryType: FunctionType, scope?: any): Manifest<any> {
    return this.replaceSingle(ServiceDescriptor.factory(type, factory, factoryType, scope));
  }
}
registerAugmentations<Manifest<any>>(ManifestDescriptorFactoryAugmentations);

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    add(type: Type, value: unknown): Manifest<Scopes>;
    tryAdd(type: Type, value: unknown): Manifest<Scopes>;
    replace(type: Type, value: unknown): Manifest<Scopes>;
  }
}

export namespace ManifestDescriptorValueAugmentations {
  export function add(this: Manifest<any>, type: Type, value: unknown): Manifest<any> {
    return this.add(ServiceDescriptor.value(type, value));
  }
  export function tryAdd(this: Manifest<any>, type: Type, value: unknown): Manifest<any> {
    return this.tryAdd(ServiceDescriptor.value(type, value));
  }
  export function replace(this: Manifest<any>, type: Type, value: unknown): Manifest<any> {
    return this.replaceSingle(ServiceDescriptor.value(type, value));
  }
}
registerAugmentations<Manifest<any>>(ManifestDescriptorValueAugmentations);

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    add(type: Type, configure: Func<[ServiceDescriptorBuilderFor<any, Scopes>], IComplete>): Manifest<Scopes>;
    tryAdd(type: Type, configure: Func<[ServiceDescriptorBuilderFor<any, Scopes>], IComplete>): Manifest<Scopes>;
    replace(type: Type, configure: Func<[ServiceDescriptorBuilderFor<any, Scopes>], IComplete>): Manifest<Scopes>;
  }
}
export namespace ManifestDescriptorBuilderAugmentations {
  export function add(this: Manifest<any>, type: Type, configure: Func<[ServiceDescriptorBuilderFor<any, any>], IComplete>): Manifest<any> {
    return this.add(runBuilder(type, configure));
  }
  export function tryAdd(this: Manifest<any>, type: Type, configure: Func<[ServiceDescriptorBuilderFor<any, any>], IComplete>): Manifest<any> {
    return this.tryAdd(runBuilder(type, configure));
  }
  export function replace(this: Manifest<any>, type: Type, configure: Func<[ServiceDescriptorBuilderFor<any, any>], IComplete>): Manifest<any> {
    return this.replace(runBuilder(type, configure));
  }
}
registerAugmentations<Manifest<any>>(ManifestDescriptorBuilderAugmentations);

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
