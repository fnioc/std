// THE ERROR TAXONOMY, STAGED — every failure the container can raise, provoked
// on purpose.
//
// The classifier is not in this file, and its absence is the lesson. `diagnose`
// lives in `@rhombus-std/examples.lib.without-transformer`, because every class
// it branches on is a `@rhombus-std/di.core` export: a library can name the whole
// taxonomy and read what the container threw without ever referencing the
// engine. A library references the abstractions package; only an entry point
// references the engine.
//
// What is HERE is the other half. Provoking a failure takes a manifest, a
// `build()` and a resolve — the composition root's verbs, and the reason these
// stagings are written at an entry point. Each one is a container built to fail
// in exactly one way; they are separate containers on purpose, because a graph
// with two holes reports whichever it meets first, which is fine for an operator
// and useless for a reader.
//
// The registration-time failures need none of those verbs — a refused
// registration throws from the registration call itself — so the library stages
// those against a manifest it is handed, and this chapter prepends its lines. The
// operator-facing report reads as one list either way.
//
// CLASSIFICATION in the library, STAGING at the root.
//
// Dialect-independent: an error class has no type-driven form, so there is
// nothing for a with-transformer twin to differ in and the sibling app's copy of
// this file is identical to it. The header line names neither dialect for the
// same reason.

import { di } from '@rhombus-std/di';
import { DefaultManifest, DiError, LifetimeModel, type Manifest, ManifestValidationError, Type } from '@rhombus-std/di.core';
import { demonstrateRegistrationErrors, diagnose, stagedFailure } from '@rhombus-std/examples.lib.without-transformer';

// ── the domain ───────────────────────────────────────────────────────────────

/** Registered, but its own dependency is not — "resolvable in principle". */
class BrokenStore {
  public constructor(public readonly connection: unknown) {}
}

/** Two of these close a cycle when each is registered as the other's dependency. */
class Ledger {
  public constructor(public readonly audit: unknown) {}
}

class AuditLog {
  public constructor(public readonly ledger: unknown) {}
}

// ── types ────────────────────────────────────────────────────────────────────
//
// The `selfcheck:` namespace is shared with the library's registration stagings,
// so the two sets of lines read as one catalogue. Nothing resolves across the
// boundary — each half works against its own throwaway manifest — so agreement
// here is about the REPORT, not about wiring.

const REPORT_TYPE = Type.from('selfcheck:IReportService');
const STORE_TYPE = Type.from('selfcheck:IStore');
const CONNECTION_TYPE = Type.from('selfcheck:IConnection');
const LEDGER_TYPE = Type.from('selfcheck:ILedger');
const AUDIT_TYPE = Type.from('selfcheck:IAuditLog');

// ── the staged failures ──────────────────────────────────────────────────────

/** A container whose one registration names a dependency nobody supplies. */
function withUnsatisfiableStore(): Manifest<unknown> {
  return new DefaultManifest<unknown>(LifetimeModel.noop).add(STORE_TYPE, BrokenStore, Type.ctor(STORE_TYPE, [[CONNECTION_TYPE]]), 'singleton');
}

/**
 * Walks the whole taxonomy and returns the report lines.
 *
 * @returns One line per failure, in a fixed order.
 */
