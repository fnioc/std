// CompositeChangeToken -- ported from ME.Primitives.CompositeChangeToken.
//
// ME backs the composite's one-shot latch with a CancellationTokenSource;
// this port uses the platform analog, `AbortController`, and reuses
// `CancellationChangeToken` for the callback registrations on it (the
// analog of `_cancellationTokenSource.Token.Register`). The reference's
// lock-based double-checked initialization collapses to a plain lazy check
// (JS is single-threaded), and its `try { Cancel() } catch {}` guard has no
// analog here -- `AbortController.abort()` never rethrows listener
// errors (EventTarget dispatch isolates them).

import type { Func } from '@rhombus-toolkit/func';

import { AbortController } from './abort.js';
import { CancellationChangeToken } from './CancellationChangeToken.js';
import type { IChangeToken } from './IChangeToken.js';

/**
 * An {@link IChangeToken} that represents one or more {@link IChangeToken}
 * instances.
 *
 * Callbacks are only propagated from inner tokens whose
 * {@link IChangeToken.activeChangeCallbacks} is `true`. Changes in other
 * inner tokens are detected only when {@link hasChanged} is polled.
 */
export class CompositeChangeToken implements IChangeToken {
  /**
   * The list of {@link IChangeToken} that compose the current
   * {@link CompositeChangeToken}.
   */
  public readonly changeTokens: readonly IChangeToken[];

  /**
   * `true` if at least one of the {@link changeTokens} has active change
   * callbacks; otherwise, `false`.
   */
  public readonly activeChangeCallbacks: boolean;

  #abortController: AbortController | undefined;
  #latchToken: CancellationChangeToken | undefined;
  #registrations: Disposable[] | undefined;

  /**
   * Creates a new instance of {@link CompositeChangeToken}.
   *
   * @param changeTokens The list of {@link IChangeToken} to compose.
   */
  public constructor(changeTokens: readonly IChangeToken[]) {
    this.changeTokens = changeTokens;
    this.activeChangeCallbacks = changeTokens.some((token) => token.activeChangeCallbacks);
  }

  public get hasChanged(): boolean {
    if (this.#abortController?.signal.aborted) {
      return true;
    }

    for (const token of this.changeTokens) {
      if (token.hasChanged) {
        // Fire the composite's latch so registered callbacks observe a
        // poll-detected change too (no-op when nothing is registered yet).
        this.#onChange();
        return true;
      }
    }

    return false;
  }

  /** @inheritdoc */
  public registerChangeCallback(callback: Func<[state: unknown], void>, state?: unknown): Disposable {
    this.#ensureCallbacksInitialized();
    return this.#latchToken!.registerChangeCallback(callback, state);
  }

  #ensureCallbacksInitialized(): void {
    if (this.#abortController) {
      return;
    }

    const abortController = new AbortController();
    this.#abortController = abortController;
    this.#latchToken = new CancellationChangeToken(abortController.signal);
    this.#registrations = [];
    for (const token of this.changeTokens) {
      if (token.activeChangeCallbacks) {
        const registration = token.registerChangeCallback(() => this.#onChange(), undefined);
        // Registering on an inner token that has already changed invokes the
        // callback synchronously (per the IChangeToken contract) -- the latch
        // has fired, so stop registering and drop the redundant registration.
        if (abortController.signal.aborted) {
          registration[Symbol.dispose]();
          break;
        }
        this.#registrations.push(registration);
      }
    }
  }

  #onChange(): void {
    // No callbacks were ever registered -- hasChanged polling alone doesn't
    // need the latch, and there are no inner registrations to release.
    if (!this.#abortController) {
      return;
    }
    if (this.#abortController.signal.aborted) {
      return;
    }

    this.#abortController.abort();

    for (const registration of this.#registrations ?? []) {
      registration[Symbol.dispose]();
    }
  }
}
