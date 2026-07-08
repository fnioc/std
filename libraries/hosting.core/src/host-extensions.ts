// Host lifetime helpers -- ported from the reference's HostingAbstractionsHost
// extension methods. IHost is a plain interface with no concrete class in this
// abstractions package to prototype-patch, so these surface as named functions
// (the augmentation escape hatch; see diNotes) rather than fluent methods. The
// synchronous reference wrappers (Start/Run/WaitForShutdown that block a thread)
// collapse into their async forms -- JS cannot block a thread.

import type { IHost } from "./host";
import type { IHostApplicationLifetime } from "./host-application-lifetime";
import { HOST_APPLICATION_LIFETIME_TOKEN } from "./tokens";

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
 * Returns a promise that completes when shutdown is triggered via
 * `applicationStopping` (or via `cancellationToken`, which requests a stop),
 * then gracefully stops the host.
 */
export async function waitForShutdownAsync(
  host: IHost,
  cancellationToken?: AbortSignal,
): Promise<void> {
  const lifetime = host.services.resolve<IHostApplicationLifetime>(
    HOST_APPLICATION_LIFETIME_TOKEN,
  );

  const requestStop = (): void => lifetime.stopApplication();
  if (cancellationToken !== undefined) {
    if (cancellationToken.aborted) {
      requestStop();
    } else {
      cancellationToken.addEventListener("abort", requestStop, { once: true });
    }
  }

  try {
    await whenAborted(lifetime.applicationStopping);
  } finally {
    cancellationToken?.removeEventListener("abort", requestStop);
  }

  // Don't forward the cancellation token -- it may have been triggered only to
  // unblock the wait, and forwarding it would trigger an abortive shutdown.
  await host.stop();
}

/**
 * Runs an application: starts the host, waits for shutdown, then disposes the
 * host (async disposal preferred when available). Completes only once shutdown
 * is triggered.
 */
export async function runAsync(host: IHost, cancellationToken?: AbortSignal): Promise<void> {
  try {
    await host.start(cancellationToken);
    await waitForShutdownAsync(host, cancellationToken);
  } finally {
    const asyncDisposable = host as Partial<AsyncDisposable>;
    const disposeAsync = asyncDisposable[Symbol.asyncDispose];
    if (typeof disposeAsync === "function") {
      await disposeAsync.call(host);
    } else {
      host[Symbol.dispose]();
    }
  }
}

/**
 * Alias for {@link runAsync}. The reference's synchronous `Run` blocks the
 * calling thread until shutdown; JS cannot, so `run` returns the same promise
 * `runAsync` does.
 */
export function run(host: IHost, cancellationToken?: AbortSignal): Promise<void> {
  return runAsync(host, cancellationToken);
}

/**
 * Attempts to gracefully stop the host, escalating to a non-graceful stop once
 * `timeoutMs` elapses.
 */
export async function stopWithTimeout(host: IHost, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await host.stop(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
