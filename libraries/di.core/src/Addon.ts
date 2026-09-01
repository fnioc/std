import type { Middleware } from './Middleware.js';
import type { Registration } from './Registration/index.js';

/**
 * One addon a builder installs: the registrations it files and the middleware it composes into
 * the container's one chain.
 *
 * @typeParam Lifetime - the lifetime vocabulary this addon's registrations name values from.
 */
export interface Addon<Lifetime> {
  /** Registrations filed beneath the user's own, above the lifetime model's floor; the lifetime each carries is the model's to read at runtime. */
  readonly registrations: Iterable<Registration<Lifetime>>;

  /**
   * Middleware the builder composes into the container's one chain, alongside every other addon's,
   * in call order.
   *
   * @remarks
   * Composes once, at build — see {@link Middleware}'s own remarks for what that means. An addon
   * that only needs install-time work does that work directly here and returns `next` unchanged.
   */
  readonly middleware: Middleware;
}
