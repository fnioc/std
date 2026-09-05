import type { Func } from '@rhombus-toolkit/types';

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

/**
 * Produces an {@link IChangeToken}. `null`/`undefined` means "no token to
 * subscribe to right now" -- registration is skipped until a subsequent call
 * returns one.
 */
export type ChangeTokenProducer = Func<[], IChangeToken | null | undefined>;

/**
 * A change-token consumer. Returning a thenable opts into the async consumer
 * contract: the token is only re-registered once the returned promise settles.
 *
 * A union of the sync and async function shapes rather than one signature
 * returning `void | PromiseLike<void>`: TS's "anything is assignable to a void
 * return" rule only applies to a bare `void` return type, so the union keeps
 * terse sync consumers like `() => count++` assignable.
 */
export type ChangeTokenConsumer<TState> = Func<[state: TState], void> | Func<[state: TState], PromiseLike<void>>;
