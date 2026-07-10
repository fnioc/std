// IChangeToken -- ported from ME.Primitives.IChangeToken.
//
// `IDisposable` maps to the built-in `Disposable` (Symbol.dispose), the
// TS/ESNext analog -- `tsconfig.base.json` already includes lib
// "ESNext.Disposable" for every package in this monorepo.

import type { Func } from "@rhombus-toolkit/func";

/**
 * Propagates notifications that a change has occurred.
 */
export interface IChangeToken {
  /**
   * A value that indicates if a change has occurred.
   */
  readonly hasChanged: boolean;

  /**
   * A value that indicates whether this token will proactively raise
   * callbacks. If `false`, the token consumer must poll {@link hasChanged}
   * to detect changes.
   *
   * A `true` value does not guarantee that callbacks will be raised for all
   * changes. Consumers should also check {@link hasChanged} when complete
   * accuracy is required.
   */
  readonly activeChangeCallbacks: boolean;

  /**
   * Registers a callback that will be invoked when the token has changed.
   * {@link hasChanged} MUST be set before the callback is invoked.
   *
   * @param callback The callback to invoke.
   * @param state State to be passed into the callback.
   * @returns A {@link Disposable} that is used to unregister the callback.
   */
  registerChangeCallback(callback: Func<[state: unknown], void>, state?: unknown): Disposable;
}
