import type { Type } from '@rhombus-std/primitives';
import { Plan } from './Plan/index.js';
import type { PlanHooks } from './Plan/InstalledHooks.js';
import type { Registry } from './Registry.js';

/** One registration of a closed address, planned — or the error planning it threw. */
export type PlannedAddress = { readonly address: Type; readonly plan: Plan; } | { readonly address: Type; readonly error: Error; };

/**
 * Plans every registration of every closed address in `registry`, newest first; a registration
 * that fails to plan yields its error instead.
 *
 * @remarks
 * A shadowed registration is planned too: a collection ask walks it, so a fault the newest
 * registration of its address does not share is still a fault the manifest carries.
 */
export function* planClosedAddresses(registry: Registry, hooks?: PlanHooks): Generator<PlannedAddress> {
  for (const address of registry.closedAddresses) {
    yield planned(address, () => Plan.from(address, registry, hooks));
    for (const shadowed of registry.getMatches(address).drop(1)) {
      yield planned(address, () => Plan.fromShadowed(address, registry, shadowed.index, hooks));
    }
  }
}

/** What `make` built for `address`, or the error it threw. */
function planned(address: Type, make: () => Plan): PlannedAddress {
  try {
    return { address, plan: make() };
  } catch (error) {
    return { address, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
