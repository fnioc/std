import type { Middleware } from './Middleware.js';
import type { Registration } from './Registration/index.js';

/**
 * One addon a builder installs.
 *
 * @remarks
 * The addon itself is the reusable handle — a plain object or an instance carrying whatever state
 * it was constructed with. Everything one container needs of its own is minted by {@link create},
 * which the builder calls once per installation, so installing the same addon on two builders
 * shares nothing between the two containers.
 *
 * @typeParam Lifetime - the lifetime vocabulary this addon's registrations name values from.
 */
export interface Addon<Lifetime> {
  /** Opens one installation of this addon. */
  create(): AddonInstallation<Lifetime>;
}

/**
 * What one installation of an addon contributes: the registrations it files and the middleware it
 * composes into the container's one chain.
 *
 * @typeParam Lifetime - the lifetime vocabulary this installation's registrations name values from.
 */
export interface AddonInstallation<Lifetime> {
  /** Registrations filed beneath the user's own, above the lifetime model's floor; the lifetime each carries is the model's to read at runtime. */
  readonly registrations: Iterable<Registration<Lifetime>>;

  /**
   * Middleware the builder composes into the container's one chain, alongside every other
   * installation's, in call order.
   *
   * @remarks
   * Composes once, at build — see {@link Middleware}'s own remarks for what that means. An
   * installation that only needs install-time work does that work directly here and returns `next`
   * unchanged.
   */
  readonly middleware: Middleware;
}
