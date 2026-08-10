// Adds `addHostedService` onto `IServiceManifest` via declaration merging on
// the interface plus a runtime install through the augmentation registry.
// `IServiceManifest` is extended by many downstream packages, so this
// registers against `tokenfor<IServiceManifest>()` rather than installing
// directly; `ServiceManifestClass` picks it up through its own `@augment`
// decorator in `@rhombus-std/di.core`.
//
// Every hosted service registers under the one shared
// {@link HOSTED_SERVICE_TOKEN} as a singleton, and the host resolves the
// whole set via the collection wrapper token.

// Named imports: unqualified names in a `declare module` body resolve in THIS
// file's scope, so `DepSlot`/`IServiceManifest`/`ServiceManifestClass` must be
// importable here.
import { type DepSlot, type IResolver, type IServiceManifest, RESOLVER_TOKEN,
  type ServiceManifestClass } from '@rhombus-std/di.core';
import { type AugmentationSet2, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { IHostedService } from './IHostedService';
import { HOSTED_SERVICE_TOKEN } from './tokens';

type IServiceManifestHostedServiceAugmentations<Scopes extends string> = {
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
  addHostedService(implementationFactory: Func<[IResolver], IHostedService>): IServiceManifest<Scopes>;
  /**
   * Registers `ctor` as an {@link IHostedService} the host will start and
   * stop alongside its lifetime. `signatures` carries the ctor's dep
   * signatures; omitted, a dependency-free ctor is assumed.
   */
  addHostedService(ctor: Ctor, signatures?: ReadonlyArray<readonly DepSlot[]>): IServiceManifest<Scopes>;
};

// `Provider` is defaulted so the merge's type-parameter list matches the
// target's (TS2428 requires identical parameters), even though the member does
// not name it.
declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown>
    extends IServiceManifestHostedServiceAugmentations<Scopes> {}
}

// An ES class stringifies to a `class …` head; a factory (arrow or plain
// function) does not.
function isConstructor(target: Ctor | Func<[IResolver], IHostedService>): target is Ctor {
  return /^class[\s{]/.test(Function.prototype.toString.call(target));
}

export const ServiceManifestHostedServiceAugmentations: AugmentationSet2<ServiceManifestClass<string>,
  IServiceManifestHostedServiceAugmentations<string>> = { addHostedService(
    manifest: ServiceManifestClass<string>,
    // The ctor form carries optional dep signatures; the factory form is a
    // lone provider-taking function. A class value matches the
    // construct-signature arm, an arrow/function the call-signature arm.
    ...rest: [ctor: Ctor, signatures?: ReadonlyArray<readonly DepSlot[]>] | [
      implementationFactory: Func<[IResolver], IHostedService>,
    ]
  ): IServiceManifest<string> {
    const [target, signatures] = rest;
    // The factory form injects the live resolver (via the `[[RESOLVER_TOKEN]]`
    // dep signature) so the delegate receives it. A ctor form with no
    // `signatures` is a dependency-free ctor, stated explicitly as `[[]]`
    // (`addClass` has no overload that omits it).
    return isConstructor(target)
      ? manifest.addClass(HOSTED_SERVICE_TOKEN, target, signatures ?? [[]], 'singleton')
      : manifest.addFactory(HOSTED_SERVICE_TOKEN, target, [[RESOLVER_TOKEN]], 'singleton');
  } };

registerAugmentations(tokenfor<IServiceManifest>(), ServiceManifestHostedServiceAugmentations);
