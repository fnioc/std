// THE LIBRARY'S FRONT DOOR — and the shape every library in this repo is meant
// to have.
//
// A library CONTRIBUTES REGISTRATIONS. It does not own a container: it never
// constructs a manifest, never calls `build()`, never opens a scope and never
// resolves. It exports ONE function that takes the application's manifest and
// hands back the manifest with this library's services added; the application —
// the only thing that knows what it is composing — does the rest.
//
// That split is not a style choice, it is what the package boundary is FOR. This
// library depends on `@rhombus-std/di.core` (the abstractions: the manifest, the
// tokens, the slot grammar) and NOT on `@rhombus-std/di` (the resolution
// engine), and every file in the package holds to that. A library that reached
// for the engine would take the choice of container away from its consumer, and
// would fork the container the moment the app built its own. `add*` is the seam
// that keeps the choice where it belongs.
//
// Authored in the MANUAL dialect: explicit, hand-composed Types and plain-data
// dependency signatures, no transformer. The tokenless dialect takes the same
// shape (see `addWithTransformerExamples` in
// @rhombus-std/examples.lib.with-transformer); what is different here is that
// nothing has to be lowered for it to run, so the raw source is already usable.
// This is the manual dialect's producer half of the interop matrix.

import type { Manifest } from '@rhombus-std/di.core';

import { CasualGreeting } from './casual-greeting.js';
import { HealthCheck } from './health-check.js';
import { GREETING_TYPE, HEALTH_CHECK_TYPE } from './types.js';

/**
 * Registers this library's services into `services`, returning the manifest
 * with those registrations added. The manifest is immutable, so the caller must
 * thread the return value back in
 * (`services = addWithoutTransformerExamples(services)`) — the passed-in
 * `services` is left untouched.
 *
 * The name is derived mechanically from the package name, which is the point of
 * the `add<PackageName>` convention: a consumer who knows the package knows the
 * call without reading anything.
 *
 * The scope union is generic so ANY application union works, and the manifest
 * that comes back is the caller's OWN type rather than a widened one — the
 * threading assignment would not otherwise typecheck, since `build()`'s provider
 * carries the scope union covariantly. `| 'singleton'` states the one scope this
 * library actually registers at, so an app whose union lacks it still composes.
 *
 * @param services The application's registration builder.
 */
export function addWithoutTransformerExamples<S extends string>(
  services: Manifest<S | 'singleton'>,
): Manifest<S | 'singleton'> {
  // Contributes a greeting to the shared IGreeting collection at the hand-written
  // Type — the same one the with-transformer side derives. Zero-dep ctor, so the
  // signature list is empty.
  services = services.addClass(GREETING_TYPE, CasualGreeting, [[]], 'singleton');
  // The optional health check — present only because this library was wired in.
  services = services.addClass(HEALTH_CHECK_TYPE, HealthCheck, [[]], 'singleton');
  return services;
}
