// The `addHostedService` fluent registration -- ported from the reference's
// ServiceCollection `AddHostedService<T>` extension (which ships in the Hosting
// abstractions package, not the DI runtime). Registered as a cross-package
// augmentation onto di.core's registration builder, exactly how
// @rhombus-std/options.augmentations adds `addOptions`/`configure`: TS
// declaration merging onto the interface + a runtime install through the
// augmentation registry.
//
// OPEN receiver (docs §38): `ServiceManifest` is extended by many downstream
// packages, so this const registers against
// `nameof<ServiceManifest>()` (owned by di.core). The concrete
// `ServiceManifestClass` -- in `@rhombus-std/di.core` -- is decorated with
// `@augment(nameof<ServiceManifest>())` there, so it pulls this bag
// (and every other cross-package set on the same token) onto its prototype. As
// this is a FOREIGN receiver class, both the interface-side merge (onto
// `ServiceManifestBase`) and the class-side merge (onto `ServiceManifestClass`)
// live here in the extending package.
//
// The reference registers `IHostedService` specifically (an enumerable
// singleton), NOT the concrete type -- so here every hosted service registers
// under the ONE shared {@link HOSTED_SERVICE_TOKEN} as a singleton, and the host
// resolves the whole set via the collection wrapper token.

// Named imports: unqualified names in a `declare module` body resolve in THIS
// file's scope, so `AddBuilder`/`Ctor`/`DepSlot`/`ServiceManifestClass` must be
// importable here.
import {
  type AddBuilder,
  type DepSlot,
  type Resolver,
  RESOLVER_TOKEN,
  type ServiceManifest,
  type ServiceManifestClass,
} from "@rhombus-std/di.core";
import { type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Ctor, Func } from "@rhombus-toolkit/func";
import type { IHostedService } from "./IHostedService";
import { HOSTED_SERVICE_TOKEN } from "./tokens";

// The authored method merges onto core's `ServiceManifestBase` interface -- the
// surface the public `ServiceManifest` resolves to -- AND onto the concrete
// `ServiceManifestClass`, so the class still SATISFIES the interface once the new
// name is on it. `Provider` is defaulted so the merge matches the target's
// type-parameter list (TS2428 requires identical parameters).
declare module "@rhombus-std/di.core" {
  interface ServiceManifestBase<Scopes extends string = "singleton", Provider = unknown> {
    /**
     * Registers a factory as an {@link IHostedService} — the reference's
     * `AddHostedService(Func<IServiceProvider, THostedService>)` overload. Use it
     * to surface an instance already registered under a different token as a
     * hosted service (e.g. `addHostedService((sp) => sp.resolve(SOME_TOKEN))`).
     * The factory receives the resolver and returns the service; it is registered
     * as the same enumerable singleton the ctor form uses.
     *
     * Listed before the ctor overload so an un-annotated factory lambda infers its
     * resolver parameter; a class value is disambiguated by type (not arity) and
     * still resolves to the ctor overload below.
     */
    addHostedService(implementationFactory: Func<[Resolver], IHostedService>): this;
    /**
     * Registers `ctor` as an {@link IHostedService} the host will start and stop
     * alongside its lifetime. The singleton lifetime is applied here (the host
     * opens the `"singleton"` scope), mirroring the reference's enumerable
     * singleton registration. `signatures` carries the ctor's dep signatures for
     * the transformer-free path.
     */
    addHostedService(ctor: Ctor, signatures?: readonly (readonly DepSlot[])[]): this;
  }

  interface ServiceManifestClass<Scopes extends string = "singleton"> {
    addHostedService(implementationFactory: Func<[Resolver], IHostedService>): this;
    addHostedService(ctor: Ctor, signatures?: readonly (readonly DepSlot[])[]): this;
  }
}

// Discriminates the two `addHostedService` forms: an ES class stringifies to a
// `class …` head, a factory (arrow or plain function) does not. Realistic hosted
// services are classes and factories are lambdas, so this cleanly separates the
// construct-signature form from the provider-taking one.
function isConstructor(target: Ctor | Func<[Resolver], IHostedService>): target is Ctor {
  return /^class[\s{]/.test(Function.prototype.toString.call(target));
}

// One named object literal mirroring the reference `ServiceCollectionHostedServiceExtensions`
// static class (docs §28), registered into the augmentation registry (the primary
// path) AND exported so the member is the standalone form.
export const ServiceCollectionHostedServiceExtensions = {
  addHostedService(
    manifest: ServiceManifestClass<string>,
    // §42 overloaded member: the ctor form carries optional dep signatures; the
    // factory form is a lone provider-taking function. A class value matches the
    // construct-signature arm, an arrow/function the call-signature arm.
    ...rest:
      | [ctor: Ctor, signatures?: readonly (readonly DepSlot[])[]]
      | [implementationFactory: Func<[Resolver], IHostedService>]
  ): ServiceManifestClass<string> {
    const [target, signatures] = rest;
    // Both forms register the shared enumerable-singleton hosted-service token.
    // The factory form injects the live resolver (via the `[[RESOLVER_TOKEN]]`
    // dep signature) so the delegate receives it, mirroring the reference's
    // `Func<IServiceProvider, T>`.
    const builder: AddBuilder<string> = isConstructor(target)
      ? manifest.add(HOSTED_SERVICE_TOKEN, target, signatures)
      : manifest.addFactory(HOSTED_SERVICE_TOKEN, target, [[RESOLVER_TOKEN]]);
    builder.as("singleton");
    return manifest;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(nameof<ServiceManifest>(), ServiceCollectionHostedServiceExtensions);
