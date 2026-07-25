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
//   - the ROOT makes the manifest, decides how and when it becomes a provider
//     (`ManifestServiceProviderFactory`), and resolves the one top-level service.
//
// The workshop's dependencies arrive as CONSTRUCTOR PARAMETERS — an ad-hoc card
// factory and an optional stationery — so the library never holds a provider at
// all. Section 3 puts the discouraged alternative next to it, because the
// comparison is the only honest way to teach why the parameter form is the
// answer.
//
// Authored in the TOKENLESS dialect: every `resolve<T>()` below is lowered by
// the Go/ttsc engine into exactly the explicit-token call the twin
// (`../../examples.app.without-transformer/src/infrastructure-demo.ts`)
// hand-writes. Diff the two and the difference is the dialect and nothing else —
// the lines they print are identical apart from the header.
//
// Nothing here reads a clock, the filesystem or a random source: the output is
// byte-stable, which the app's checked-in `expected.txt` diff depends on.

import { ServiceManifest } from '@rhombus-std/di';
import type { IServiceManifest } from '@rhombus-std/di';
import { describeDiError, ManifestServiceProviderFactory } from '@rhombus-std/examples.app.shared';
import { addGreetingWorkshop, demonstrateNullProvider, GreetingWorkshop, LocatorGreetingWorkshop,
  WorkshopGreeting } from '@rhombus-std/examples.lib.with-transformer';

/** A fresh, empty manifest for one of this chapter's own containers. */
function newWorkshopManifest(): IServiceManifest<'singleton'> {
  return new ServiceManifest<'singleton'>();
}

/**
 * Exercises the di.core infrastructure surface and returns the report lines.
 *
 * @returns One line per observation, in a fixed order.
 */
export function demonstrateInfrastructure(): readonly string[] {
  const lines: string[] = [
    '=== di infrastructure (library-author surface) — with transformer ===',
  ];

  // The factory is this root's single point of container construction: every
  // container below is built through it, so all of them get the same build
  // options and the same open root scope without any call site asking.
  const containers = new ManifestServiceProviderFactory();

  // ── 1. the configure(builder) seam ─────────────────────────────────────────
  // The consumer never sees a manifest: `useGreeting` writes into the holder
  // slot, and `addGreetingWorkshop` reads the finished chain back out. Note who
  // does what — the root supplies the empty manifest, the library fills it.
  const defaults = addGreetingWorkshop(newWorkshopManifest(), (workshop) => {
    workshop.useGreeting(WorkshopGreeting);
  });
  const defaultProvider = containers.createServiceProvider(containers.createBuilder(defaults));
  // Tokenless lookup: the token is derived from `GreetingWorkshop` — the same
  // type `addGreetingWorkshop` registered it under — so the two agree without
  // either side naming a string.
  const defaultWorkshop = defaultProvider.resolve<GreetingWorkshop>();

  lines.push('app registered no stationery:');
  lines.push(`  stationery overridden: ${defaultWorkshop.stationeryIsOverridden}`);
  lines.push(`  card: ${defaultWorkshop.card('Ada')}`);

  // ── 2. the same library, with the app overriding a default ─────────────────
  // The workshop's optional stationery slot now has a registration behind it, so
  // the container fills the parameter instead of leaving it undefined. Same
  // library code, both branches.
  const customised = addGreetingWorkshop(newWorkshopManifest(), (workshop) => {
    workshop
      .useGreeting(WorkshopGreeting)
      .useStationery({ border: '***' });
  });
  const customProvider = containers.createServiceProvider(containers.createBuilder(customised));
  const customWorkshop = customProvider.resolve<GreetingWorkshop>();

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
  const locatorWorkshop = defaultProvider.resolve<LocatorGreetingWorkshop>();

  lines.push('the same card, two ways to reach its dependencies:');
  lines.push(`  parameters (GreetingWorkshop): ${defaultWorkshop.card('Linus')}`);
  lines.push(`  injected provider (LocatorGreetingWorkshop): ${locatorWorkshop.card('Linus')}`);

  // ── 4. no container at all ─────────────────────────────────────────────────
  // Straight from the library, because it needs no container to run — which is
  // the whole point of a null-object provider, and makes it the most genuinely
  // library-shaped thing in this chapter.
  lines.push(...demonstrateNullProvider());

  // ── 5. the taxonomy root ───────────────────────────────────────────────────
  // `DiError` is shared by di.core (registration time) and the resolution engine,
  // so ONE `instanceof DiError` catch covers a consumer's whole container
  // lifecycle. The two failures below come from opposite ends of it; the full
  // catalogue, with each error class named and caught individually, is the
  // dialect-independent errors chapter.
  //
  // Registration time: an OPEN template names a FAMILY of tokens, one per
  // closing, so only a class can stand behind it — `addValue` has a single
  // already-built instance and no way to produce one per closing. Written with
  // an explicit token because an open template is exactly the thing a type
  // argument cannot spell.
  try {
    newWorkshopManifest().addValue('@rhombus-std/examples.contracts:IGreeting<$1>', new WorkshopGreeting());
  } catch (error) {
    lines.push(`registering a value at an open template: ${describeDiError(error)}`);
  }

  // Resolution time: an unregistered token. `resolve` throws (against
  // `tryResolve`'s `undefined`), and the throw is the same `DiError` family.
  try {
    defaultProvider.resolve('@rhombus-std/examples.contracts:IHealthCheck');
  } catch (error) {
    lines.push(`resolving an unregistered token: ${describeDiError(error)}`);
  }

  return lines;
}
