// Type-level checks for the builder lock-on: the vocabulary generic stays `unknown` until an
// addon fixes it, whichever addon or manifest function arrives first defines it, every later
// addon must thread that same vocabulary, and neither `Addon<unknown>` nor `Addon<any>` can
// widen it back. Never executed: every probe sits in a function nothing calls, so bun loading
// the file runs nothing, and the file earns its keep through `lint` (`tsc --noEmit`).
//
// The `@ts-expect-error` lines are the load-bearing half. A broken lock-on tends to collapse to
// `any`, and `any` satisfies every constraint — so the positive cases keep passing and only an
// expected-error that stops erroring reveals it. The `Equal` pins close the same gap from the
// other side: `Equal` tells `any` and `unknown` apart, so a collapsed vocabulary fails the pin.

import { Builder } from '@rhombus-std/di';
import type { Addon, AddonInstallation, Manifest, Registration } from '@rhombus-std/di.core';

// #region devices

/** Passes only when instantiated with `true`. */
type Expect<T extends true> = T;

/** Identical-type test — tells `any`, `unknown`, and every union apart. */
type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends (<X>() => X extends B ? 1 : 2) ? true : false;

/** The vocabulary a builder holds. */
type VocabularyOf<B> = B extends Builder<infer L> ? L : never;

// #endregion

// #region fixtures

/** A lifetime model fixing a two-value vocabulary. */
declare const standardModel: Addon<'singleton' | 'scoped'>;

/** An addon from a different vocabulary altogether. */
declare const taggedModel: Addon<'tagged'>;

/** The widening shapes the lock-on must refuse. */
declare const unknownAddon: Addon<unknown>;
declare const anyAddon: Addon<any>;

/** A vacuous addon: generic in the vocabulary, with nothing of its own fixing it. */
declare class VacuousAddon<T> implements Addon<T> {
  create(): AddonInstallation<T>;
}

// #endregion

// Nothing calls this; the probes inside are compile-time only.
function probeLockOn(): void {
  // (1) Each opener infers the vocabulary from whichever argument opens the chain.
  const openedByAddon = Builder.useAddon(standardModel);
  type OpenerInfersFromAddon = Expect<Equal<VocabularyOf<typeof openedByAddon>, 'singleton' | 'scoped'>>;

  const openedByServices = Builder.withServices((manifest: Manifest<'tagged'>) => manifest);
  type OpenerInfersFromManifest = Expect<Equal<VocabularyOf<typeof openedByServices>, 'tagged'>>;

  // (2) A vacuous opener fixes nothing; the first vocabulary-carrying addon then locks it.
  const openedVacuously = Builder.useAddon(new VacuousAddon());
  type VacuousOpenerLocksNothing = Expect<Equal<VocabularyOf<typeof openedVacuously>, unknown>>;

  const locked = openedVacuously.useAddon(standardModel);
  type ModelAddonLocksTheVocabulary = Expect<Equal<VocabularyOf<typeof locked>, 'singleton' | 'scoped'>>;

  // (3) A locked builder accepts its own vocabulary and refuses every other.
  const stillLocked = locked.useAddon(standardModel);
  type SameVocabularyKeepsTheLock = Expect<Equal<VocabularyOf<typeof stillLocked>, 'singleton' | 'scoped'>>;

  // @ts-expect-error -- a foreign vocabulary does not fit the lock
  locked.useAddon(taggedModel);
  // @ts-expect-error -- Addon<unknown> would widen the lock away
  locked.useAddon(unknownAddon);
  // @ts-expect-error -- Addon<any> would erase the lock
  locked.useAddon(anyAddon);

  // (4) A generic vacuous addon threads the locked vocabulary instead of widening it.
  const threaded = locked.useAddon(new VacuousAddon());
  type VacuousAddonThreadsTheLock = Expect<Equal<VocabularyOf<typeof threaded>, 'singleton' | 'scoped'>>;

  // (5) withServices demands the locked vocabulary's manifest — and, unlocked, locks onto its fn's.
  const servicesAdded = locked.withServices(manifest => {
    type FnSeesTheLockedManifest = Expect<Equal<typeof manifest, Manifest<'singleton' | 'scoped'>>>;
    return manifest;
  });
  type WithServicesKeepsTheLock = Expect<Equal<VocabularyOf<typeof servicesAdded>, 'singleton' | 'scoped'>>;

  // @ts-expect-error -- a foreign vocabulary's manifest does not fit the lock
  locked.withServices((manifest: Manifest<'tagged'>) => manifest);

  const lockedByServices = openedVacuously.withServices((manifest: Manifest<'singleton' | 'scoped'>) => manifest);
  type WithServicesLocksTheVocabulary = Expect<Equal<VocabularyOf<typeof lockedByServices>, 'singleton' | 'scoped'>>;

  // (6) `any` never enters: every opener and verb refuses it outright, locked or not.
  // @ts-expect-error -- Addon<any> would erase the vocabulary before anything locked it
  Builder.useAddon(anyAddon);
  // @ts-expect-error -- a Manifest<any> fn would erase it the same way
  Builder.withServices((manifest: Manifest<any>) => manifest);
  // @ts-expect-error -- an unlocked builder refuses an any-typed fn too
  openedVacuously.withServices((manifest: Manifest<any>) => manifest);
  // @ts-expect-error -- and a locked one refuses it just the same
  locked.withServices((manifest: Manifest<any>) => manifest);

  // (7) `Addon<unknown>` IS the unlocked state: it opens and stacks without fixing anything,
  // and the first vocabulary-carrying addon still locks on.
  const openedByUnknown = Builder.useAddon(unknownAddon);
  type UnknownAddonOpensUnlocked = Expect<Equal<VocabularyOf<typeof openedByUnknown>, unknown>>;

  const stackedUnknowns = openedByUnknown.useAddon(unknownAddon);
  type UnknownAddonsStackWhileUnlocked = Expect<Equal<VocabularyOf<typeof stackedUnknowns>, unknown>>;

  const lockedAfterUnknowns = stackedUnknowns.useAddon(standardModel);
  type ModelLocksAfterUnknownAddons = Expect<Equal<VocabularyOf<typeof lockedAfterUnknowns>, 'singleton' | 'scoped'>>;
}
