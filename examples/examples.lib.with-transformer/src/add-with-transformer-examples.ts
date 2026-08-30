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

import { Manifest } from '@rhombus-std/di.core';
import type { IBanner, IGreeting, IServerReport } from '@rhombus-std/examples.contracts';
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
 * Builds this library's services as its own manifest, on the narrowest lifetime
 * vocabulary it needs — `'singleton'`, the one lifetime all three registrations
 * use. A caller merges the result into their own manifest
 * (`services = services.add(addWithTransformerExamples())`).
 *
 * The name is derived mechanically from the package name, which is the point of
 * the `add<PackageName>` convention: a consumer who knows the package knows the
 * call without reading anything.
 */
export function addWithTransformerExamples(): Manifest<'singleton'> {
  let services = Manifest.empty<'singleton'>();
  // The greeting, registered against the CONTRACT interface rather than the
  // class: `typefor<IGreeting>()` derives the service type from
  // `IGreeting` — the same string the manual library writes out — so both
  // libraries' greetings land on one element type and a consumer asking for the
  // collection gets both.
  services = services.add(typefor<IGreeting>(), FormalGreeting, typefor(FormalGreeting), 'singleton');

  // The banner, registered ONLY in its `Promise<…>` wrapper. Registering the
  // honest promise (rather than pretending an async fetch is a synchronous value)
  // is what makes an awaited resolution work and a plain one fail loudly — the
  // container never silently hands back an unsettled value.
  services = services.add(typefor<Promise<IBanner>>(), fetchBanner, typefor(fetchBanner), 'singleton');

  // The report factory, and the densest argument list anywhere in these examples:
  // a collection, two closed generics and an optional union. Observing the
  // function reads all four straight off its declaration — read it against
  // `./server-report.ts`'s parameter list and the two line up one for one.
  services = services.add(typefor<IServerReport>(), makeServerReport, typefor(makeServerReport), 'singleton');

  return services;
}
