// The half of the infrastructure chapter that genuinely belongs to a LIBRARY —
// the half that needs no container at all.
//
// The rest of the chapter (building two providers through an
// `IServiceProviderFactory`, resolving the workshop out of each, provoking a
// resolution-time failure) is composition-root work: it constructs manifests and
// builds providers, so it lives in the example applications, in each app's own
// `src/infrastructure-demo.ts`. What is left here is the piece that could never
// have moved — a demonstration whose entire point is that there is no container —
// plus the error-classification helper the app chapter shares.
//
// That split is not an accident of tidying. It is the same rule the whole package
// follows, applied to a demo: a library contributes and classifies, an application
// constructs and resolves. The chapter still reads as one thing at the app,
// because the app calls back into this function at the right moment.
//
// Nothing here prints, and nothing here reads a clock, the filesystem or a random
// source — the output is byte-stable, which the apps' checked-in `expected.txt`
// diff depends on.
//
// The without-transformer sibling produces IDENTICAL lines from the manual
// dialect: `../../examples.lib.without-transformer/src/infrastructure-demo.ts`.

import { DiError, EmptyServiceProvider, RESOLVER_TOKEN } from '@rhombus-std/di.core';
import type { IResolver } from '@rhombus-std/di.core';

import { GreetingWorkshop, LocatorGreetingWorkshop } from './infrastructure-greeting-workshop.js';

/**
 * `EmptyServiceProvider` — the degenerate host, exercised with no container in
 * sight.
 *
 * It is a shared null-object provider that holds no application services. Reach
 * for it when a provider is REQUIRED but none is meaningful: a unit test for a
 * class that only optionally consults the container, a tool that runs one piece
 * of a library outside any host, a default parameter. It beats standing up an
 * empty real container (no engine, no allocation) and it beats a bespoke stub (it
 * is the whole `IServiceProvider` surface, kept honest by di.core).
 *
 * It answers `isService` true for exactly one token — the intrinsic provider
 * itself — so a class whose only dependency is the provider still constructs.
 * That is what makes it the natural partner for
 * {@link LocatorGreetingWorkshop}: the discouraged shape is the only one that
 * CAN be built here, since the good shape asks for a card factory nothing can
 * supply.
 *
 * The two halves of a null object are both on show. What has a default DEGRADES:
 * the stationery lookup misses and the library falls back to its own. What has no
 * default REFUSES: a card needs a `GreetingCard` registration to build from, and
 * the first `card()` call throws rather than inventing one.
 *
 * @returns One line per observation, in a fixed order.
 */
export function demonstrateNullProvider(): readonly string[] {
  // Held as the `IResolver` INTERFACE, not the concrete class — and that is not
  // just good manners here: the tokenless `tryResolve<T>()` form below is merged
  // onto the INTERFACE by `@rhombus-std/di.extras`, so a value typed as the
  // `EmptyServiceProvider` class would not see it.
  const nowhere: IResolver = EmptyServiceProvider.instance;
  const emptyWorkshop = new LocatorGreetingWorkshop(nowhere);

  const lines: string[] = [
    'no container at all (EmptyServiceProvider):',
    `  provider reports itself a service: ${nowhere.isService(RESOLVER_TOKEN)}`,
    `  probing an ordinary token: ${nowhere.tryResolve<GreetingWorkshop>()}`,
    // Nothing is registered, so the workshop falls back to the library default —
    // the useful half of a null-object provider: code that degrades to its
    // defaults instead of throwing.
    `  stationery overridden: ${emptyWorkshop.stationeryIsOverridden}`,
  ];

  // The other half. Degrade what has a default; refuse what does not.
  try {
    lines.push(`  card: ${emptyWorkshop.card('Linus')}`);
  } catch (error) {
    if (error instanceof DiError) {
      lines.push('  card failed: the empty provider has no card registration to build from');
    } else {
      throw error;
    }
  }

  return lines;
}

/**
 * Reports whether a caught value belongs to the di taxonomy — the check a library
 * writes when it wants to handle the container's failures and rethrow everything
 * else.
 *
 * `DiError` is shared by di.core (registration time) and the resolution engine,
 * so ONE `instanceof DiError` covers a consumer's whole container lifecycle: a
 * rejected registration and an unresolvable token are the same family, and a
 * library that only depends on di.core can still catch both.
 *
 * Deliberately does NOT print the message. Messages name tokens, and the two
 * example dialects spell those differently (hand-written against
 * transformer-derived), while the shapes are identical in both — so the apps can
 * print this and still byte-diff against each other.
 *
 * Exported because the composition-root half of the chapter needs it: the two
 * failures it provokes live at the app (one needs a manifest, the other a built
 * provider), but classifying them is library work and belongs beside the
 * taxonomy, not duplicated into two `main.ts` files.
 *
 * @param error The caught value.
 */
export function describeDiError(error: unknown): string {
  if (error instanceof DiError) {
    return `caught a DiError (${error.name})`;
  }
  return 'not a DiError — this library would rethrow';
}