export function demonstrateErrors(): readonly string[] {
  const lines: string[] = ['=== di errors (dialect-independent) ==='];

  // ── registration time: the manifest refuses before anything is built ───────
  //
  // The library's half, and the reason it can BE a library's half: a rejected
  // registration throws from the call that made it, so nothing has to be built
  // for it to happen — and the manifest handed in comes back untouched, because
  // the node that would have carried the bad registration never materialised.
  // Making the manifest is still the root's job, which is why one arrives as an
  // argument.
  lines.push(...demonstrateRegistrationErrors(new DefaultManifest<unknown>(LifetimeModel.noop)));

  // ── build time: the eager whole-graph check ────────────────────────────────
  //
  // `validateOnBuild` lowers every registration while the provider is being
  // built — nothing is constructed — and collects EVERY failure into one
  // `ManifestValidationError` rather than stopping at the first. That is the
  // difference between one deployment round-trip and one per hole.
  lines.push(
    stagedFailure(
      'building with validateOnBuild',
      () =>
        di.usingLifetimeModel(LifetimeModel.noop)
          .usingManifest(withUnsatisfiableStore())
          .configureProvider(options => ({ ...options, validateOnBuild: true }))
          .build(),
    ),
  );

  // The registrations that could not be lowered come back on `failures`, each
  // paired with what lowering it produced. Those inner errors are where
  // `UnsatisfiableError` is READ: the provider's own lookups answer an
  // unsatisfiable request with absence (see below), so the validation pass is
  // what hands the classified failure over.
  lines.push(`  the failure inside it: ${diagnose(collectValidationErrors()[0])}`);

  // ── resolution time ────────────────────────────────────────────────────────
  //
  // The same broken container, built WITHOUT the eager pass: it comes up fine
  // and answers the first request that needs the missing piece. Which of the two
  // you want is a deployment question — fail at startup, or stay up and answer
  // only the requests that touch the working part.
  //
  // `resolve` and `resolve` both throw here: STORE_TYPE IS registered, so it
  // is the chosen answer, and a chosen answer's runtime build failure never
  // falls through to a softer one — the union-with-undefined address that
  // recovers a WHOLLY unregistered type does nothing for a registered type
  // whose own dependency cannot be built.
  const lazy = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(withUnsatisfiableStore()).build();
  lines.push(stagedFailure('asking with resolve for a registration that cannot be lowered', () => lazy.resolve(STORE_TYPE)));
  lines.push(stagedFailure('asking with resolve for the same', () => lazy.resolve(STORE_TYPE)));
  lines.push(stagedFailure('asking for a type nobody registered', () => lazy.resolve(REPORT_TYPE)));

  // A cycle. The error carries the whole PATH, because a cycle is only readable
  // as the loop it makes — naming just the type that closed it would leave the
  // reader to find the other half.
  lines.push(stagedFailure('a dependency cycle', () => {
    let services: Manifest<unknown> = new DefaultManifest<unknown>(LifetimeModel.noop);
    services = services.add(LEDGER_TYPE, Ledger, Type.ctor(LEDGER_TYPE, [[AUDIT_TYPE]]), 'singleton');
    services = services.add(AUDIT_TYPE, AuditLog, Type.ctor(AUDIT_TYPE, [[LEDGER_TYPE]]), 'singleton');
    return di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build().resolve(LEDGER_TYPE);
  }));

  // ── and the escape hatch ───────────────────────────────────────────────────
  //
  // Everything above extends ONE root, and that root is declared by di.core —
  // which is what lets `diagnose` live in a library at all. The engine
  // re-exports the same classes rather than declaring its own, so there is one
  // runtime identity per class and the `instanceof` below holds no matter which
  // specifier a caller reached them through. A consumer that does not want to
  // enumerate the taxonomy catches `DiError` and knows it has caught a container
  // problem rather than swallowed a bug in its own code.
  lines.push(`every failure above shares one root: ${new ManifestValidationError([]) instanceof DiError}`);
  lines.push(`something else entirely: ${diagnose(new TypeError('not ours'))}`);

  return lines;
}

/** The inner failures the eager pass collected, so one of them can be classified. */
function collectValidationErrors(): readonly Error[] {
  try {
    di.usingLifetimeModel(LifetimeModel.noop)
      .usingManifest(withUnsatisfiableStore())
      .configureProvider(options => ({ ...options, validateOnBuild: true }))
      .build();
  } catch (error) {
    if (error instanceof ManifestValidationError) {
      return error.errors;
    }
    throw error;
  }
  return [];
}
