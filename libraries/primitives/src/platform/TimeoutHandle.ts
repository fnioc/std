// Owned timer typings (like ./abort.ts): typed `setTimeout`/`clearTimeout`
// re-exports off `globalThis`, so libraries schedule timeouts without an ambient
// platform type. `TimeoutHandle` is opaque (`unknown`) — the platform handle
// type differs (a number in browsers, an object under node) and only ever
// round-trips through our own `clearTimeout`.

import type { Func } from '@rhombus-toolkit/func';

export type TimeoutHandle = unknown;

interface SetTimeoutLike {
  (callback: Func<[], void>, delayMs?: number): TimeoutHandle;
}
interface ClearTimeoutLike {
  (handle: TimeoutHandle): void;
}

/** The platform `setTimeout`, re-typed with an opaque handle. */
export const setTimeout: SetTimeoutLike = (globalThis as unknown as { setTimeout: SetTimeoutLike; }).setTimeout;

/** The platform `clearTimeout`, accepting {@link TimeoutHandle}. */
export const clearTimeout: ClearTimeoutLike = (globalThis as unknown as { clearTimeout: ClearTimeoutLike; }).clearTimeout;
