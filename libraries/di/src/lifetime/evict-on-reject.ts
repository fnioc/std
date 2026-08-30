import type { Func } from '@rhombus-toolkit/func';
import { isPromiseLike } from '@rhombus-toolkit/type-guards';

/**
 * Runs `drop` if `kept` turns out to be a rejected promise, leaving anything else alone.
 *
 * @remarks
 * A failed make is not an answer: dropping what was kept lets the next ask try again, while
 * everyone already holding it still sees that one rejection. Attaching the handler also marks the
 * rejection handled, so a promise nobody ends up awaiting stays quiet.
 */
export function evictOnReject(kept: unknown, drop: Func<[], void>): void {
  if (isPromiseLike(kept)) {
    kept.then(undefined, drop);
  }
}
