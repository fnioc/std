import type { IChangeToken } from '@rhombus-std/primitives';

/**
 * A source of {@link IChangeToken}s that notify when the value backing an
 * `IOptions<TOptions>` changes. The reactive `IOptions<TOptions>` an assembly
 * delivers watches every source registered for its options type; each fire
 * re-runs the pipeline and pushes the fresh value to subscribers.
 *
 * @typeParam TOptions The options type the source reloads — it selects which
 * type's pipeline the registration joins, and nothing more.
 */
export interface IOptionsChangeTokenSource<TOptions = unknown> {
  /**
   * The change token to watch for the NEXT change. Called once per fire (and
   * on first subscribe): each call must hand back a token representing the
   * upcoming change window -- a stale, already-fired token fires forever (see
   * the primitives README).
   */
  getChangeToken(): IChangeToken;
}
