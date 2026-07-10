// CancellationChangeToken -- ported from
// ME.Primitives.CancellationChangeToken.
//
// ME backs this with a CancellationToken; there is no such type in TS, so
// this is backed by the idiomatic web-platform equivalent, `AbortSignal`,
// instead -- `hasChanged` mirrors `Token.IsCancellationRequested` as
// `signal.aborted`, and `registerChangeCallback` wires an `"abort"`
// listener. Unlike `CancellationToken.None`, a plain `AbortSignal` always
// supports listeners, so `activeChangeCallbacks` is unconditionally `true`
// (ME's variant that flips it to `false` only handles a token that can never
// be canceled, which has no analog here).

import type { Func } from "@rhombus-toolkit/func";

import type { AbortSignal, IChangeToken } from "./index.js";

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
    this.#signal.addEventListener("abort", listener, { once: true });
    return {
      [Symbol.dispose]: () => this.#signal.removeEventListener("abort", listener),
    };
  }
}
