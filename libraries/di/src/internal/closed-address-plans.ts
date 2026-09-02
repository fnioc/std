import type { GetService, Registration } from '@rhombus-std/di.core';
import { Control } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { askForControl } from './control-recognition.js';
import { Plan } from './Plan/index.js';
import { Registry } from './Registry.js';

/** The registry `next` resolves against, read once through the manifest control. */
export function registryOf(next: GetService): Registry {
  const registrations = askForControl<Iterable<Registration<unknown>>>(next, typefor<Control<Iterable<Registration<unknown>>>>());
  return new Registry(registrations);
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
