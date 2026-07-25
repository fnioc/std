// REGISTRATION-TIME ERRORS — the half of the taxonomy a LIBRARY can provoke.
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
// Each one also carries the FIELDS needed to write the fix — here, the token that
// could not be registered and the METHOD that refused it — so the diagnostic
// below never has to parse a string.
//
// WHY ONLY HALF THE TAXONOMY LIVES HERE, which is itself the lesson. This library
// depends on `@rhombus-std/di.core` and not on `@rhombus-std/di`, and di.core
// exports exactly two error classes: `DiError`, the shared root, and
// `OpenTokenRegistrationError`, raised by the registration builder. Every other
// class — the build-time, resolution-time, async-boundary and teardown failures —
// belongs to the resolution ENGINE, and so does every staging that provokes one,
// since each needs a container built and resolved against. They live with the
// composition root; the app's errors chapter prepends this function's lines to
// its own, so the operator-facing report reads as one list.
//
// The split falls out of the packages rather than being imposed on them: what a
// library can raise is what a library can be handed a manifest and asked to do.
//
// Dialect-independent, and deliberately so: an error class has no type-driven
// form to have a twin of. Both example apps run this chapter, which is why the
// header line names neither dialect. (`@rhombus-std/di.extras` changes how you
// ASK for a service; it changes nothing about what happens when the answer is no.)

import { DiError, OpenTokenRegistrationError } from '@rhombus-std/di.core';
import type { IServiceManifest } from '@rhombus-std/di.core';

// ── the domain ───────────────────────────────────────────────────────────────

/** The service the self-check is protecting. */
class ReportService {
  public constructor(public readonly store: unknown) {}
}

// ── tokens ───────────────────────────────────────────────────────────────────

const STORE_TOKEN = 'selfcheck:IStore';
const REPOSITORY_TEMPLATE = 'selfcheck:IRepository<$1>';
/** A hole with no base around it — a template that names nothing to look up. */
const BARE_HOLE_TOKEN = '$1';

// ── the diagnostic ───────────────────────────────────────────────────────────

/**
 * Turns a registration-time failure into one operator-facing line.
 *
 * The order of the branches is `instanceof`-narrowest first, which matters:
 * every di error extends `DiError`, so a `DiError` test placed early would
 * swallow all of them. The final `DiError` arm is the honest catch-all for a
 * failure this diagnostic has not been taught — and inside a library it is doing
 * real work rather than being defensive, because the engine's error classes are
 * not on this package's import surface at all. A resolution-time error arriving
 * here genuinely IS "the container is unhappy in a way I cannot name", and
 * saying so beats pretending otherwise.
 *
 * @param error Whatever the registration call threw.
 * @returns A single line naming the failure and what to do about it.
 */
export function diagnoseRegistration(error: unknown): string {
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

  if (error instanceof DiError) {
    return `DiError (${error.name}) — the container is unhappy in a way this check has not been taught`;
  }
  return 'not a DiError at all — this diagnostic would rethrow rather than guess';
}

// ── the staged failures ──────────────────────────────────────────────────────

/**
 * Runs `attempt` and reports what it threw, or says so if it did not.
 *
 * @param what The staging's name, printed ahead of the diagnosis.
 * @param attempt The registration call expected to fail.
 */
function staged(what: string, attempt: () => unknown): string {
  try {
    attempt();
    return `${what}: DID NOT FAIL — this staging is wrong`;
  } catch (error) {
    return `${what}: ${diagnoseRegistration(error)}`;
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
    staged(
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
  lines.push(staged(
    'registering a class at a bare hole',
    () => services.addClass(BARE_HOLE_TOKEN, ReportService, [[STORE_TOKEN]]),
  ));

  return lines;
}
