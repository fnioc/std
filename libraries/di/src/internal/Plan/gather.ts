import { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/types';
import type { AsyncPlan } from './Plan.js';

/**
 * Settles every one of a boundary's descendants together — the one point a resolution waits — and
 * answers what each settled on, read back by entry identity.
 *
 * @param address - the boundary's own address, named in the failure.
 * @throws {AggregateError} when any entry fails, carrying each distinct reason once.
 */
export async function gather(
  descendants: readonly AsyncPlan[],
  address: Type,
  open: Func<[AsyncPlan], unknown>,
): Promise<ReadonlyMap<AsyncPlan, unknown>> {
  const outcomes = await Promise.allSettled(descendants.map(async entry => open(entry)));
  const reasons = new Set(
    outcomes.filter(outcome => outcome.status === 'rejected').map(outcome => outcome.reason),
  );
  if (reasons.size > 0) {
    throw new AggregateError(
      [...reasons],
      `cannot deliver ${address} — ${reasons.size} of the dependencies it awaits failed`,
    );
  }
  return new Map(descendants.map((entry, at) => [entry, (outcomes[at] as PromiseFulfilledResult<unknown>).value]));
}

/** Runs `run` in the caller's own tick, its outcome — value or throw — delivered as a promise. */
export async function start<T>(run: Func<[], T>): Promise<T> {
  return run();
}
