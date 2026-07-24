// DI-slot tokens shared between hosting's registration side (`addHostedService`,
// the host's lifetime registration) and its resolution side (the host
// resolving its hosted services and lifetime).

import type { Token } from '@rhombus-std/di.core';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { IHostApplicationLifetime } from './IHostApplicationLifetime';
import type { IHostedService } from './IHostedService';

/**
 * The shared token every hosted service registers under — each `add` call
 * accumulates rather than replacing. The host resolves the whole set in
 * registration order via {@link hostedServiceCollectionToken}.
 */
export const HOSTED_SERVICE_TOKEN: Token = tokenfor<IHostedService>();

/** The token the host's {@link IHostApplicationLifetime} is registered under. */
export const HOST_APPLICATION_LIFETIME_TOKEN: Token = tokenfor<IHostApplicationLifetime>();

/**
 * The token used to resolve every {@link HOSTED_SERVICE_TOKEN} registration
 * together, in registration order (empty array if none).
 */
export function hostedServiceCollectionToken(): Token {
  return `Array<${HOSTED_SERVICE_TOKEN}>`;
}
