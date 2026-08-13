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

import { DefaultManifest, DiError, ManifestValidationError, Type } from '@rhombus-std/di.core';
import type { Manifest } from '@rhombus-std/di.core';
import '@rhombus-std/di';
import { demonstrateRegistrationErrors, diagnose, stagedFailure } from '@rhombus-std/examples.lib.without-transformer';

// ── the domain ───────────────────────────────────────────────────────────────

/** The service the self-check is protecting. */
class ReportService {
  public constructor(public readonly store: unknown) {}
}

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
const METRICS_TYPE = Type.from('selfcheck:IMetricsRecorder');

// ── the staged failures ──────────────────────────────────────────────────────

/** A container whose one registration names a dependency nobody supplies. */
function withUnsatisfiableStore(): Manifest<'singleton'> {
  return new DefaultManifest<'singleton'>().addClass(STORE_TYPE, BrokenStore, Type.ctor(STORE_TYPE, CONNECTION_TYPE),
    'singleton');
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
  lines.push(...demonstrateRegistrationErrors(new DefaultManifest<'singleton'>()));

  // ── build time: the eager whole-graph check ────────────────────────────────
  //
  // `validateOnBuild` lowers every registration while the provider is being
  // built — nothing is constructed — and collects EVERY failure into one
  // `ManifestValidationError` rather than stopping at the first. That is the
  // difference between one deployment round-trip and one per hole.
  lines.push(
    stagedFailure('building with validateOnBuild', () => withUnsatisfiableStore().build({ validateOnBuild: true })),
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
  // The two lookups differ on exactly one axis, and it is what an ABSENT service
  // does. `getService` treats absence as an answer and hands back `undefined`,
  // which is the shape to reach for when a deployment may legitimately not have
  // the thing. `getRequiredService` treats it as a wiring fault and throws, which
  // is the shape to reach for when the service is part of the deal.
  const lazy = withUnsatisfiableStore().build();
  lines.push(`asking with getService for a registration that cannot be lowered: ${lazy.getService(STORE_TYPE)}`);
  lines.push(stagedFailure('asking with getRequiredService for the same', () => lazy.getRequiredService(STORE_TYPE)));
  lines.push(stagedFailure('asking for a type nobody registered', () => lazy.getRequiredService(REPORT_TYPE)));

  // A cycle. The error carries the whole PATH, because a cycle is only readable
  // as the loop it makes — naming just the type that closed it would leave the
  // reader to find the other half.
  lines.push(stagedFailure('a dependency cycle', () => {
    let services = new DefaultManifest<'singleton'>();
    services = services.addClass(LEDGER_TYPE, Ledger, Type.ctor(LEDGER_TYPE, AUDIT_TYPE), 'singleton');
    services = services.addClass(AUDIT_TYPE, AuditLog, Type.ctor(AUDIT_TYPE, LEDGER_TYPE), 'singleton');
    return services.build().getRequiredService(LEDGER_TYPE);
  }));

  // A UNION slot with more than one member the manifest can supply. A union
  // states which types will do rather than which to prefer, so two answers means
  // the registrations have not said enough and the container declines to guess.
  lines.push(stagedFailure('a union two registrations can both supply', () =>
    ambiguous().build()
      .getRequiredService(REPORT_TYPE)));

  // The same container, told what to do about it. `unionAmbiguity: 'newest'`
  // takes the member whose registration is most recent, which is how the
  // manifest already settles two registrations of one type.
  const decided = ambiguous().build({ unionAmbiguity: 'newest' }).getRequiredService(REPORT_TYPE) as ReportService;
  lines.push(`  built with unionAmbiguity "newest" instead: ${JSON.stringify(decided.store)}`);

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

/** The graph whose union slot two registrations compete to fill. */
function ambiguous(): Manifest<'singleton'> {
  let services = new DefaultManifest<'singleton'>();
  services = services.addValue(AUDIT_TYPE, { kind: 'audit' });
  services = services.addValue(METRICS_TYPE, { kind: 'metrics' });
  services = services.addClass(REPORT_TYPE, ReportService, Type.ctor(REPORT_TYPE, Type.union(METRICS_TYPE, AUDIT_TYPE)),
    'singleton');
  return services;
}

/** The inner failures the eager pass collected, so one of them can be classified. */
function collectValidationErrors(): readonly Error[] {
  try {
    withUnsatisfiableStore().build({ validateOnBuild: true });
  } catch (error) {
    if (error instanceof ManifestValidationError) {
      return error.errors;
    }
    throw error;
  }
  return [];
}
