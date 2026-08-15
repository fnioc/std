import { ChangeTokenRegistration } from './ChangeTokenRegistration.js';
import type { ChangeTokenConsumer, ChangeTokenProducer } from './IChangeToken.js';

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
  onChange<TState = undefined>(produceToken: ChangeTokenProducer, consumeToken: ChangeTokenConsumer<TState>,
    state?: TState): Disposable {
    return new ChangeTokenRegistration(produceToken, consumeToken, state as TState);
  },
};
