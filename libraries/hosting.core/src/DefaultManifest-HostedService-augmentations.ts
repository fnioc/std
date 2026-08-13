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
// file's scope, so `Manifest`/`DefaultManifest` must be importable here.
import { type DefaultManifest, type IServiceProvider, type Manifest, RESOLVER_TYPE } from '@rhombus-std/di.core';
import { type AugmentationSet2, type CtorType, type IntersectionType, registerAugmentations,
  Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { IHostedService } from './IHostedService';
import { HOSTED_SERVICE_TYPE } from './types';

type IManifestHostedServiceAugmentations<Scopes extends string> = {
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
  addHostedService(implementationFactory: Func<[IServiceProvider], IHostedService>): Manifest<Scopes>;
  /**
   * Registers `ctor` as an {@link IHostedService} the host will start and
   * stop alongside its lifetime. `implType` is the ctor's composed
   * constructor type; omitted, a dependency-free ctor is assumed.
   */
  addHostedService(ctor: Ctor, implType?: CtorType | IntersectionType): Manifest<Scopes>;
};

// `Provider` is defaulted so the merge's type-parameter list matches the
// target's (TS2428 requires identical parameters), even though the member does
// not name it.
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string = any> extends IManifestHostedServiceAugmentations<Scopes> {}
}

// An ES class stringifies to a `class …` head; a factory (arrow or plain
// function) does not.
function isConstructor(target: Ctor | Func<[IServiceProvider], IHostedService>): target is Ctor {
  return /^class[\s{]/.test(Function.prototype.toString.call(target));
}

export const ServiceManifestHostedServiceAugmentations: AugmentationSet2<DefaultManifest<string>,
  IManifestHostedServiceAugmentations<string>> = { addHostedService(
    // The ctor form carries an optional composed constructor type; the factory
    // form is a lone provider-taking function. A class value matches the
    // construct-signature arm, an arrow/function the call-signature arm.
    ...rest: [ctor: Ctor, implType?: CtorType | IntersectionType] | [
      implementationFactory: Func<[IServiceProvider], IHostedService>,
    ]
  ): Manifest<string> {
    const [target, implType] = rest;
    // The factory form injects the live resolver (via the `Type.func(...,
    // RESOLVER_TYPE)` composed type) so the delegate receives it. A ctor form
    // with no `implType` is a dependency-free ctor, stated explicitly as one
    // that carries no argument types (`addClass` has no overload that omits it).
    return isConstructor(target)
      ? this.addClass(HOSTED_SERVICE_TYPE, target, implType ?? Type.ctor(HOSTED_SERVICE_TYPE), 'singleton')
      : this.addFactory(HOSTED_SERVICE_TYPE, target, Type.func(HOSTED_SERVICE_TYPE, RESOLVER_TYPE), 'singleton');
  } };

registerAugmentations(typefor<Manifest>(), ServiceManifestHostedServiceAugmentations);
