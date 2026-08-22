import type { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { ServiceDescriptor } from './ServiceDescriptor/index';

/**
 * The one callable governing instance reuse: the engine calls it at every realized site, and the
 * value it returns is the value the engine uses. Whether that value came from `make` or from
 * storage is the model's own business — a reuse hit simply never invokes `make`, which is what
 * prunes the site's subtree.
 *
 * @remarks
 * `make` receives the model governing every descendant site realized during it — pass a
 * different one to change how the subtree behaves; pass the receiver to keep it. `descriptor` is
 * the answering registration, whose {@link ServiceDescriptor.lifetime | lifetime} the model
 * interprets; it is absent for an engine-synthesized site, which carries no lifetime datum.
 * `site` is stable per plan node, unique per registration even when several registrations share
 * one address — an identity to key storage by. `serviceType` is the type as requested.
 *
 * @typeParam Lifetime - the vocabulary of lifetime data this model interprets.
 */
/**
 * The lifetime parameter's spelling for a vocabulary: omittable exactly when `undefined` is
 * assignable to `Lifetime`. Omission is not a special case — it is the value `undefined`, and it
 * compiles under the same assignability rule every other value answers to.
 */
export type LifetimeArgument<Lifetime> = undefined extends Lifetime ? [lifetime?: Lifetime] : [lifetime: Lifetime];

export interface LifetimeModel<Lifetime = unknown> {
  realize(
    site: object,
    serviceType: Type,
    descriptor: ServiceDescriptor<Lifetime> | undefined,
    make: Func<[LifetimeModel<Lifetime>], unknown>,
  ): unknown;
}
