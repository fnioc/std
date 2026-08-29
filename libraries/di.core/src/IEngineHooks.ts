import type { Behavior } from './Behavior.js';

/**
 * The one control the engine answers for hook access: install and uninstall what runs over every
 * resolution the container answers.
 */
export interface IEngineHooks {
  /**
   * Installs `hooks` immediately, over every resolution the container answers from this point on;
   * disposing the answer uninstalls exactly this install and no other.
   *
   * @remarks
   * Later installs stand nearer the resolution: of everything installed and not yet disposed, the
   * most recently installed runs innermost, closest to the construction, and the container's own
   * built-in installs stand outermost, first. Call-site placement is what scopes an install —
   * held for the container's life, or bracketed in a `using` block — nothing here distinguishes
   * the two. Disposing an install a second time does nothing.
   */
  useHooks<State = unknown>(hooks: Behavior<State>): Disposable;
}
