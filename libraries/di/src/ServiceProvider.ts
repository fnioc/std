import { type GetService, type IServiceProvider, ServiceRequest } from '@rhombus-std/di.core';
import { augment, type Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

export interface ServiceProvider extends IServiceProvider {}

/**
 * The user-facing provider every container is minted with: one held call, forwarded on every ask.
 * Allocates a {@link ServiceRequest} per call, putting itself on it so the ask resolves back to
 * the provider that opened it.
 */
@augment(typefor<IServiceProvider>())
export class ServiceProvider implements IServiceProvider {
  readonly #getService: GetService;
  #subscribers: Array<Disposable & AsyncDisposable> | undefined;
  #disposed = false;

  constructor(source: GetService) {
    this.#getService = source;
  }

  getService(address: Type): any {
    return this.#getService(new ServiceRequest(address, this));
  }

  /**
   * Tells `subscriber` when THIS provider disposes: the form the holder disposed through is the
   * form invoked on the subscriber, once, most recent subscription first.
   *
   * @remarks
   * The seam disposal reaches an addon by — disposal never flows through {@link getService}, so
   * nothing on the resolution chain can observe it. A subscription made after the provider
   * disposed is never told.
   */
  whenDisposed(subscriber: Disposable & AsyncDisposable): void {
    (this.#subscribers ??= []).push(subscriber);
  }

  [Symbol.dispose](): void {
    const subscribers = this.#closing();
    if (subscribers === undefined) {
      return;
    }
    for (let i = subscribers.length - 1; i >= 0; i--) {
      subscribers[i]![Symbol.dispose]();
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const subscribers = this.#closing();
    if (subscribers === undefined) {
      return;
    }
    for (let i = subscribers.length - 1; i >= 0; i--) {
      await subscribers[i]![Symbol.asyncDispose]();
    }
  }

  /** The subscribers to tell, exactly once: `undefined` on a repeat disposal, whatever the forms, or when nobody subscribed. */
  #closing(): ReadonlyArray<Disposable & AsyncDisposable> | undefined {
    if (this.#disposed) {
      return undefined;
    }
    this.#disposed = true;
    return this.#subscribers;
  }
}
