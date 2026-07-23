// The DI-slot token ABI the hosting family shares. The registration side
// (`addHostedService`, and the host's lifetime registration in
// `@rhombus-std/hosting`) and the resolution side (the internal host resolving
// its hosted services and its lifetime) travel through the container via these
// tokens, so they live here in the abstractions substrate that both depend on.

import type { Token } from '@rhombus-std/di.core';
import { tokenfor } from '@rhombus-std/primitives';
import type { IHostApplicationLifetime } from './IHostApplicationLifetime';
import type { IHostedService } from './IHostedService';

/**
 * The shared token every hosted service registers under (repeated `add` calls,
 * #48 collection resolution). The host resolves the whole set in registration
 * order via {@link hostedServiceCollectionToken}.
 */
export const HOSTED_SERVICE_TOKEN: Token = tokenfor<IHostedService>();

/** The token the host's {@link IHostApplicationLifetime} is registered under. */
export const HOST_APPLICATION_LIFETIME_TOKEN: Token = tokenfor<IHostApplicationLifetime>();

/**
 * The collection wrapper token the engine recognizes to aggregate every
 * {@link HOSTED_SERVICE_TOKEN} registration into an array (empty if none).
 */
export function hostedServiceCollectionToken(): Token {
  return `Array<${HOSTED_SERVICE_TOKEN}>`;
}
