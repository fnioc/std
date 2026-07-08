// The `addHostedService` fluent registration -- ported from the reference's
// ServiceCollection `AddHostedService<T>` extension (which ships in the Hosting
// abstractions package, not the DI runtime). Installed as a side-effect
// augmentation onto di.core's registration builder, exactly how
// @rhombus-std/options.augmentations adds `addOptions`/`configure`:
// TS declaration merging onto the interface + a runtime prototype assignment on
// the concrete class.
//
// The reference registers `IHostedService` specifically (an enumerable
// singleton), NOT the concrete type -- so here every hosted service registers
// under the ONE shared {@link HOSTED_SERVICE_TOKEN} as a singleton, and the host
// resolves the whole set via the collection wrapper token.

import { ServiceManifestClass } from "@rhombus-std/di.core";
// Named imports: unqualified names in a `declare module` body resolve in THIS
// file's scope, so `AddBuilder`/`Ctor`/`DepSlot` must be importable here.
import type { AddBuilder, DepSlot } from "@rhombus-std/di.core";
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

ServiceManifestClass.prototype.addHostedService = function addHostedService(
  this: ServiceManifestClass<string>,
  ctor: Ctor,
  signatures?: readonly (readonly DepSlot[])[],
): ServiceManifestClass<string> {
  const builder: AddBuilder<string> = this.add(HOSTED_SERVICE_TOKEN, ctor, signatures);
  builder.as("singleton");
  return this;
};
