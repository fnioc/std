import { AbortController, type AbortSignal, type AugmentationSet, clearTimeout, neverSignal, registerAugmentations,
  setTimeout } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { IHost } from './IHost';
import type { IHostApplicationLifetime } from './IHostApplicationLifetime';
import { HOST_APPLICATION_LIFETIME_TOKEN } from './tokens';

declare module './IHost' {
  interface IHost {
    run(abortSignal?: AbortSignal): Promise<void>;
    runAsync(abortSignal?: AbortSignal): Promise<void>;
    waitForShutdownAsync(abortSignal?: AbortSignal): Promise<void>;
    stopWithTimeout(timeoutMs: number): Promise<void>;
  }
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
export const HostingAbstractionsHostExtensions = {
  /** Alias for {@link runAsync} — there is no separate synchronous entry point in JS. */
  run(host: IHost, abortSignal?: AbortSignal): Promise<void> {
    return HostingAbstractionsHostExtensions.runAsync(host, abortSignal);
  },

  /**
   * Runs an application: starts the host, waits for shutdown, then disposes the
   * host (async disposal preferred when available). Completes only once shutdown
   * is triggered.
   */
  async runAsync(host: IHost, abortSignal?: AbortSignal): Promise<void> {
    try {
      await host.start(abortSignal);
      await HostingAbstractionsHostExtensions.waitForShutdownAsync(host, abortSignal);
    } finally {
      const asyncDisposable = host as Partial<AsyncDisposable>;
      const disposeAsync = asyncDisposable[Symbol.asyncDispose];
      if (typeof disposeAsync === 'function') {
        await disposeAsync.call(host);
      } else {
        host[Symbol.dispose]();
      }
    }
  },

  /**
   * Returns a promise that completes when shutdown is triggered via
   * `applicationStopping` (or via `abortSignal`, which requests a stop),
   * then gracefully stops the host.
   */
  async waitForShutdownAsync(host: IHost, abortSignal?: AbortSignal): Promise<void> {
    const lifetime = host.services.resolve<IHostApplicationLifetime>(HOST_APPLICATION_LIFETIME_TOKEN);

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
    await host.stop(neverSignal);
  },

  /**
   * Attempts to gracefully stop the host, escalating to a non-graceful stop once
   * `timeoutMs` elapses.
   */
  async stopWithTimeout(host: IHost, timeoutMs: number): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await host.stop(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  },
} satisfies AugmentationSet<IHost>;

registerAugmentations(tokenfor<IHost>(), HostingAbstractionsHostExtensions);
