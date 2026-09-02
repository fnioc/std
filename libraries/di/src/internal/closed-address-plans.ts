import { Control, type GetService, type IServiceProvider, type Registration, UnsatisfiableError } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { Plan } from './Plan/index.js';
import { Registry } from './Registry.js';

/**
 * The registry `next` resolves against, read once through the roster control.
 *
 * @remarks
 * At fold time, no real provider exists yet; the request sent here carries no meaningful
 * `serviceProvider` — the roster ask never reads it.
 *
 * @throws {UnsatisfiableError} when the answer is not a control — a middleware standing in the way
 * answered the roster ask itself.
 */
export function registryOf(next: GetService): Registry {
  const address = typefor<Control<Iterable<Registration<unknown>>>>();
  const answer: unknown = next({ type: address, serviceProvider: undefined as unknown as IServiceProvider });
  if (!(answer instanceof Control)) {
    throw new UnsatisfiableError(address, 'a middleware answered the roster ask with something other than a control');
  }
  return new Registry(answer.service as Iterable<Registration<unknown>>);
}

/** One closed address, planned — or the error planning it threw. */
export type PlannedAddress = { readonly address: Type; readonly plan: Plan; } | { readonly address: Type; readonly error: Error; };

/** Plans every closed address in `registry`; an address that fails to plan yields its error instead. */
export function* planClosedAddresses(registry: Registry): Generator<PlannedAddress> {
  for (const address of registry.closedAddresses) {
    try {
      yield { address, plan: Plan.from(address, registry) };
    } catch (error) {
      yield { address, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }
}
