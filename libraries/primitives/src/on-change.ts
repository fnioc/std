// ChangeToken.onChange -- ported from ME.Primitives.ChangeToken.
//
// ME's ChangeToken static class overloads OnChange four ways (sync/async
// consumer x with/without TState) using Interlocked-based disposal
// bookkeeping (a sentinel `IDisposable` swapped in via CompareExchange) to
// stay correct under concurrent callers. JS is single-threaded, so this port
// collapses to ONE signature -- a consumer returning `void` (sync) or a
// thenable (async), optional typed state; a thenable result gets the async
// overloads' semantics (re-register only once it settles), detected at
// runtime -- and replaces the sentinel/CompareExchange dance with a plain
// `disposed` boolean. The re-subscription loop itself (the load-bearing
// part) is otherwise mirrored exactly.

import type { Func } from "@rhombus-toolkit/func";

import type { IChangeToken } from "./IChangeToken.js";

/**
 * Produces an {@link IChangeToken}. `null`/`undefined` means "no token to
 * subscribe to right now" -- `onChange` skips registration until a
 * subsequent call returns one.
 */
export type ChangeTokenProducer = Func<[], IChangeToken | null | undefined>;

/**
 * A change-token consumer. Returning a thenable opts into the async
 * consumer contract: the token is only re-registered once the returned
 * promise settles (see {@link ChangeToken.onChange}).
 *
 * A union of the sync and async function shapes rather than one signature
 * returning `void | PromiseLike<void>`: TS's "anything is assignable to a
 * void return" rule only applies to a bare `void` return type, so the union
 * keeps terse sync consumers like `() => count++` assignable.
 */
export type ChangeTokenConsumer<TState> =
  | Func<[state: TState], void>
  | Func<[state: TState], PromiseLike<void>>;

function isThenable(value: void | PromiseLike<void>): value is PromiseLike<void> {
  return typeof (value as PromiseLike<void> | undefined)?.then === "function";
}

class ChangeTokenRegistration<TState> {
  #disposable: Disposable | undefined;
  #disposed = false;

  readonly #produceToken: ChangeTokenProducer;
  readonly #consumeToken: ChangeTokenConsumer<TState>;
  readonly #state: TState;

  public constructor(produceToken: ChangeTokenProducer, consumeToken: ChangeTokenConsumer<TState>, state: TState) {
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

    let result: void | PromiseLike<void>;
    try {
      // The consumer is invoked synchronously, so synchronous throws (from
      // sync AND async consumers alike) propagate to the code that triggers
      // the change token.
      result = this.#consumeToken(this.#state);
    } catch (error) {
      // We always want to ensure the callback is registered, even when the
      // consumer throws synchronously.
      this.#registerChangeTokenCallback(token);
      throw error;
    }

    if (isThenable(result)) {
      // Async completion: only re-register once the consumer's promise
      // settles. Rejections can't be propagated to the trigger code without
      // blocking, so they are left unobserved -- swallowed after the
      // re-registration, mirroring the reference's default treatment of
      // unobserved failures. A consumer that needs its async failures seen
      // must handle them itself.
      void this.#awaitConsumerThenRegisterCallback(result, token);
    } else {
      this.#registerChangeTokenCallback(token);
    }
  }

  async #awaitConsumerThenRegisterCallback(
    consumerResult: PromiseLike<void>,
    token: IChangeToken | null | undefined,
  ): Promise<void> {
    try {
      await consumerResult;
    } catch {
      // Unobserved by design -- see #onChangeTokenFired.
    } finally {
      // We always want to ensure the callback is registered.
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
   * A consumer may be synchronous or asynchronous. When it returns a
   * thenable, the token is only re-registered once the returned promise
   * settles; synchronous throws (from either kind of consumer) propagate to
   * the code that triggers the change token, while rejections of the
   * returned promise are left unobserved -- a consumer that needs its async
   * failures seen must handle them itself.
   *
   * @param produceToken Produces the change token.
   * @param consumeToken Called when the token changes. The token is
   * re-registered once this returns (or, for an async consumer, once the
   * returned promise settles).
   * @param state State passed through to `consumeToken`.
   * @returns A {@link Disposable} that, when disposed, unregisters the consumer.
   */
  onChange<TState = undefined>(
    produceToken: ChangeTokenProducer,
    consumeToken: ChangeTokenConsumer<TState>,
    state?: TState,
  ): Disposable {
    return new ChangeTokenRegistration(produceToken, consumeToken, state as TState);
  },
};
