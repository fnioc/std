// Adds `addHostedService` onto `Manifest` via declaration merging on
// the interface plus a runtime install through the augmentation registry.
// `Manifest` is extended by many downstream packages, so this
// registers against `typefor<Manifest>()` rather than installing
// directly; `DefaultManifest` picks it up through its own `@augment`
// decorator in `@rhombus-std/di.core`.
//
// Every hosted service registers under the one shared
// {@link HOSTED_SERVICE_TYPE} as a singleton, and the host resolves the
// whole set via the collection wrapper token.

// Named imports: unqualified names in a `declare module` body resolve in THIS
// file's scope, so `Manifest` must be importable here.
import { type IServiceProvider, type Manifest } from '@rhombus-std/di.core';
import { type ConstructorType, Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { IHostedService } from './IHostedService';
import { HOSTED_SERVICE_TYPE } from './types';

// An ES class stringifies to a `class …` head; a factory (arrow or plain
// function) does not.
function isConstructor(target: Ctor | Func<[IServiceProvider], IHostedService>): target is Ctor {
  return /^class[\s{]/.test(Function.prototype.toString.call(target));
}

export namespace ServiceManifestHostedServiceAugmentations {
  /**
   * Registers a factory as an {@link IHostedService}. Use it to surface an
   * instance already registered under a different token as a hosted service
   * (e.g. `addHostedService((sp) => sp.resolve(SOME_TOKEN))`).
   *
   * @remarks
   * Listed before the ctor overload so an un-annotated factory lambda infers
   * its resolver parameter; a class value is disambiguated by type (not
   * arity) and still resolves to the ctor overload below.
   */
  export function addHostedService(this: Manifest<unknown>, implementationFactory: Func<[IServiceProvider], IHostedService>): Manifest<unknown>;
  /**
   * Registers `ctor` as an {@link IHostedService} the host will start and
   * stop alongside its lifetime. `implementerType` is the ctor's composed
   * constructor type; omitted, a dependency-free ctor is assumed.
   */
  export function addHostedService(this: Manifest<unknown>, ctor: Ctor, implementerType?: ConstructorType): Manifest<unknown>;
  // A class value matches the construct-signature arm, an arrow or function the
  // call-signature arm; only the ctor form carries a composed constructor type.
  export function addHostedService(this: Manifest<unknown>, ctorOrImplementationFactory: Ctor | Func<[IServiceProvider], IHostedService>, implementerType?: ConstructorType): Manifest<unknown> {
    // The factory form injects the live resolver (via the `Type.func(..., [[typefor<IServiceProvider>()]])`
    // composed type) so the delegate receives it. A ctor form
    // with no `implementerType` is a dependency-free ctor, stated explicitly as one
    // that carries no argument types (`addClass` has no overload that omits it).
    if (isConstructor(ctorOrImplementationFactory)) {
      return this.add(HOSTED_SERVICE_TYPE, ctorOrImplementationFactory, implementerType ?? Type.ctor(HOSTED_SERVICE_TYPE, [[]]), 'singleton');
    }
    return this.add(HOSTED_SERVICE_TYPE, ctorOrImplementationFactory as Func, Type.func(HOSTED_SERVICE_TYPE, [[typefor<IServiceProvider>()]]), 'singleton');
  }
}

// `Lifetime` is defaulted so the merge's type-parameter list matches the target's
// (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface Manifest<Lifetime> {
    addHostedService(implementationFactory: Func<[IServiceProvider], IHostedService>): Manifest<Lifetime>;
    addHostedService(ctor: Ctor, implementerType?: ConstructorType): Manifest<Lifetime>;
  }
}

registerAugmentations<Manifest<any>>(ServiceManifestHostedServiceAugmentations);
