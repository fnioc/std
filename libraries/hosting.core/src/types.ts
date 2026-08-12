// DI-slot types shared between hosting's registration side (`addHostedService`,
// the host's lifetime registration) and its resolution side (the host
// resolving its hosted services and lifetime).

import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { IHostApplicationLifetime } from './IHostApplicationLifetime';
import type { IHostedService } from './IHostedService';

/**
 * The shared type every hosted service registers under — each `add` call
 * accumulates rather than replacing. The host resolves the whole set in
 * registration order via {@link hostedServiceCollectionType}.
 */
export const HOSTED_SERVICE_TYPE: Type = typefor<IHostedService>();

export const HOST_APPLICATION_LIFETIME_TYPE: Type = typefor<IHostApplicationLifetime>();

/**
 * Resolves every {@link HOSTED_SERVICE_TYPE} registration together, in
 * registration order (empty array if none).
 */
export function hostedServiceCollectionType(): Type {
  return Type.named('Array', 'global', [HOSTED_SERVICE_TYPE]);
}
