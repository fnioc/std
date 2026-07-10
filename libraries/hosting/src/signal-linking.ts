// AbortSignal composition helpers for the host runtime.
//
// The reference links a caller's `CancellationToken` with the host's
// `ApplicationStopping` token (and an optional timeout) into one linked source
// via `CancellationTokenSource.CreateLinkedTokenSource`. `linkSignals` is the
// TS analog: an `AbortController` that aborts as soon as any source aborts, or
// once `timeoutMs` elapses. `dispose` detaches the listeners and clears the
// timer.

import { AbortController, clearTimeout, setTimeout } from "@rhombus-std/primitives";
import type { AbortSignal } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";

/** A linked {@link AbortSignal} plus the teardown for its wiring. */
export interface LinkedSignal extends Disposable {
  /** Aborts when any linked source aborts, or when the timeout elapses. */
  readonly signal: AbortSignal;
}

/**
 * Composes `sources` (and an optional finite `timeoutMs`) into one linked
 * {@link AbortSignal}. Aborts immediately if a source is already aborted.
 */
export function linkSignals(sources: readonly AbortSignal[], timeoutMs?: number): LinkedSignal {
  const controller = new AbortController();
  const cleanups: Func<[], void>[] = [];

  const abort = (reason?: unknown): void => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  for (const source of sources) {
    if (source.aborted) {
      abort(source.reason);
      break;
    }
    const onAbort = (): void => abort(source.reason);
    source.addEventListener("abort", onAbort, { once: true });
    cleanups.push(() => source.removeEventListener("abort", onAbort));
  }

  if (timeoutMs !== undefined && Number.isFinite(timeoutMs)) {
    const timer = setTimeout(() => abort(new Error("A host lifecycle timeout elapsed.")), timeoutMs);
    cleanups.push(() => clearTimeout(timer));
  }

  return {
    signal: controller.signal,
    [Symbol.dispose](): void {
      for (const cleanup of cleanups) {
        cleanup();
      }
    },
  };
}

/** A promise that settles when `signal` aborts (or immediately, if already aborted). */
export function whenAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
