import type { Type } from '@rhombus-std/primitives';
import { Plan } from './Plan/index.js';
import type { PlanHooks } from './Plan/InstalledHooks.js';
import type { Registry } from './Registry.js';

/** One closed address, planned — or the error planning it threw. */
export type PlannedAddress = { readonly address: Type; readonly plan: Plan; } | { readonly address: Type; readonly error: Error; };

/** Plans every closed address in `registry`; an address that fails to plan yields its error instead. */
export function* planClosedAddresses(registry: Registry, hooks?: PlanHooks): Generator<PlannedAddress> {
  for (const address of registry.closedAddresses) {
    try {
      yield { address, plan: Plan.from(address, registry, hooks) };
    } catch (error) {
      yield { address, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }
}
