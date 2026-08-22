// THE ERROR TAXONOMY — every way a container can be wrong, and how to tell them
// apart.
//
// The scenario is a DEPLOYMENT SELF-CHECK: a small diagnostic a service runs
// against its own container before it starts taking traffic, turning whatever
// the container throws into a line an operator can act on. That is the honest
// reason to know these classes apart — an error you cannot branch on is an error
// you can only log.
//
// Why branch on the CLASS and never on the message: a message names types, and
// the spelling of a type is a moving target. The class is the contract. Each one
// also carries the FIELDS needed to write the fix — the type nothing could
// produce, the path that closed the loop — so `diagnose` below never has to
// parse a string.
//
// WHY THE WHOLE CLASSIFIER FITS IN A LIBRARY. `@rhombus-std/di.core` declares the
// entire taxonomy: `DiError` and every leaf under it. `@rhombus-std/di`
// re-exports those same classes, so the object a container throws and the class
// this file names are one runtime identity whichever specifier reached it —
// which is what makes `instanceof` hold across the boundary. A library
// references the abstractions package; only an entry point references the
// engine. Reading what a container threw needs the abstractions, and the
// abstractions are what this package already has.
//
// WHAT A LIBRARY DOES NOT DO IS STAGE THEM, and that split is the chapter.
// Naming `CycleError` costs an import. PROVOKING one costs a manifest, a
// `build()` and a resolve — verbs that belong to whoever decided there should be
// a container. So each example app stages the failures that need one and hands
// what it caught to `diagnose`.
//
// One staging IS here, and it is here to mark the taxonomy's EDGE rather than
// its middle: the manifest polices its own arguments, and what it throws for a
// malformed registration is a plain error rather than anything under `DiError`.
// A self-check has to tell those apart too.
//
// CLASSIFICATION here, STAGING at the root. Read `diagnose`'s branch table and
// then either app's `errors-demo.ts`; the line between the two files is the line
// between the abstractions and the engine.

import { CycleError, DiError, ManifestValidationError, Type, UnsatisfiableError } from '@rhombus-std/di.core';
import type { Manifest } from '@rhombus-std/di.core';

// ── types ────────────────────────────────────────────────────────────────────
//
// The `selfcheck:` namespace is shared with the stagings each app runs, so the
// two sets of lines read as one catalogue. Nothing resolves across the boundary —
// each half works against its own throwaway manifest — so agreement here is
// about the REPORT, not about wiring.

const STORE_TYPE = Type.imported('IStore', 'selfcheck');

// ── the diagnostic ───────────────────────────────────────────────────────────

/**
 * Reports whether a caught value belongs to the di taxonomy.
 *
 * The whole family extends `DiError`, so ONE `instanceof DiError` covers a
 * consumer's entire container lifecycle. A consumer that would rather not
 * enumerate the classes catches the root instead and still knows it has caught a
 * container problem rather than swallowed a bug in its own code.
 *
 * Deliberately does NOT print the message — the two example dialects spell some
 * types differently while the shapes are identical in both, so the two apps can
 * print this and still byte-diff against each other.
 *
 * @param error The caught value.
 */
export function describeDiError(error: unknown): string {
  if (error instanceof DiError) {
    return `caught a DiError (${error.name})`;
  }
  return 'not a DiError — this check would rethrow';
}

/**
 * Turns a caught value into one operator-facing line.
 *
 * Every class below extends `DiError` directly, so no branch shadows another —
 * but the root test still goes LAST, because it would swallow all of them. The
 * last three arms are the honest catch-alls: a container failure this diagnostic
 * has not been taught yet, an error that was never ours, and a thrown value that
 * was not an error at all.
 *
 * Every branch names a `@rhombus-std/di.core` export, which is what lets the
 * table be COMPLETE inside a library. Provoking these takes a composition root;
 * see the header.
 *
 * @param error Whatever the container threw.
 * @returns A single line naming the failure and what to do about it.
 */
export function diagnose(error: unknown): string {
  // ── build time: the eager whole-graph check ────────────────────────────────
  if (error instanceof ManifestValidationError) {
    // Every broken registration at once rather than the first, so an operator
    // gets one round-trip instead of one per hole.
    const types = error.failures.map(failure => Type.stringify(failure.serviceType)).join(', ');
    return `ManifestValidationError — ${error.failures.length} registration(s) cannot be satisfied: ${types}`;
  }

  // ── resolution time ────────────────────────────────────────────────────────
  if (error instanceof CycleError) {
    // The whole path, not just the type that closed it — a loop is only readable
    // as the loop it makes.
    const path = error.chain.map(type => Type.stringify(type)).join(' -> ');
    return `CycleError — ${path}; break the loop with a factory slot`;
  }
  if (error instanceof UnsatisfiableError) {
    return `UnsatisfiableError — nothing in the manifest produces ${Type.stringify(error.serviceType)}; `
      + 'register it, or ask with getService if its absence is legitimate';
  }

  // ── the three catch-alls ───────────────────────────────────────────────────
  if (error instanceof DiError) {
    return `DiError (${error.name}) — the container is unhappy in a way this check has not been taught`;
  }
  if (error instanceof Error) {
    return `${error.name} — not a container failure; this diagnostic would rethrow rather than guess`;
  }
  return 'not an error at all — this diagnostic would rethrow rather than guess';
}

// ── the staged failures ──────────────────────────────────────────────────────

/**
 * Runs `attempt`, expects it to fail, and reports what it threw.
 *
 * One pairing serves every staging in this chapter wherever the staging lives:
 * provoke exactly one failure, hand what came back to {@link diagnose}, print one
 * line. It is exported because the stagings that need a container belong to a
 * composition root, and a root standing containers up should be writing
 * containers rather than re-deriving a report format.
 *
 * @param what The staging's name, printed ahead of the diagnosis.
 * @param attempt The call expected to fail.
 */
export function stagedFailure(what: string, attempt: () => unknown): string {
  try {
    attempt();
    return `${what}: DID NOT FAIL — this staging is wrong`;
  } catch (error) {
    return `${what}: ${diagnose(error)}`;
  }
}

/**
 * Provokes the registration surface's own refusal and returns the report line.
 *
 * Staging this against the CALLER's manifest is safe, and worth understanding
 * rather than taking on trust: `describe` opens a chain of freestanding nodes,
 * and nothing reaches the manifest until a finished descriptor is handed to a
 * verb — so a step that refuses throws from the chain and `services` is exactly
 * what it was before. A discarded chain registers nothing; a rejected one
 * leaves nothing behind.
 *
 * The refusal itself is the edge of the taxonomy rather than a member of it: a
 * key is a tag ON the service type, so a type that already carries one has
 * nowhere to put a second, and saying so is argument checking rather than a
 * container failure. `diagnose` reports it as such.
 *
 * @param services The application's registration builder, left untouched.
 * @returns One line, and the chapter header belongs to the caller, who stages
 *   the rest of the taxonomy after it.
 */
export function demonstrateRegistrationErrors(services: Manifest<'singleton'>): readonly string[] {
  return [
    stagedFailure(
      'keying a service type that already carries a key',
      () => services.describe(Type.tag(STORE_TYPE, 'primary')).asValue({ rows: [] }).taggedAs('replica'),
    ),
  ];
}
