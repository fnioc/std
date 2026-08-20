// Type-only: puts di.extras' declare-module sugar faces in the program with
// no runtime import of the authoring package.
import type {} from '@rhombus-std/di.extras';

import { AbortController, type AbortSignal, clearTimeout, neverSignal, setTimeout } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import type { IHost } from './IHost';
import type { IHostApplicationLifetime } from './IHostApplicationLifetime';

/** A promise that settles when `signal` aborts (or immediately, if already aborted). */
function whenAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

export namespace HostLifecycleAugmentations {
  /** Alias for {@link runAsync} — there is no separate synchronous entry point in JS. */
  export function run(this: IHost, abortSignal?: AbortSignal): Promise<void> {
    return HostLifecycleAugmentations.runAsync.call(this, abortSignal);
  }

  /**
   * Runs an application: starts the host, waits for shutdown, then disposes the
   * host (async disposal preferred when available). Completes only once shutdown
   * is triggered.
   */
  export async function runAsync(this: IHost, abortSignal?: AbortSignal): Promise<void> {
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
  }

  /**
   * Returns a promise that completes when shutdown is triggered via
   * `applicationStopping` (or via `abortSignal`, which requests a stop),
   * then gracefully stops the host.
   */
  export async function waitForShutdownAsync(this: IHost, abortSignal?: AbortSignal): Promise<void> {
    const lifetime = this.services.getRequiredService<IHostApplicationLifetime>();

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
  }

  /**
   * Attempts to gracefully stop the host, escalating to a non-graceful stop once
   * `timeoutMs` elapses.
   */
  export async function stopWithTimeout(this: IHost, timeoutMs: number): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await this.stop(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }
}

declare module '@rhombus-std/hosting.core' {
  interface IHost extends Flatten<typeof HostLifecycleAugmentations> {}
}

registerAugmentations<IHost>(HostLifecycleAugmentations);
