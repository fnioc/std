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
    readonly registrations?: Iterable<Registration<Lifetime>>;
  };
}

/**
 * Classifies registrations by where their product is kept, for a validator to rank.
 *
 * @remarks
 * Tier 0 is the container root; a higher tier is a narrower keeper. `'unkept'` means the
 * registration is constructed fresh per ask and kept by nothing. `undefined` means the
 * registration's lifetime is model-defined and ranks only at runtime.
 */
export interface LifetimePolicy {
  /**
   * Where `registration`'s product is kept.
   *
   * @returns a tier and its human-readable label, `'unkept'`, or `undefined` — see the interface
   * remarks for what each means.
   */
  classify(registration: Registration<unknown> | undefined): { readonly tier: number; readonly label: string; } | 'unkept' | undefined;
}
