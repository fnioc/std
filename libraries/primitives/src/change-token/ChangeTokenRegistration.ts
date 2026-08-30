import { isThenable } from '../toolkit/is-thenable.js';
import type { ChangeTokenConsumer, ChangeTokenProducer, IChangeToken } from './IChangeToken.js';

/**
 * One live subscription: holds the consumer against whatever token the producer
 * currently hands back, and re-registers onto the next token after each fire.
 * Disposing it ends the subscription for good.
 */
export class ChangeTokenRegistration<TState> {
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
      // Re-register before rethrowing, so a synchronous throw doesn't drop the subscription.
      this.#registerChangeTokenCallback(token);
      throw error;
    }

    if (isThenable(result)) {
      // Async completion: re-register only once the consumer's promise settles.
      // A rejection can't reach the trigger code without blocking, so it is left
      // unobserved -- a consumer that needs its async failures seen must handle
      // them itself.
      void this.#awaitConsumerThenRegisterCallback(result, token);
    } else {
      this.#registerChangeTokenCallback(token);
    }
  }

  async #awaitConsumerThenRegisterCallback(consumerResult: PromiseLike<void>, token: IChangeToken | null | undefined): Promise<void> {
    try {
      await consumerResult;
    } catch {
      // Unobserved by design -- see #onChangeTokenFired.
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
