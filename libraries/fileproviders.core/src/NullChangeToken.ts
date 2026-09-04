import type { IChangeToken } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/types';

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

  public readonly hasChanged = false;

  public readonly activeChangeCallbacks = false;

  /**
   * The callback is never invoked; the returned {@link Disposable} no-ops.
   */
  public registerChangeCallback(_callback: Func<[unknown], void>, _state?: unknown): Disposable {
    return NO_OP_DISPOSABLE;
  }
}
