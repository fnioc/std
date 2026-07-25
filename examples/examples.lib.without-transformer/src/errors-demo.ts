// THE ERROR TAXONOMY — every way a container can be wrong, and how to tell them
// apart.
//
// The scenario is a DEPLOYMENT SELF-CHECK: a small diagnostic a service runs
// against its own container before it starts taking traffic, turning whatever
// the container throws into a line an operator can act on. That is the honest
// reason to know these classes apart — an error you cannot branch on is an error
// you can only log.
//
// Why branch on the CLASS and never on the message: messages name tokens, and a
// token is a moving target (it changes when a type is renamed, and the two
// authoring dialects spell some of them differently). The class is the contract.
// Each one also carries the FIELDS needed to write the fix — the token that had
// no source, the path that closed the cycle, the constructor that could not be
// built — so `diagnose` below never has to parse a string.
//
// WHY THE WHOLE CLASSIFIER FITS IN A LIBRARY. `@rhombus-std/di.core` declares the
// entire taxonomy: `DiError`, the registration-time `OpenTokenRegistrationError`,
// and every build-time, resolution-time, async-boundary and teardown class
// alongside them. `@rhombus-std/di` re-exports those same classes, so the object
// a container throws and the class this file names are one runtime identity
// whichever specifier reached it — which is what makes `instanceof` hold across
// the boundary. A library references the abstractions package; only an entry
// point references the engine. Reading what a container threw needs the
// abstractions, and the abstractions are what this package already has.
//
// WHAT A LIBRARY DOES NOT DO IS STAGE THEM, and that split is the chapter.
// Naming `CircularDependencyError` costs an import. PROVOKING one costs a
// manifest, a `build()`, a `createScope()` and a `resolve()` — four verbs that
// belong to whoever decided there should be a container. So each example app
// stages the failures that need one and hands what it caught to `diagnose`.
//
// The two registration-time failures ARE staged here, and the reason is
// structural rather than a carve-out: a refused registration throws from the
// registration call itself, so `demonstrateRegistrationErrors` provokes both
// against a manifest it was handed and never builds anything at all.
//
// CLASSIFICATION here, STAGING at the root. Read `diagnose`'s branch table and
// then either app's `errors-demo.ts`; the line between the two files is the line
// between the abstractions and the engine.
//
// Dialect-independent, and deliberately so: an error class has no type-driven
// form to have a twin of. Both example apps take this classifier from here
// rather than writing their own. (`@rhombus-std/di.extras` changes how you ASK
// for a service; it changes nothing about what happens when the answer is no.)

import { AsyncDisposalRequiredError, AsyncResolutionRequiredError, CircularDependencyError, DiError, FactoryTargetError,
  MissingMetadataError, NoSatisfiableSignatureError, NoSatisfiableUnionError, OpenTokenRegistrationError,
  OpenTokenResolutionError, ProviderDisposedError, RegistrationValidationError,
  UnregisteredTokenError } from '@rhombus-std/di.core';
import type { IServiceManifest } from '@rhombus-std/di.core';

// ── the domain ───────────────────────────────────────────────────────────────

/** The service the self-check is protecting. */
class ReportService {
  public constructor(public readonly store: unknown) {}
}

// ── tokens ───────────────────────────────────────────────────────────────────
//
// The `selfcheck:` namespace is shared with the stagings each app runs, so the
// two sets of lines read as one catalogue. Nothing resolves across the boundary —
// each half works against its own throwaway manifest — so agreement here is
// about the REPORT, not about wiring.

const STORE_TOKEN = 'selfcheck:IStore';
const REPOSITORY_TEMPLATE = 'selfcheck:IRepository<$1>';
/** A hole with no base around it — a template that names nothing to look up. */
const BARE_HOLE_TOKEN = '$1';

// ── the diagnostic ───────────────────────────────────────────────────────────

/**
 * Reports whether a caught value belongs to the di taxonomy.
 *
 * The whole family extends `DiError`, so ONE `instanceof DiError` covers a
 * consumer's entire container lifecycle: a rejected registration and an
 * unresolvable token are the same family. A consumer that would rather not
 * enumerate the classes catches the root instead and still knows it has caught a
 * container problem rather than swallowed a bug in its own code.
 *
 * Deliberately does NOT print the message. Messages name tokens, and the two
 * example dialects spell those differently (hand-written against
 * transformer-derived), while the shapes are identical in both — so the two apps
 * can print this and still byte-diff against each other.
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
 * The order of the branches is `instanceof`-narrowest first, which matters:
 * every class below extends `DiError`, so a `DiError` test placed early would
 * swallow all of them. The last two arms are the honest catch-alls — a container
 * failure this diagnostic has not been taught yet, and a value that was never
 * ours to begin with.
 *
 * Every branch names a `@rhombus-std/di.core` export, which is what lets the
 * table be COMPLETE inside a library. Only the first branch describes something
 * this package can also provoke; the rest arrive from a composition root that
 * staged them. See the header.
 *
 * @param error Whatever the container threw.
 * @returns A single line naming the failure and what to do about it.
 */
