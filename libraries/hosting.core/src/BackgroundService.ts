import { AbortController, type AbortSignal } from "@rhombus-std/primitives";
import type { IHostedService } from "./IHostedService";

/** Aborts `target` whenever `source` aborts (or immediately, if already aborted). */
function propagateAbort(source: AbortSignal, target: AbortController): void {
  if (source.aborted) {
    target.abort(source.reason);
    return;
  }
  source.addEventListener("abort", () => target.abort(source.reason), { once: true });
}

/** A promise that settles when `signal` aborts (or immediately, if already aborted). */
function whenAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

/**
 * Base class for implementing a long-running {@link IHostedService}.
 *
 * Mirrors the reference `BackgroundService`: {@link start} kicks {@link execute}
 * WITHOUT awaiting, retaining the promise so {@link stop} can await it; a
 * per-instance {@link AbortController} carries the stopping signal, aborted by
 * {@link stop} (graceful) and {@link Symbol.dispose} (unconditional).
 */
export abstract class BackgroundService implements IHostedService, Disposable {
  #executeTask?: Promise<void>;
  #stoppingController?: AbortController;

  /**
   * The promise that executes the background operation. `undefined` until the
   * background operation has started.
   */
  public get executeTask(): Promise<void> | undefined {
    return this.#executeTask;
  }

  /**
   * Called when the service starts. The returned promise represents the
   * lifetime of the long-running operation.
   *
   * @param stoppingSignal Triggered when {@link stop} is called.
   */
  protected abstract execute(stoppingSignal: AbortSignal): Promise<void>;

  /**
   * Triggered when the application host is ready to start the service. Kicks
   * {@link execute} without awaiting and returns immediately; any result from
   * {@link execute} is observed by {@link stop}.
   *
   * @param abortSignal Aborting it also aborts the executing operation.
   */
  public start(abortSignal: AbortSignal): Promise<void> {
    const controller = new AbortController();
    this.#stoppingController = controller;
    propagateAbort(abortSignal, controller);

    // Kick execute() without awaiting; retain the promise so stop() can await it.
    // Deferred through Promise.resolve() so a synchronous throw surfaces as a
    // rejection on the retained promise rather than escaping start().
    this.#executeTask = Promise.resolve().then(() => this.execute(controller.signal));

    return Promise.resolve();
  }

  /**
   * Triggered when the application host is performing a graceful shutdown.
   * Signals cancellation to {@link execute} and waits until it completes or the
   * stop signal triggers, whichever comes first.
   *
   * @param abortSignal Indicates when the stop should no longer be graceful.
   */
  public async stop(abortSignal: AbortSignal): Promise<void> {
    if (this.#executeTask === undefined) {
      return;
    }
    try {
      this.#stoppingController?.abort();
    } finally {
      // Suppress a throw from the executing task -- cancelling it may reject; the
      // host explicitly ignores that here (mirrors ConfigureAwaitOptions.SuppressThrowing).
      await Promise.race([
        this.#executeTask.catch(() => undefined),
        whenAborted(abortSignal),
      ]);
    }
  }

  /** Unconditionally aborts the executing operation. */
  public [Symbol.dispose](): void {
    this.#stoppingController?.abort();
  }
}
