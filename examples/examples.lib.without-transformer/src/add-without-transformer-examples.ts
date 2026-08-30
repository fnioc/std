// THE LIBRARY'S FRONT DOOR — and the shape every library in this repo is meant
// to have.
//
// A library CONTRIBUTES REGISTRATIONS. It does not own a container: it never
// calls `build()`, never opens a scope and never resolves. It exports ONE
// function that builds its own self-contained manifest and hands it back; the
// application — the only thing that knows what it is composing — merges it into
// its own and does the rest.
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

import { Manifest } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';

import { CasualGreeting } from './casual-greeting.js';
import { HealthCheck } from './health-check.js';
import { GREETING_TYPE, HEALTH_CHECK_TYPE } from './types.js';

/**
 * Builds this library's services as its own manifest, on the narrowest lifetime
 * vocabulary it needs — `'singleton'`, the one lifetime both registrations use.
 * A caller merges the result into their own manifest
 * (`services = services.add(addWithoutTransformerExamples())`).
 *
 * The name is derived mechanically from the package name, which is the point of
 * the `add<PackageName>` convention: a consumer who knows the package knows the
 * call without reading anything.
 */
export function addWithoutTransformerExamples(): Manifest<'singleton'> {
  let services = Manifest.empty<'singleton'>();
  // Contributes a greeting to the shared IGreeting collection at the hand-written
  // Type — the same one the with-transformer side derives. Zero-dep ctor, so the
  // composed constructor type carries no argument types beyond the address.
  services = services.add(GREETING_TYPE, CasualGreeting, Type.ctor(GREETING_TYPE, [[]]), 'singleton');
  // The optional health check — present only because this library was wired in.
  services = services.add(HEALTH_CHECK_TYPE, HealthCheck, Type.ctor(HEALTH_CHECK_TYPE, [[]]), 'singleton');
  return services;
}
