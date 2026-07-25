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
// Authored in the TOKENLESS dialect, and behaviourally identical to the manual
// sibling (`addWithoutTransformerExamples` in
// `@rhombus-std/examples.lib.without-transformer`). The two differ in exactly one
// respect: there the tokens and the dependency signatures are written out, here
// they are derived from the type arguments and lowered during this package's
// build. Nothing else about the shape changes — which is the point of the
// no-transformer-first rule, and the reason both apps can call either library.
//
// Registrations used to live in the APPS: both `main.ts` files hand-registered
// these three services themselves, and the manual one had to hand-guess this
// package's derived token strings to do it. That was the same rule violation
// read backwards — an application wiring another package's classes. Now the
// token agreement is this library's own business, and `./tokens.ts` publishes
// the two strings a manual consumer still needs in order to RESOLVE.

import type { IServiceManifest } from '@rhombus-std/di.core';
import type { IBanner, IGreeting, IServerReport } from '@rhombus-std/examples.contracts';

import { fetchBanner } from './fetch-banner.js';
import { FormalGreeting } from './formal-greeting.js';
import { makeServerReport } from './server-report.js';

/**
 * Registers this library's services into `services`, returning the manifest with
 * those registrations added. The manifest is immutable, so the caller must thread
 * the return value back in (`services = addWithTransformerExamples(services)`) —
 * the passed-in `services` is left untouched.
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
export function addWithTransformerExamples<S extends string>(
  services: IServiceManifest<S | 'singleton'>,
): IServiceManifest<S | 'singleton'> {
  // The greeting, registered against the CONTRACT interface rather than the
  // class: `addClass<IGreeting>(FormalGreeting)` derives the token from `IGreeting`
  // — the same string the manual library writes out — so both libraries' greetings
  // land on one element token and a consumer asking for the collection gets both.
  services = services.addClass<IGreeting>(FormalGreeting).as<'singleton'>();

  // The banner, registered ONLY in its `Promise<…>` wrapper. Registering the
  // honest promise (rather than pretending an async fetch is a synchronous value)
  // is what makes `resolveAsync<IBanner>()` work and a plain `resolve<IBanner>()`
  // fail loudly — the container never silently hands back an unsettled value.
  services = services.addFactory<Promise<IBanner>>(fetchBanner).as<'singleton'>();

  // The report factory. Its four dependency slots are DERIVED from the function's
  // parameter types — a collection, two closed generics and an optional union —
  // which is the single densest piece of boilerplate the sugar removes anywhere
  // in these examples. Compare `./server-report.ts`'s parameter list with what the
  // manual dialect has to spell out slot by slot.
  services = services.addFactory<IServerReport>(makeServerReport).as<'singleton'>();

  return services;
}
