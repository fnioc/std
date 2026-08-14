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
// respect: there the Types and the dependency signatures are composed by hand,
// here they are derived from the type arguments and lowered during this
// package's build. Nothing else about the shape changes — which is the point of
// the no-transformer-first rule, and the reason both apps can call either
// library.
//
// Registering this library's own classes is this library's business rather than
// an app's — an application wiring another package's internals is the same rule
// violation read backwards. What a consumer still needs in order to RESOLVE is
// the Type agreement, and `./types.ts` publishes that.

import { Type } from '@rhombus-std/di.core';
import type { Manifest } from '@rhombus-std/di.core';
import type { GreetingPolicy, IBanner, IGreeting, IHealthCheck, IServerReport,
  ServerOptions } from '@rhombus-std/examples.contracts';
import type { IOptions } from '@rhombus-std/options';
// The type-driven MINT primitive, and the whole of what this dialect is:
// `typefor<T>()` becomes the service type a hand author writes out. It has no
// runtime footprint — the build folds every call and elides this import with
// them — so what survives into the shipped output is exactly what the manual
// sibling wrote by hand.
import { typefor } from '@rhombus-std/primitives.extras';

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
  services: Manifest<S | 'singleton'>,
): Manifest<S | 'singleton'> {
  // The greeting, registered against the CONTRACT interface rather than the
  // class: `typefor<IGreeting>()` derives the service type from
  // `IGreeting` — the same string the manual library writes out — so both
  // libraries' greetings land on one element type and a consumer asking for the
  // collection gets both.
  services = services.addClass(typefor<IGreeting>(), FormalGreeting, Type.ctor(typefor<IGreeting>(), [[]]),
    'singleton');

  // The banner, registered ONLY in its `Promise<…>` wrapper. Registering the
  // honest promise (rather than pretending an async fetch is a synchronous value)
  // is what makes an awaited resolution work and a plain one fail loudly — the
  // container never silently hands back an unsettled value.
  services = services.addFactory(typefor<Promise<IBanner>>(), fetchBanner, Type.func(typefor<Promise<IBanner>>(), [[]]),
    'singleton');

  // The report factory, and the densest argument list anywhere in these examples:
  // a collection, two closed generics and an optional union. Every one is named
  // by its TYPE rather than by a string — read it against `./server-report.ts`'s
  // parameter list and the two line up one for one.
  services = services.addFactory(typefor<IServerReport>(), makeServerReport,
    Type.func(typefor<IServerReport>(), [[typefor<IGreeting[]>(), typefor<IOptions<ServerOptions>>(),
      typefor<IOptions<GreetingPolicy>>(), Type.union(typefor<IHealthCheck>(), Type.typeLiteral(undefined))]]),
    'singleton');

  return services;
}
