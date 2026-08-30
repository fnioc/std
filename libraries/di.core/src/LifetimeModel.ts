import type { ButNot } from '@rhombus-std/primitives';

import type { Middleware } from './Middleware.js';
import type { Registration } from './Registration/index.js';

/** Lets the lifetime argument be omitted entirely when `undefined` is in the vocabulary. */
export type LifetimeArgument<Lifetime> = undefined extends Lifetime ? [lifetime?: Lifetime] : [lifetime: Lifetime];

/**
 * A defined pattern of behavior for how long a construction is kept and what keeps it.
 *
 * @typeParam Lifetime - the vocabulary of lifetime data this model interprets.
 */
export interface LifetimeModel<Lifetime = unknown> {
  /** What this model calls itself. */
  readonly name: string;

  /** This model's value for "construct afresh, keep nothing". */
  readonly transient: Lifetime;

  /**
   * Mints one container's contribution to the build: the middleware carrying this model's keeping
   * into every resolution, and the registrations it publishes — the floor a container's own
   * registrations layer over.
   *
   * @remarks
   * Choosing a lifetime model is the builder's first call, so this middleware composes outermost,
   * ahead of every addon's and `use()`'s own. A model that keeps nothing omits it, leaving the
   * container to resolve straight through whatever composes inside it.
   */
  create(): {
    readonly middleware?: Middleware;
    readonly registrations?: ButNot<Iterable<Registration<Lifetime>>, Iterator<any>>;
  };
}
