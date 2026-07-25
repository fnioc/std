// Runs the greeting-workshop scenario end to end and returns the lines it
// produced, so a caller (an example app, a test) decides where they go. Nothing
// here prints, and nothing here reads a clock, the filesystem or a random
// source — the output is byte-stable, which the apps' checked-in `expected.txt`
// diff depends on.
//
// Read alongside `./infrastructure-greeting-workshop.ts`, which defines every
// type used below. The four sections mirror the four things a library author
// actually needs from the infrastructure surface:
//
//   1. a container assembled through the `configure(builder)` seam, built via
//      `IServiceProviderFactory`;
//   2. the same library against an app that OVERRODE a default;
//   3. the same library against `EmptyServiceProvider` — no container at all,
//      where the defaultable half degrades and the rest fails loudly;
//   4. `DiError`, the taxonomy root one catch covers the whole lifecycle with.
//
// The exhaustive error catalogue — every failure the container can raise, each
// one provoked on purpose — is its own chapter, and it is dialect-independent:
// `@rhombus-std/examples.lib.without-transformer`'s `demonstrateErrors`.
//
// The without-transformer sibling produces IDENTICAL lines from the manual
// dialect: `../../examples.lib.without-transformer/src/infrastructure-demo.ts`.

import { DiError, EmptyServiceProvider, RESOLVER_TOKEN } from '@rhombus-std/di';
import type { IResolver } from '@rhombus-std/di';

import { addGreetingWorkshop, GreetingWorkshop, ManifestServiceProviderFactory, newWorkshopManifest,
  WorkshopGreeting } from './infrastructure-greeting-workshop.js';

/**
 * Exercises the di.core infrastructure surface and returns the report lines.
 *
 * @returns One line per observation, in a fixed order.
 */
export function demonstrateInfrastructure(): readonly string[] {
  const lines: string[] = [
    '=== di infrastructure (library-author surface) — with transformer ===',
  ];

  // The factory is the library's/host's single point of container construction:
  // both containers below are built through it, so both get `validateOnBuild`
  // without either call site asking for it.
  const containers = new ManifestServiceProviderFactory();

  // ── 1. the configure(builder) seam ─────────────────────────────────────────
  // The consumer never sees a manifest: `useGreeting` writes into the holder
  // slot, and `addGreetingWorkshop` reads the finished chain back out.
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
  // The workshop's `tryResolve` now finds a registration and uses it instead of
  // building `PlainStationery`. Same library code, both branches.
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

  // ── 3. EmptyServiceProvider — the degenerate host ──────────────────────────
  // A shared null-object provider that holds no application services. Reach for
  // it when a provider is REQUIRED but none is meaningful: a unit test for a
  // class that only optionally consults the container, a tool that runs one
  // piece of a library outside any host, a default parameter. It beats standing
  // up an empty real container (no engine, no allocation) and it beats a bespoke
  // stub (it is the whole `IServiceProvider` surface, kept honest by di.core).
  //
  // It answers `isService` true for exactly one token — the intrinsic provider
  // itself — so a class whose only dependency is the provider still constructs.
  //
  // Held as the `IResolver` INTERFACE, not the concrete class — and that is not
  // just good manners here: the tokenless `tryResolve<T>()` form below is merged
  // onto the INTERFACE by `@rhombus-std/di.extras`, so a value typed as the
  // `EmptyServiceProvider` class would not see it.
  const nowhere: IResolver = EmptyServiceProvider.instance;
  const emptyWorkshop = new GreetingWorkshop(nowhere);

  lines.push('no container at all (EmptyServiceProvider):');
  lines.push(`  provider reports itself a service: ${nowhere.isService(RESOLVER_TOKEN)}`);
  lines.push(`  probing an ordinary token: ${nowhere.tryResolve<GreetingWorkshop>()}`);
  // Nothing is registered, so the workshop falls back to the library default —
  // which is the useful half of a null-object provider: code that degrades to
  // its defaults instead of throwing.
  lines.push(`  stationery overridden: ${emptyWorkshop.stationeryIsOverridden}`);

  // The other half: what genuinely CANNOT be defaulted still fails loudly. A
  // card needs a `GreetingCard` registration to build from, and the empty
  // provider has none — so the first `card()` call throws rather than inventing
  // one. Degrade what has a default; refuse what does not.
  try {
    lines.push(`  card: ${emptyWorkshop.card('Linus')}`);
  } catch (error) {
    if (error instanceof DiError) {
      lines.push('  card failed: the empty provider has no card registration to build from');
    } else {
      throw error;
    }
  }

  // ── 4. the taxonomy root ───────────────────────────────────────────────────
  // `DiError` is shared by di.core (registration time) and the resolution engine,
  // so ONE `instanceof DiError` catch covers a consumer's whole container
  // lifecycle. The two failures below come from opposite ends of it; the full
  // catalogue, with each error class named and caught individually, is the
  // errors chapter named in this file's header.
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

/**
 * Reports whether a caught value belongs to the di taxonomy. Deliberately does
 * NOT print the message: messages name tokens, and the two example dialects
 * spell those differently (hand-written against transformer-derived), while the
 * shapes below are identical in both.
 */
function describeDiError(error: unknown): string {
  if (error instanceof DiError) {
    return `caught a DiError (${error.name})`;
  }
  return 'not a DiError — this library would rethrow';
}
