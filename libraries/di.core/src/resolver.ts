import { Type } from '@rhombus-std/primitives';

/**
 * The service type a factory names to be handed the provider that is resolving it.
 *
 * @remarks
 * Listing it in a factory's signatures injects the live {@link IServiceProvider} as
 * that parameter, which is how a registration defers a lookup it cannot make at
 * registration time -- a value assembled from other registrations that are not
 * known until the graph is sealed.
 */
export const RESOLVER_TYPE: Type = Type.named('IServiceProvider', '@rhombus-std/primitives');
