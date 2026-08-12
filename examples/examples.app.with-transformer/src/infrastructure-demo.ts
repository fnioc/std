// THE LIBRARY-AUTHOR INFRASTRUCTURE SURFACE, driven from the composition root.
//
// The library is `@rhombus-std/examples.lib.with-transformer`'s greeting
// workshop: a small package a consuming application configures and then asks for
// a rendered greeting card. Everything the LIBRARY does lives over there, and it
// does all of it against `@rhombus-std/di.core` alone. What is left for this file
// is the composition-root half, and the split is the lesson:
//
//   - the library is HANDED a manifest and registers into it
//     (`addGreetingWorkshop`), and offers the caller a fluent `configure(builder)`
//     callback while doing so;
//   - the ROOT makes the manifest, decides when it becomes a provider
//     (`build()`), and resolves the one top-level service.
//
// The workshop's dependencies arrive as CONSTRUCTOR PARAMETERS — an ad-hoc card
// factory and an optional stationery — so the library never holds a provider at
// all. Section 3 puts the discouraged alternative next to it, because the
// comparison is the only honest way to teach why the parameter form is the
// answer.
//
// Authored in the TYPE-DRIVEN dialect: the workshop's own lookup is derived from
// the very class the library registered, so registration and lookup cannot drift.
// The without-transformer app's `./infrastructure-demo.ts` is the line-for-line
// twin and prints the same lines apart from the header — diff them to see exactly
// what the transformer removes.
//
// Nothing here reads a clock, the filesystem or a random source: the output is
// byte-stable, which the app's checked-in `expected.txt` diff depends on.

import { DefaultManifest, Type } from '@rhombus-std/di.core';
import type { Manifest } from '@rhombus-std/di.core';
import '@rhombus-std/di';
import type { IGreeting, IHealthCheck } from '@rhombus-std/examples.contracts';
import { typefor } from '@rhombus-std/primitives.extras';
// `describeDiError` is the LIBRARY's — classifying what a container threw needs
// di.core and nothing more. Building the container is this root's, because that
// is the one thing the engine is for.
import { addGreetingWorkshop, GreetingWorkshop, LocatorGreetingWorkshop,
  WorkshopGreeting } from '@rhombus-std/examples.lib.with-transformer';
import { describeDiError } from '@rhombus-std/examples.lib.without-transformer';

/** A fresh, empty manifest for one of this chapter's own containers. */
function newWorkshopManifest(): Manifest<'singleton'> {
  return new DefaultManifest<'singleton'>();
}

/**
 * Runs `attempt` and reports what came back, so a member that is declared but
 * has no behaviour yet leaves a line rather than ending the chapter.
 */
function attempted(attempt: () => string): string {
  try {
    return attempt();
  } catch (error) {
    return `${(error as Error).name} — declared, no behaviour yet`;
  }
}

/**
 * Exercises the di.core infrastructure surface and returns the report lines.
 *
 * @returns One line per observation, in a fixed order.
 */
export function demonstrateInfrastructure(): readonly string[] {
  const lines: string[] = ['=== di infrastructure (library-author surface) — with transformer ==='];

  // ── 1. the configure(builder) seam ─────────────────────────────────────────
  // The consumer never sees a manifest: `useGreeting` writes into the holder
  // slot, and `addGreetingWorkshop` reads the finished chain back out. Note who
  // does what — the root supplies the empty manifest, the library fills it.
  const defaults = addGreetingWorkshop(newWorkshopManifest(), (workshop) => {
    workshop.useGreeting(WorkshopGreeting);
  });
  const defaultProvider = defaults.build();
  const defaultWorkshop = defaultProvider.getRequiredService(typefor<GreetingWorkshop>()) as GreetingWorkshop;

  lines.push('app registered no stationery:');
  lines.push(`  stationery overridden: ${defaultWorkshop.stationeryIsOverridden}`);
  lines.push(`  card: ${defaultWorkshop.card('Ada')}`);

  // ── 2. the same library, with the app overriding a default ─────────────────
  // The workshop's optional stationery slot now has a registration behind it, so
  // the container fills the parameter instead of leaving it undefined. Same
  // library code, both branches.
  const customised = addGreetingWorkshop(newWorkshopManifest(), (workshop) => {
    workshop.useGreeting(WorkshopGreeting).useStationery({ border: '***' });
  });
  const customWorkshop = customised.build().getRequiredService(typefor<GreetingWorkshop>()) as GreetingWorkshop;

  lines.push('app registered its own stationery:');
  lines.push(`  stationery overridden: ${customWorkshop.stationeryIsOverridden}`);
  lines.push(`  card: ${customWorkshop.card('Grace')}`);

  // ── 3. the same card, two ways to get the dependencies ─────────────────────
  //
  // Both classes are registered in the container from section 1 and both render
  // the identical card, which is the point: the OUTPUT never tells you which
  // shape a class chose, so the choice has to be made on other grounds.
  //
  //   `GreetingWorkshop`         takes `(mintCard, stationery?)`. Its constructor
  //                              is the whole truth about what it needs. A test
  //                              passes two plain values; a missing registration
  //                              is a startup failure; and the ad-hoc factory
  //                              slot is how it gets a card per recipient without
  //                              ever holding the container.
  //   `LocatorGreetingWorkshop`  takes the provider and looks the same two things
  //                              up itself. Its constructor says it needs
  //                              "everything". A test has to stand up a
  //                              container; a missing registration surfaces on
  //                              some later call; and nothing at the call site
  //                              hints at either dependency.
  //
  // The honest test for whether an injected provider is legitimate: could this
  // have been an ordinary constructor parameter? Here it could — twice — so the
  // twin below is the WRONG answer, kept only so the right one has something to
  // be compared against. (The resolution chapter has the other case, where a key
  // is not known until a request arrives and no parameter can express it.)
  const locatorWorkshop = defaultProvider.getRequiredService(
    typefor<LocatorGreetingWorkshop>(),
  ) as LocatorGreetingWorkshop;

  // Which is also where the two shapes stop being interchangeable in practice.
  // The parameter form asked for its card factory in a constructor slot and
  // already holds it; the locator asks the provider for one at the moment it
  // renders, so the identical card costs one extra lookup on every call the
  // parameter form paid for exactly once.
  lines.push('the same card, two ways to reach its dependencies:');
  lines.push(`  parameters (GreetingWorkshop): ${defaultWorkshop.card('Linus')}`);
  lines.push(`  injected provider (LocatorGreetingWorkshop): ${attempted(() => locatorWorkshop.card('Linus'))}`);

  // ── 4. absence, and the taxonomy root ──────────────────────────────────────
  // `DiError` is shared by di.core and the resolution engine, so ONE
  // `instanceof DiError` catch covers a consumer's whole container lifecycle.
  // The full catalogue, with each error class named and caught individually, is
  // the dialect-independent errors chapter; what belongs here is the pair of
  // answers a library gets when something is simply not registered.
  //
  // The optional lookup treats absence as an answer, so nothing is thrown at all
  // and there is nothing to classify.
  const missing = defaultProvider.getService(typefor<IHealthCheck>());
  lines.push(`asking optionally for an unregistered type: ${missing}`);

  // The eager whole-graph pass is where an unsatisfiable registration turns into
  // something the taxonomy names.
  try {
    newWorkshopManifest()
      .addClass(typefor<IHealthCheck>(), GreetingWorkshop, [[typefor<IGreeting>()]], 'singleton')
      .build({ validateOnBuild: true });
  } catch (error) {
    lines.push(`building a graph with a hole in it: ${describeDiError(error)}`);
  }

  return lines;
}
