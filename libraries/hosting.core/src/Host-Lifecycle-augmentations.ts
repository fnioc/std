import { AbortController, type AbortSignal, type AugmentationSet2, clearTimeout, neverSignal,
  setTimeout } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { IHost } from './IHost';
import { HOST_APPLICATION_LIFETIME_TYPE } from './types';

type IHostLifecycleAugmentations = {
  /** Alias for {@link runAsync} — there is no separate synchronous entry point in JS. */
  run(abortSignal?: AbortSignal): Promise<void>;
  /**
   * Runs an application: starts the host, waits for shutdown, then disposes the
   * host (async disposal preferred when available). Completes only once shutdown
   * is triggered.
   */
  runAsync(abortSignal?: AbortSignal): Promise<void>;
  /**
   * Returns a promise that completes when shutdown is triggered via
   * `applicationStopping` (or via `abortSignal`, which requests a stop),
   * then gracefully stops the host.
   */
  waitForShutdownAsync(abortSignal?: AbortSignal): Promise<void>;
  /**
   * Attempts to gracefully stop the host, escalating to a non-graceful stop once
   * `timeoutMs` elapses.
   */
  stopWithTimeout(timeoutMs: number): Promise<void>;
};

declare module '@rhombus-std/hosting.core' {
  interface IHost extends IHostLifecycleAugmentations {}
}

/** A promise that settles when `signal` aborts (or immediately, if already aborted). */
function whenAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

/** Augmentation set for {@link IHost}; each member is also directly callable. */
export const HostLifecycleAugmentations: AugmentationSet2<IHost, IHostLifecycleAugmentations> = {
  run(abortSignal) {
    return HostLifecycleAugmentations.runAsync.call(this, abortSignal);
  },

  async runAsync(abortSignal) {
    try {
      await this.start(abortSignal);
      await HostLifecycleAugmentations.waitForShutdownAsync.call(this, abortSignal);
    } finally {
      const asyncDisposable = this as Partial<AsyncDisposable>;
      const disposeAsync = asyncDisposable[Symbol.asyncDispose];
      if (typeof disposeAsync === 'function') {
        await disposeAsync.call(this);
      } else {
        this[Symbol.dispose]();
      }
    }
  },

  async waitForShutdownAsync(abortSignal) {
    const lifetime = this.services.getRequiredService(HOST_APPLICATION_LIFETIME_TYPE);

    const requestStop = (): void => lifetime.stopApplication();
    if (abortSignal !== undefined) {
      if (abortSignal.aborted) {
        requestStop();
      } else {
        abortSignal.addEventListener('abort', requestStop, { once: true });
      }
    }

    try {
      await whenAborted(lifetime.applicationStopping);
    } finally {
      abortSignal?.removeEventListener('abort', requestStop);
    }

    // Don't forward the abort signal -- it may have been triggered only to
    // unblock the wait, and forwarding it would trigger an abortive shutdown.
    await this.stop(neverSignal);
  },

  async stopWithTimeout(timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await this.stop(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  },
};

registerAugmentations<IHost>(HostLifecycleAugmentations);
