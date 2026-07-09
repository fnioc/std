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
import type { AddBuilder, DepSlot, ServiceManifest, ServiceManifestClass } from "@rhombus-std/di.core";
import { registerAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Ctor } from "@rhombus-toolkit/func";
import { HOSTED_SERVICE_TOKEN } from "./tokens";

// The authored method merges onto core's `ServiceManifestBase` interface -- the
// surface the public `ServiceManifest` resolves to -- AND onto the concrete
// `ServiceManifestClass`, so the class still SATISFIES the interface once the new
// name is on it. `Provider` is defaulted so the merge matches the target's
// type-parameter list (TS2428 requires identical parameters).
declare module "@rhombus-std/di.core" {
  interface ServiceManifestBase<Scopes extends string = "singleton", Provider = unknown> {
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
    addHostedService(ctor: Ctor, signatures?: readonly (readonly DepSlot[])[]): this;
  }
}

// One named object literal mirroring the reference `ServiceCollectionHostedServiceExtensions`
// static class (docs §28), registered into the augmentation registry (the primary
// path) AND exported so the member is the standalone form.
export const ServiceCollectionHostedServiceExtensions = {
  addHostedService(
    manifest: ServiceManifestClass<string>,
    ctor: Ctor,
    signatures?: readonly (readonly DepSlot[])[],
  ): ServiceManifestClass<string> {
    const builder: AddBuilder<string> = manifest.add(HOSTED_SERVICE_TOKEN, ctor, signatures);
    builder.as("singleton");
    return manifest;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(nameof<ServiceManifest>(), ServiceCollectionHostedServiceExtensions);
