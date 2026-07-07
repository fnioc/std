// OptionsChangeTokenSource -- ported from MEO's IOptionsChangeTokenSource<T>
// (the `I` prefix dropped, and the name parameter dropped: named options are
// distinct registrations here, so a source is tied to the one options
// registration it was added for -- see docs/decisions.md §4.2).

import type { IChangeToken } from "@rhombus-std/primitives";

/**
 * A source of {@link IChangeToken}s that notify when the value backing an
 * `Options<T>` changes. The reactive `Options<T>` an assembly delivers watches
 * every source registered for its options token; each fire re-runs the
 * pipeline and pushes the fresh value to subscribers.
 */
export interface OptionsChangeTokenSource {
  /**
   * The change token to watch for the NEXT change. Called once per fire (and
   * on first subscribe): each call must hand back a token representing the
   * upcoming change window -- a stale, already-fired token fires forever (see
   * the primitives README).
   */
  getChangeToken(): IChangeToken;
}
