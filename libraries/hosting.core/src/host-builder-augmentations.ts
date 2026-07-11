// Host builder helpers -- ported from the reference's
// `HostingAbstractionsHostBuilderExtensions` static augmentation class. Authored
// as one named object literal per ME class (docs §28), `satisfies
// AugmentationSet<IHostBuilder>`.
//
// OPEN receiver (docs §38): `IHostBuilder` is extended across packages (this
// abstractions const AND the runtime `HostingHostBuilderExtensions` both target
// it), so this const registers into the augmentation registry under
// the `IHostBuilder` token, beside its interface-side merge
// (rule 0.6). The concrete `HostBuilder` -- downstream in `@rhombus-std/hosting`
// -- is decorated with `@augment(nameof<IHostBuilder>())` and pulls both
// consts' members onto its prototype. The synchronous reference `Start` collapses
// into the async form -- JS cannot block a thread.

import { type AbortSignal, type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { IHost } from "./IHost";
import type { IHostBuilder } from "./IHostBuilder";

// The interface-side merge for this const's member lives HERE, beside the const
// (rule 0.6). The runtime `HostingHostBuilderExtensions` merges its own members
// onto `IHostBuilder` downstream; the class-side merge (so `HostBuilder`
// SATISFIES the fully-merged interface) lives downstream next to that class.
//
// The merge targets the package BARREL (`@rhombus-std/hosting.core`), not the
// relative declaring module: a cross-package augmentation kept verbatim in a
// rolled `.d.ts` (rollup-dts `respectExternal`) only resolves for a published
// consumer if the specifier survives publish. The downstream
// `HostingHostBuilderExtensions` merge is cross-package, so it must use a
// publish-resolvable specifier; the barrel is the only one an interface can
// share across in-package and downstream sites (a relative/`internal/*` pair
// resolves in-repo but breaks published consumers). Every merge site for this
// interface therefore targets the barrel -- the same all-barrel discipline
// di.core's `ServiceManifest` and logging.core's `ILoggingBuilder` already use.
declare module "@rhombus-std/hosting.core" {
  interface IHostBuilder {
    startHost(abortSignal?: AbortSignal): Promise<IHost>;
  }
}

/**
 * The `HostingAbstractionsHostBuilderExtensions` augmentation set for
 * {@link IHostBuilder} (docs §28). Registered under
 * the `IHostBuilder` token; the concrete `HostBuilder` downstream
 * pulls it via `@augment`. The member here is also the standalone call surface.
 */
export const HostingAbstractionsHostBuilderExtensions = {
  /**
   * Builds the host and starts it.
   *
   * @param hostBuilder The builder to build and start.
   * @param abortSignal Cancels the start.
   * @returns The started {@link IHost}.
   */
  async startHost(
    hostBuilder: IHostBuilder,
    abortSignal?: AbortSignal,
  ): Promise<IHost> {
    const host = hostBuilder.build();
    await host.start(abortSignal);
    return host;
  },
} satisfies AugmentationSet<IHostBuilder>;

registerAugmentations(nameof<IHostBuilder>(), HostingAbstractionsHostBuilderExtensions);
