// NullChangeToken -- ported from
// ME.FileProviders.NullChangeToken.
//
// ME keeps its OWN NullChangeToken inside FileProviders.Abstractions (distinct
// from any change-token type in ME.Primitives), so it is mirrored here in
// fileproviders.core rather than pulled from @rhombus-std/primitives. It
// implements the @rhombus-std/primitives IChangeToken contract: an empty token
// that never raises callbacks. ME's `EmptyDisposable` singleton maps to an
// inline no-op `Disposable`.

import type { IChangeToken } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

const NO_OP_DISPOSABLE: Disposable = { [Symbol.dispose]() {} };

/**
 * An empty {@link IChangeToken} that doesn't raise any change callbacks.
 */
export class NullChangeToken implements IChangeToken {
  /**
   * The singleton instance of {@link NullChangeToken}.
   */
  public static readonly singleton: NullChangeToken = new NullChangeToken();

  private constructor() {}

  /**
   * A value that's always `false`.
   */
  public readonly hasChanged = false;

  /**
   * A value that's always `false`.
   */
  public readonly activeChangeCallbacks = false;

  /**
   * Always returns an empty disposable. Callbacks are never invoked.
   *
   * @param _callback This parameter is ignored.
   * @param _state This parameter is ignored.
   * @returns A {@link Disposable} that no-ops on dispose.
   */
  public registerChangeCallback(_callback: Func<[unknown], void>, _state?: unknown): Disposable {
    return NO_OP_DISPOSABLE;
  }
}
