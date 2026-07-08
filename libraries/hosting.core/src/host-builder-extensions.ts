// Host builder helpers -- ported from the reference's
// HostingAbstractionsHostBuilder extension methods. IHostBuilder is a plain
// interface with no concrete class here to prototype-patch, so this surfaces as
// a named function (see diNotes). The synchronous reference `Start` collapses
// into the async form -- JS cannot block a thread.

import type { IHost } from "./host";
import type { IHostBuilder } from "./host-builder";

/**
 * Builds the host and starts it.
 *
 * @param hostBuilder The builder to build and start.
 * @param cancellationToken Cancels the start.
 * @returns The started {@link IHost}.
 */
export async function startHost(
  hostBuilder: IHostBuilder,
  cancellationToken?: AbortSignal,
): Promise<IHost> {
  const host = hostBuilder.build();
  await host.start(cancellationToken);
  return host;
}
