// Host lifetime helpers -- ported from the reference's
// `HostingAbstractionsHostExtensions` static augmentation class. Authored as one
// named object literal per ME class (docs §28), `satisfies AugmentationSet<IHost>`.
//
// OPEN receiver (docs §38): `IHost` is extended across packages, so this const
// registers into the primitives augmentation registry under
// the `IHost` token (beside the interface-side `declare module`
// merge below, per rule 0.6). The concrete `Host` class -- downstream in
// `@rhombus-std/hosting` -- is decorated with `@augment(nameof<IHost>())`,
// which pulls this bag onto its prototype; the class-side merge stays downstream
// next to that class. The members here are also the standalone call surface.
//
// The synchronous reference wrappers (Start/Run/WaitForShutdown that block a
// thread) collapse into their async forms -- JS cannot block a thread.

import type { AugmentationSet } from "@rhombus-std/primitives";
import { AbortController, clearTimeout, registerAugmentations, setTimeout } from "@rhombus-std/primitives";
import type { AbortSignal } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { IHost } from "./IHost";
import type { IHostApplicationLifetime } from "./IHostApplicationLifetime";
import { HOST_APPLICATION_LIFETIME_TOKEN } from "./tokens";

// The interface-side merge for the `IHost` augmentation members lives HERE,
// beside the const that registers them (rule 0.6): a `hosting.core`-only consumer
// holding `IHost` sees the method form. The runtime install onto the concrete
// `Host` (and its class-side merge so the class still SATISFIES `IHost`) live
// downstream in `@rhombus-std/hosting`.
declare module "./IHost" {
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
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

/**
 * The `HostingAbstractionsHostExtensions` augmentation set for {@link IHost}
 * (docs §28). Registered into the augmentation registry under
 * the `IHost` token; the concrete `Host` downstream pulls it via
 * `@augment`. The members here are also the standalone call surface.
 */
export const HostingAbstractionsHostExtensions = {
  /**
   * Alias for {@link runAsync}. The reference's synchronous `Run` blocks the
   * calling thread until shutdown; JS cannot, so `run` returns the same promise
   * `runAsync` does.
   */
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
      if (typeof disposeAsync === "function") {
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
  async waitForShutdownAsync(
    host: IHost,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const lifetime = host.services.resolve<IHostApplicationLifetime>(
      HOST_APPLICATION_LIFETIME_TOKEN,
    );

    const requestStop = (): void => lifetime.stopApplication();
    if (abortSignal !== undefined) {
      if (abortSignal.aborted) {
        requestStop();
      } else {
        abortSignal.addEventListener("abort", requestStop, { once: true });
      }
    }

    try {
      await whenAborted(lifetime.applicationStopping);
    } finally {
      abortSignal?.removeEventListener("abort", requestStop);
    }

    // Don't forward the abort signal -- it may have been triggered only to
    // unblock the wait, and forwarding it would trigger an abortive shutdown.
    await host.stop();
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

registerAugmentations(nameof<IHost>(), HostingAbstractionsHostExtensions);
