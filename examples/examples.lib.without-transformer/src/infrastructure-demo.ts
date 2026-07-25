// THE NULL-OBJECT PROVIDER — the one section of the infrastructure chapter that
// needs no container at all, which is exactly why it is the section a LIBRARY
// keeps.
//
// The chapter as a whole has four parts, and the split between this file and the
// example apps is not arbitrary: the other three build providers and resolve out
// of them, which is composition-root work, so each app owns its own
// `infrastructure-demo.ts` orchestrator and calls back into this function to keep
// the chapter's line order intact. What remains here is the part where the
// absence of a container IS the subject.
//
// Nothing here prints, and nothing here reads a clock, the filesystem or a
// random source — the output is byte-stable, which the apps' checked-in
// `expected.txt` diff depends on.
//
// Read alongside `./infrastructure-greeting-workshop.ts`, which defines every
// type used below. The with-transformer sibling produces IDENTICAL lines from
// the type-driven dialect.

import { DiError, EmptyServiceProvider, RESOLVER_TOKEN } from '@rhombus-std/di.core';
import type { IResolver } from '@rhombus-std/di.core';

import { GREETING_WORKSHOP_TOKEN, LocatorGreetingWorkshop } from './infrastructure-greeting-workshop.js';

/**
 * Runs the greeting workshop against no container at all, and returns the lines
 * it produced.
 *
 * `EmptyServiceProvider` is a shared null-object provider that holds no
 * application services. Reach for it when a provider is REQUIRED but none is
 * meaningful: a unit test for a class that only optionally consults the
 * container, a tool that runs one piece of a library outside any host, a default
 * parameter. It beats standing up an empty real container (no engine, no
 * allocation) and it beats a bespoke stub (it is the whole `IServiceProvider`
 * surface, kept honest by di.core).
 *
 * It answers `isService` true for exactly one token — the intrinsic provider
 * itself — so a class whose only dependency is the provider still constructs.
 *
 * @returns One line per observation, in a fixed order.
 */
export function demonstrateNullProvider(): readonly string[] {
  // Held as the `IResolver` INTERFACE, not the concrete class: that is the
  // surface library code should program against, and it is what makes the null
  // object drop-in wherever a real provider would go.
  const nowhere: IResolver = EmptyServiceProvider.instance;
  // The LOCATOR workshop, deliberately — this is the one job it can do that the
  // parameter-injected `GreetingWorkshop` cannot, because it defers every lookup
  // to first use. The good class takes its card factory as a constructor
  // argument, and there is no card factory to be had here, so it could not be
  // built at all. That is not a shortcoming: failing when the wiring is missing,
  // rather than when a request arrives, is the whole benefit being traded for.
  const emptyWorkshop = new LocatorGreetingWorkshop(nowhere);

  const lines: string[] = ['no container at all (EmptyServiceProvider):',
    `  provider reports itself a service: ${nowhere.isService(RESOLVER_TOKEN)}`,
    `  probing an ordinary token: ${nowhere.tryResolve(GREETING_WORKSHOP_TOKEN)}`];
  // Nothing is registered, so the workshop falls back to the library default —
  // which is the useful half of a null-object provider: code that degrades to
  // its defaults instead of throwing.
  lines.push(`  stationery overridden: ${emptyWorkshop.stationeryIsOverridden}`);

  // The other half: what genuinely CANNOT be defaulted still fails loudly. A
  // card needs a `GreetingCard` registration to build from, and the empty
  // provider has none — so the first `card()` call throws rather than inventing
  // one. Degrade what has a default; refuse what does not.
  //
  // `DiError` is the taxonomy ROOT, and it lives in di.core precisely so a
  // library can catch container failures without depending on the engine that
  // raises most of them.
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
