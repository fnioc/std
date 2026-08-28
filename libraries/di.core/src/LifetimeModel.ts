import type { IServiceProvider } from './IServiceProvider';
import type { Registration } from './Registration/index';

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
   * Mints one container's machinery: the registration it publishes for opening a nested container,
   * and the attach step that returns the root provider.
   *
   * @remarks
   * `attach` is called once, at build. It receives the provider the container resolves through and
   * returns the container's root user-facing provider, the one that carries this model's keeping
   * behavior into every resolution asked of it. An absent `attach` means this model keeps nothing
   * and the build mints a bare provider itself; an absent `scopeFactory` means this model opens
   * nothing.
   */
  create(): {
    attach?(inner: IServiceProvider): IServiceProvider;
    scopeFactory?: Registration<Lifetime>;
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
