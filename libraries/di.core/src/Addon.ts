import type { Middleware } from './Middleware.js';
import type { Registration } from './Registration/index.js';

/** What one addon contributes to the container being built. */
export interface AddonInstallation {
  /** Registrations filed beneath the user's own, above the lifetime model's floor; the lifetime each carries is the model's to read at runtime. */
  readonly registrations?: Iterable<Registration<any>>;

  /**
   * Middleware the builder composes into the container's one chain, alongside every other addon's
   * and `use()`'s own, in call order.
   *
   * @remarks
   * Composes once, at build — see {@link Middleware}'s own remarks for what that means. An addon
   * that only needs install-time work does that work directly here and returns `next` unchanged.
   */
  readonly middleware?: Middleware;
}

/** An addon a container builder installs beside the lifetime model. */
export interface Addon {
  /** Mints this addon's contribution to one container; called once per build. */
  create(): AddonInstallation;
}
