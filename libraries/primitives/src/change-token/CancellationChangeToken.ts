import type { Func } from '@rhombus-toolkit/func';

import type { AbortSignal } from '../platform/abort.js';
import type { IChangeToken } from './IChangeToken.js';

/**
 * An {@link IChangeToken} implementation backed by an `AbortSignal`.
 */
export class CancellationChangeToken implements IChangeToken {
  readonly activeChangeCallbacks = true;

  readonly #signal: AbortSignal;

  public constructor(signal: AbortSignal) {
    this.#signal = signal;
  }

  public get hasChanged(): boolean {
    return this.#signal.aborted;
  }

  /**
   * @inheritdoc
   *
   * Per the {@link IChangeToken.registerChangeCallback} contract,
   * `hasChanged` MUST be set before the callback is invoked -- so if the
   * signal is already aborted, `callback` runs synchronously rather than
   * being wired to an `"abort"` event that has already fired.
   */
  public registerChangeCallback(callback: Func<[state: unknown], void>, state?: unknown): Disposable {
    if (this.#signal.aborted) {
      callback(state);
      return { [Symbol.dispose]() {} };
    }

    const listener = () => callback(state);
    this.#signal.addEventListener('abort', listener, { once: true });
    return { [Symbol.dispose]: () => this.#signal.removeEventListener('abort', listener) };
  }
}
