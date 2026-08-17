import type { IComplete, Manifest, ServiceDescriptorBuilderFor } from '@rhombus-std/di.core';
import { ConstructorType, FunctionType } from '@rhombus-std/primitives';
import { registerInlineBodies, typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    add<T>(ctor: Ctor<any[], T>, scope?: string): Manifest<Scopes>;
    add<T>(factory: Func<any[], T>, scope?: string): Manifest<Scopes>;
    add<T>(value: T): Manifest<Scopes>;

    tryAdd<T>(configure: Func<[ServiceDescriptorBuilderFor<T, Scopes>], IComplete>): Manifest<Scopes>;
    tryAdd<T>(ctor: Ctor<any[], T>, ctorType: ConstructorType, scope?: string): Manifest<Scopes>;
    tryAdd<T>(factory: Func<any[], T>, factoryType: FunctionType, scope?: string): Manifest<Scopes>;
    tryAdd<T>(value: T): Manifest<Scopes>;

    replace<T>(ctor: Ctor<any[], T>, ctorType: ConstructorType, scope?: string): Manifest<Scopes>;
    replace<T>(factory: Func<any[], T>, factoryType: FunctionType, scope?: string): Manifest<Scopes>;
    replace<T>(value: T): Manifest<Scopes>;

    removeAll<T>(): Manifest<Scopes>;
  }
}

export namespace ManifestDescriptorSugarAugmentations {
  export function add<T>(this: Manifest<any>, value: Ctor<any, T> | Func<any, T> | T, ...rest: any): Manifest<any> {
    return this.add.apply(this, [typefor<T>(), value, typefor(value), ...rest] as any);
  }
  export function tryAdd<T>(this: Manifest<any>): Manifest<any> {
    return this.tryAdd.apply(this, [typefor<T>(), ...arguments] as any);
  }
  export function replace<T>(this: Manifest<any>): Manifest<any> {
    return this.replace.apply(this, [typefor<T>(), ...arguments] as any);
  }
  export function removeAll<T>(this: Manifest<any>): Manifest<any> {
    return this.removeAll.apply(this, [typefor<T>(), ...arguments] as any);
  }
}

registerInlineBodies<Manifest<any>>(ManifestDescriptorSugarAugmentations);
