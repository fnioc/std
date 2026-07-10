// ChangeToken.onChange -- ported from ME.Primitives.ChangeToken.
//
// ME's ChangeToken static class overloads OnChange four ways (sync/async
// consumer x with/without TState) using Interlocked-based disposal
// bookkeeping (a sentinel `IDisposable` swapped in via CompareExchange) to
// stay correct under concurrent callers. JS is single-threaded, so this port
// collapses to the one signature this repo's change-token consumers need --
// a synchronous consumer, optional typed state -- and replaces the
// sentinel/CompareExchange dance with a plain `disposed` boolean; the
// re-subscription loop itself (the load-bearing part) is otherwise mirrored
// exactly.

import type { IChangeToken } from "./IChangeToken.js";

/**
 * Produces an {@link IChangeToken}. `null`/`undefined` means "no token to
 * subscribe to right now" -- `onChange` skips registration until a
 * subsequent call returns one.
 */
export type ChangeTokenProducer = () => IChangeToken | null | undefined;

class ChangeTokenRegistration<TState> {
  #disposable: Disposable | undefined;
  #disposed = false;

  readonly #produceToken: ChangeTokenProducer;
  readonly #consumeToken: (state: TState) => void;
  readonly #state: TState;

  public constructor(produceToken: ChangeTokenProducer, consumeToken: (state: TState) => void, state: TState) {
    this.#produceToken = produceToken;
    this.#consumeToken = consumeToken;
    this.#state = state;

    this.#registerChangeTokenCallback(produceToken());
  }

  #registerChangeTokenCallback(token: IChangeToken | null | undefined): void {
    if (token == null || this.#disposed) {
      return;
    }

    const registration = token.registerChangeCallback(() => this.#onChangeTokenFired(), undefined);

    // registerChangeCallback fires synchronously when the token has already
    // changed (see the IChangeToken contract) -- that recursive fire already
    // re-registered on the NEXT token, so this registration is redundant.
    if (token.hasChanged && token.activeChangeCallbacks) {
      registration[Symbol.dispose]();
      return;
    }

    this.#setDisposable(registration);
  }

  #setDisposable(disposable: Disposable | undefined): void {
    if (this.#disposed) {
      disposable?.[Symbol.dispose]();
      return;
    }
    this.#disposable = disposable;
  }

  #onChangeTokenFired(): void {
    // Take the next token, then run the consumer, THEN register -- so a
    // change that occurs while the consumer runs is observed as a fresh
    // fire, rather than possibly being missed by registering too early.
    const token = this.#produceToken();

    try {
      this.#consumeToken(this.#state);
    } finally {
      this.#registerChangeTokenCallback(token);
    }
  }

  public [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#disposable?.[Symbol.dispose]();
    this.#disposable = undefined;
  }
}

/**
 * Propagates notifications that a change has occurred.
 */
export const ChangeToken = {
  /**
   * Registers `consumeToken` to be called whenever the token `produceToken`
   * returns changes.
   *
   * @param produceToken Produces the change token.
   * @param consumeToken Called when the token changes. The token is
   * re-registered once this returns.
   * @param state State passed through to `consumeToken`.
   * @returns A {@link Disposable} that, when disposed, unregisters the consumer.
   */
  onChange<TState = undefined>(
    produceToken: ChangeTokenProducer,
    consumeToken: (state: TState) => void,
    state?: TState,
  ): Disposable {
    return new ChangeTokenRegistration(produceToken, consumeToken, state as TState);
  },
};