export function diagnose(error: unknown): string {
  // ── registration time ──────────────────────────────────────────────────────
  if (error instanceof OpenTokenRegistrationError) {
    // One class, two causes — told apart by `method` rather than by reading the
    // message, which is the point of carrying the field.
    if (error.method === 'addClass') {
      return `OpenTokenRegistrationError — "${error.token}" is a template no closed token could ever match; `
        + 'give it a base and at least one argument, so a closing has something to be looked up under';
    }
    return `OpenTokenRegistrationError — "${error.token}" still has a hole in it, and ${error.method}() `
      + 'cannot stand behind a family of tokens; only a class can be built afresh per closing';
  }

  // ── build time ─────────────────────────────────────────────────────────────
  if (error instanceof AggregateError) {
    // `validateOnBuild` reports EVERY broken registration at once rather than
    // stopping at the first, so the operator gets one round-trip instead of N.
    const broken = error.errors.filter((entry): entry is RegistrationValidationError =>
      entry instanceof RegistrationValidationError
    );
    const tokens = broken.map((entry) => entry.token).join(', ');
    return `AggregateError — ${broken.length} registration(s) cannot be constructed: ${tokens}`;
  }

  // ── resolution time ────────────────────────────────────────────────────────
  if (error instanceof UnregisteredTokenError) {
    return `UnregisteredTokenError — nothing is registered at "${error.token}"; `
      + 'register it, or ask with tryResolve if its absence is legitimate';
  }
  if (error instanceof OpenTokenResolutionError) {
    return `OpenTokenResolutionError — "${error.token}" is a template, not a service; `
      + 'resolve a closing of it instead';
  }
  if (error instanceof CircularDependencyError) {
    // The whole path, not just the token that closed it — a cycle is only
    // readable as the loop it makes.
    return `CircularDependencyError — ${error.path.join(' -> ')}; break the loop with a factory slot`;
  }
  if (error instanceof MissingMetadataError) {
    return `MissingMetadataError — ${error.ctorName} takes parameters but its registration carries no `
      + 'signature; pass one as the third addClass argument';
  }
  if (error instanceof NoSatisfiableSignatureError) {
    return `NoSatisfiableSignatureError — ${error.ctorName} has signatures but every one names something `
      + `missing: ${error.unsatisfiable.join(', ')}`;
  }
  if (error instanceof NoSatisfiableUnionError) {
    return `NoSatisfiableUnionError — ${error.members.length} alternative(s) were tried and none produced `
      + 'a value; at least one member has to build';
  }
  if (error instanceof FactoryTargetError) {
    return `FactoryTargetError — a factory was asked for "${error.factoryToken}" (${error.reason}); `
      + 'a factory can only defer a lookup, not invent the registration';
  }
  if (error instanceof AsyncResolutionRequiredError) {
    return `AsyncResolutionRequiredError — "${error.token}" is mid-construction on the async path; `
      + 'await resolveAsync instead of calling resolve';
  }

  // ── teardown time ──────────────────────────────────────────────────────────
  if (error instanceof ProviderDisposedError) {
    return 'ProviderDisposedError — this provider was disposed, and a disposed frame will not build '
      + 'anything new; the caller is holding a reference that outlived its scope';
  }
  if (error instanceof AsyncDisposalRequiredError) {
    return 'AsyncDisposalRequiredError — this scope owns a promise, which a synchronous teardown cannot '
      + 'settle; await disposeAsync';
  }

  // ── the two catch-alls ─────────────────────────────────────────────────────
  if (error instanceof DiError) {
    return `DiError (${error.name}) — the container is unhappy in a way this check has not been taught`;
  }
  return 'not a DiError at all — this diagnostic would rethrow rather than guess';
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
 * Provokes both registration-time failures against the manifest it was handed,
 * and returns the report lines.
 *
 * Staging against the CALLER's manifest is safe, and worth understanding rather
 * than taking on trust: the collection materialises a registration inside the
 * NEW node's constructor, so a refused registration throws from the call that
 * made it and no half-built node ever escapes. `services` is exactly what it was
 * before — the same immutability the whole surface rests on, seen from the other
 * side. A discarded result registers nothing; a rejected one leaves nothing
 * behind.
 *
 * @param services The application's registration builder, left untouched.
 * @returns One line per failure, in a fixed order. The chapter header belongs to
 *   the caller, who stages the rest of the taxonomy after these.
 */
export function demonstrateRegistrationErrors(services: IServiceManifest<'singleton'>): readonly string[] {
  // The cheapest failures to have, because they happen at the call that made
  // the mistake rather than at some later resolve. An OPEN template names a
  // FAMILY of tokens — one per closing — so only a class can stand behind it;
  // a value has one already-built instance and no way to produce one per
  // closing.
  const lines: string[] = [
    stagedFailure(
      'registering a value at an open template',
      () => services.addValue(REPOSITORY_TEMPLATE, { rows: [] }),
    ),
  ];

  // The OTHER cause of the same error, and the whole of what `addClass`
  // refuses: a template no closed token could ever match. A template is found
  // under a base and then unified against a closing, so it needs a base and at
  // least one argument. A bare hole has neither — nothing is ever looked up
  // under `$1` — and a token the grammar cannot read as a generic application
  // is out for the same reason. Either would otherwise sit in the manifest
  // matching nothing, forever, in silence.
  //
  // Note what is NOT here: a template that mixes concrete arguments with holes.
  // `IRepository<User,$1>` is an ordinary template, registers fine, and is what
  // the open-generics chapter is about.
  lines.push(stagedFailure(
    'registering a class at a bare hole',
    () => services.addClass(BARE_HOLE_TOKEN, ReportService, [[STORE_TOKEN]]),
  ));

  return lines;
}
