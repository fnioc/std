// The library's contribution to a consuming application's container, authored in
// the MANUAL dialect: explicit string tokens and plain-data dependency
// signatures, no transformer. Because these forms need no lowering, they compose
// into a reusable registration FUNCTION the app calls with its own manifest —
// the shape the tokenless dialect cannot take (registration lowering is confined
// to a module's top level). This is the manual dialect's producer half of the
// interop matrix.

import type { ServiceManifest } from "@rhombus-std/di";

import { CasualGreeting } from "./casual-greeting.js";
import { HealthCheck } from "./health-check.js";
import { GREETING_TOKEN, HEALTH_CHECK_TOKEN } from "./tokens.js";

/**
 * Registers this library's services into `services`. `Scopes` is left open
 * (`string`) so any application scope union satisfies it.
 *
 * @param services The application's registration builder.
 */
export function addCasualServices(services: ServiceManifest<string>): void {
  // Contributes a greeting to the shared IGreeting collection at the hand-written
  // token — the same one the with-transformer side derives. Zero-dep ctor, so the
  // signature list is empty.
  services.add(GREETING_TOKEN, CasualGreeting, [[]]).as("singleton");
  // The optional health check — present only because this library was wired in.
  services.add(HEALTH_CHECK_TOKEN, HealthCheck, [[]]).as("singleton");
}
