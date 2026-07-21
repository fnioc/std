// The library's contribution to a consuming application's container, authored in
// the MANUAL dialect: explicit string tokens and plain-data dependency
// signatures, no transformer. Because these forms need no lowering, they compose
// into a reusable registration FUNCTION the app calls with its own manifest —
// the shape the tokenless dialect cannot take (registration lowering is confined
// to a module's top level). This is the manual dialect's producer half of the
// interop matrix.

import type { IServiceManifest } from '@rhombus-std/di';

import { CasualGreeting } from './casual-greeting.js';
import { HealthCheck } from './health-check.js';
import { GREETING_TOKEN, HEALTH_CHECK_TOKEN } from './tokens.js';

/**
 * Registers this library's services into `services`, returning the manifest
 * with those registrations added. The manifest is immutable, so the caller
 * must thread the return value back in (`services = addCasualServices(services)`)
 * — the passed-in `services` is left untouched.
 *
 * The scope union is generic so ANY application union works, and the manifest
 * that comes back is the caller's OWN type rather than a widened one — the
 * threading assignment would not otherwise typecheck, since `build()`'s provider
 * carries the scope union covariantly. `| 'singleton'` states the one scope this
 * library actually registers at, so an app whose union lacks it still composes.
 *
 * @param services The application's registration builder.
 */
export function addCasualServices<S extends string>(
  services: IServiceManifest<S | 'singleton'>,
): IServiceManifest<S | 'singleton'> {
  // Contributes a greeting to the shared IGreeting collection at the hand-written
  // token — the same one the with-transformer side derives. Zero-dep ctor, so the
  // signature list is empty.
  services = services.add(GREETING_TOKEN, CasualGreeting, [[]], 'singleton');
  // The optional health check — present only because this library was wired in.
  services = services.add(HEALTH_CHECK_TOKEN, HealthCheck, [[]], 'singleton');
  return services;
}
