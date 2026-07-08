// Host builder helpers -- ported from the reference's
// `HostingAbstractionsHostBuilderExtensions` static extension class. Authored as
// one named object literal per ME class (docs §28), `satisfies
// AugmentationSet<IHostBuilder>`. IHostBuilder is a plain interface with no
// concrete class in THIS abstractions package to prototype-patch, so the
// method-form install (and the `declare module` merge) live downstream in
// `@rhombus-std/hosting` against the concrete `HostBuilder`, per the
// cross-package rule -- here we only ship the literal (its member is the
// standalone call surface). The synchronous reference `Start` collapses into the
// async form -- JS cannot block a thread.

import type { AugmentationSet } from "@rhombus-std/primitives";
import type { IHost } from "./host";
import type { IHostBuilder } from "./host-builder";

/**
 * Builds the host and starts it.
 *
 * @param hostBuilder The builder to build and start.
 * @param cancellationToken Cancels the start.
 * @returns The started {@link IHost}.
 */
async function startHost(
  hostBuilder: IHostBuilder,
  cancellationToken?: AbortSignal,
): Promise<IHost> {
  const host = hostBuilder.build();
  await host.start(cancellationToken);
  return host;
}

/**
 * The `HostingAbstractionsHostBuilderExtensions` augmentation set for
 * {@link IHostBuilder} (docs §28). Installed as an instance method onto the
 * concrete `HostBuilder` downstream in `@rhombus-std/hosting`; the member here is
 * the standalone call surface.
 */
export const HostingAbstractionsHostBuilderExtensions = {
  startHost,
} satisfies AugmentationSet<IHostBuilder>;
