import type { IChangeToken } from '@rhombus-std/primitives';

/**
 * A source of {@link IChangeToken}s that notify when the value backing an
 * `IOptions<T>` changes. The reactive `IOptions<T>` an assembly delivers watches
 * every source registered for its options token; each fire re-runs the
 * pipeline and pushes the fresh value to subscribers.
 */
export interface IOptionsChangeTokenSource {
  /**
   * The change token to watch for the NEXT change. Called once per fire (and
   * on first subscribe): each call must hand back a token representing the
   * upcoming change window -- a stale, already-fired token fires forever (see
   * the primitives README).
   */
  getChangeToken(): IChangeToken;
}
