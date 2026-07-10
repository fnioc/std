// Owned timer typings -- the §39 recipe (see ./abort.ts) for
// `setTimeout`/`clearTimeout`: typed value re-exports off `globalThis`, so
// library programs never need an ambient platform type to schedule a timeout.
//
// `TimeoutHandle` is deliberately opaque (`unknown`): the platform return type
// differs (number in browsers, a Timeout object under node), and handles only
// ever round-trip through our own `clearTimeout`.

import type { Func } from "@rhombus-toolkit/func";

export type TimeoutHandle = unknown;

interface SetTimeoutLike {
  (callback: Func<[], void>, delayMs?: number): TimeoutHandle;
}
interface ClearTimeoutLike {
  (handle: TimeoutHandle): void;
}

/** The platform `setTimeout`, re-typed with an opaque handle. */
export const setTimeout: SetTimeoutLike = (globalThis as unknown as { setTimeout: SetTimeoutLike }).setTimeout;

/** The platform `clearTimeout`, accepting {@link TimeoutHandle}. */
export const clearTimeout: ClearTimeoutLike =
  (globalThis as unknown as { clearTimeout: ClearTimeoutLike }).clearTimeout;
