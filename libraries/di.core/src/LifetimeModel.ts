import type { Addon } from './Addon.js';

/** Lets the lifetime argument be omitted entirely when `undefined` is in the vocabulary. */
export type LifetimeArgument<Lifetime> = undefined extends Lifetime ? [lifetime?: Lifetime] : [lifetime: Lifetime];

/**
 * A defined pattern of behavior for how long a construction is kept and what keeps it.
 * A lifetime model is an addon like any other — its registrations and middleware compose through
 * the same door — with metadata naming the model and its transient value.
 *
 * @typeParam Lifetime - the vocabulary of lifetime data this model interprets.
 */
export interface LifetimeModel<Lifetime = unknown> extends Addon<Lifetime> {
  /** What this model calls itself. */
  readonly name: string;

  /** This model's value for "construct afresh, keep nothing". */
  readonly transient: Lifetime;
}
