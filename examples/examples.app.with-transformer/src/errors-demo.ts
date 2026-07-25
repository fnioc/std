// THE ERROR TAXONOMY, STAGED — every failure that needs a container, provoked on
// purpose.
//
// The classifier is not in this file, and its absence is the lesson. `diagnose`
// lives in `@rhombus-std/examples.lib.without-transformer`, because every class
// it branches on is a `@rhombus-std/di.core` export: a library can name the whole
// taxonomy and read what the container threw without ever referencing the
// engine. A library references the abstractions package; only an entry point
// references the engine.
//
// What is HERE is the other half. Provoking a build-time, resolution-time,
// async-boundary or teardown failure takes a manifest, a `build()`, a
// `createScope()` and a `resolve()` — the composition root's four verbs, and the
// reason these stagings are written at an entry point. Each one is a container
// built to fail in exactly one way; they are separate containers on purpose,
// because a graph with two holes reports whichever it meets first, which is fine
// for an operator and useless for a reader.
//
// The registration-time failures need none of those verbs — a refused
// registration throws from the registration call itself — so the library stages
// those against a manifest it is handed, and this chapter prepends its lines. The
// operator-facing report reads as one list either way.
//
// CLASSIFICATION in the library, STAGING at the root.
//
// The one failure not staged here is `ScopeValidationError` — the captive
// dependency — because it needs a two-level scope chain to be worth reading, and
// this app's lifetimes chapter already builds one.
//
// Dialect-independent: an error class has no type-driven form, so there is
// nothing for a with-transformer twin to differ in and the sibling app's copy of
// this file is identical to it. The header line names neither dialect for the
// same reason. (`@rhombus-std/di.extras` changes how you ASK for a service; it
// changes nothing about what happens when the answer is no.)

import { DiError, ServiceManifest, union, UnregisteredTokenError } from '@rhombus-std/di';
import type { IServiceManifest } from '@rhombus-std/di';
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

/** A configuration bag that only ever arrives asynchronously. */
interface RemoteConfig {
  readonly endpoint: string;
}

// ── tokens ───────────────────────────────────────────────────────────────────
//
// The `selfcheck:` namespace is shared with the library's registration stagings,
// so the two sets of lines read as one catalogue. Nothing resolves across the
// boundary — each half works against its own throwaway manifest — so agreement
// here is about the REPORT, not about wiring.

const REPORT_TOKEN = 'selfcheck:IReportService';
const STORE_TOKEN = 'selfcheck:IStore';
const CONNECTION_TOKEN = 'selfcheck:IConnection';
const LEDGER_TOKEN = 'selfcheck:ILedger';
const AUDIT_TOKEN = 'selfcheck:IAuditLog';
const CONFIG_TOKEN = 'selfcheck:RemoteConfig';
const CONFIG_PROMISE_TOKEN = `Promise<${CONFIG_TOKEN}>`;
const REPOSITORY_TEMPLATE = 'selfcheck:IRepository<$1>';

// ── the staged failures ──────────────────────────────────────────────────────

/** A container whose one registration names a dependency nobody supplies. */
function withUnsatisfiableStore(): IServiceManifest<'singleton'> {
  return new ServiceManifest<'singleton'>()
    .addClass(STORE_TOKEN, BrokenStore, [[CONNECTION_TOKEN]], 'singleton');
}

/**
 * Walks the whole taxonomy and returns the report lines.
 *
 * @returns One line per failure, in a fixed order.
 */
export async function demonstrateErrors(): Promise<readonly string[]> {
  const lines: string[] = ['=== di errors (dialect-independent) ==='];

  // ── registration time: the manifest refuses before anything is built ───────
  //
  // The library's half, and the reason it can BE a library's half: a rejected
  // registration throws from the call that made it, so nothing has to be built
  // for it to happen — and the manifest handed in comes back untouched, because
  // the node that would have carried the bad registration never materialised.
  // Making the manifest is still the root's job, which is why one arrives as an
  // argument.
  lines.push(...demonstrateRegistrationErrors(new ServiceManifest<'singleton'>()));

  // ── build time: the eager whole-graph check ────────────────────────────────
  //
  // `validateOnBuild` dry-runs every exact registration — nothing is
  // constructed — and collects EVERY failure into one `AggregateError` rather
  // than stopping at the first. That is the difference between one deployment
  // round-trip and one per hole. Each entry is a `RegistrationValidationError`
  // naming its token, with the underlying failure on `cause`.
  //
  // The pass is a choice, and the infrastructure chapter's provider factory
  // makes the other one: a slot that is deliberately caller-supplied is filled
  // at the call rather than by a registration, and a whole-graph check reads
  // every slot as a registration.
  lines.push(stagedFailure(
    'building with validateOnBuild',
    () => withUnsatisfiableStore().build({ validateOnBuild: true }),
  ));

  // ── resolution time ────────────────────────────────────────────────────────
  //
  // Same broken container, built WITHOUT the eager pass: it comes up fine and
  // fails at the first resolve that needs the missing piece. Which of the two
  // you want is a deployment question — fail at startup, or stay up and fail
  // only the requests that touch the broken part.
  const lazy = withUnsatisfiableStore().build().createScope('singleton');
  lines.push(stagedFailure('resolving through the same hole, unvalidated', () => lazy.resolve(STORE_TOKEN)));

  // Nothing registered at all — the plain miss, and the one a consumer most
  // often means to soften with `tryResolve`.
  lines.push(stagedFailure('resolving a token nobody registered', () => lazy.resolve(REPORT_TOKEN)));

  // A template is not a service: the token still has a hole in it, so there is
  // nothing to construct.
  lines.push(stagedFailure('resolving an open template directly', () => lazy.resolve(REPOSITORY_TEMPLATE)));

  // A constructor that takes parameters, registered with an EMPTY signature
  // list. `[]` is not `[[]]`: the first says "no signatures were supplied", the
  // second says "this constructor takes nothing". The engine can tell, because
  // the registration carries the constructor's declared arity.
  lines.push(stagedFailure('a constructor with parameters and no signature', () => {
    const services = new ServiceManifest<'singleton'>().addClass(REPORT_TOKEN, ReportService, []);
    return services.build().createScope('singleton').resolve(REPORT_TOKEN);
  }));

  // A cycle. The error carries the whole PATH, because a cycle is only readable
  // as the loop it makes — naming just the token that closed it would leave the
  // reader to find the other half.
  lines.push(stagedFailure('a dependency cycle', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(LEDGER_TOKEN, Ledger, [[AUDIT_TOKEN]], 'singleton');
    services = services.addClass(AUDIT_TOKEN, AuditLog, [[LEDGER_TOKEN]], 'singleton');
    return services.build().createScope('singleton').resolve(LEDGER_TOKEN);
  }));

  // A UNION slot whose members were all tried and none produced a value. Note
  // how this differs from the unsatisfiable-signature case above: the member IS
  // registered, so signature selection accepted the slot — it only failed once
  // the engine actually tried to build it. "Registered" and "buildable" are
  // different questions, and a union is where the difference shows.
  lines.push(stagedFailure('a union whose every member fails to build', () => {
    let services = withUnsatisfiableStore();
    services = services.addClass(REPORT_TOKEN, ReportService, [[union(STORE_TOKEN)]], 'singleton');
    return services.build().createScope('singleton').resolve(REPORT_TOKEN);
  }));

  // A FACTORY slot pointed at a token with no registration. A factory defers a
  // lookup; it cannot invent one. Worth knowing: this fires when the CALLABLE is
  // built, not when it is first called, so the failure lands during construction
  // of the thing that wanted the factory.
  lines.push(stagedFailure('a factory slot with no target', () => {
    const services = new ServiceManifest<'singleton'>()
      .addClass(REPORT_TOKEN, ReportService, [[{ type: STORE_TOKEN }]], 'singleton');
    return services.build().createScope('singleton').resolve(REPORT_TOKEN);
  }));

  // ── the async boundary ─────────────────────────────────────────────────────
  //
  // Sync and async resolution share one graph, and these two errors are the
  // fence between them. Here a construction is genuinely IN FLIGHT: the report
  // service needs a config that only exists behind a `Promise<T>` registration,
  // so `resolveAsync` starts building and caches the pending result. A `resolve`
  // arriving while that is unsettled cannot wait, and says so rather than
  // handing back a half-built object.
  let asyncServices = new ServiceManifest<'singleton'>();
  asyncServices = asyncServices.addFactory(
    CONFIG_PROMISE_TOKEN,
    async (): Promise<RemoteConfig> => ({ endpoint: 'https://reports.example.test' }),
    [[]],
    'singleton',
  );
  asyncServices = asyncServices.addClass(REPORT_TOKEN, ReportService, [[CONFIG_TOKEN]], 'singleton');
  const asyncScope = asyncServices.build().createScope('singleton');
  const inFlight = asyncScope.resolveAsync(REPORT_TOKEN);
  lines.push(
    stagedFailure('a sync resolve while an async build is in flight', () => asyncScope.resolve(REPORT_TOKEN)),
  );
  // Settle it before moving on, so the demonstration leaves nothing pending.
  await inFlight;

  // ── teardown ───────────────────────────────────────────────────────────────
  //
  // The mirror-image rule at the other end of the lifecycle: a scope that cached
  // a promise cannot be torn down synchronously, because `dispose()` has no way
  // to await it. The engine refuses rather than dropping the value on the floor.
  // The takeaway is a one-liner: a container holding anything async is closed
  // async.
  const promiseScope = new ServiceManifest<'singleton'>()
    .addFactory(CONFIG_PROMISE_TOKEN, async (): Promise<RemoteConfig> => ({ endpoint: 'unused' }), [[]], 'singleton')
    .build()
    .createScope('singleton');
  promiseScope.resolve(CONFIG_PROMISE_TOKEN);
  lines.push(stagedFailure('disposing a scope that owns a promise', () => promiseScope.dispose()));
  await promiseScope.disposeAsync();

  // Disposal closes a frame for CONSTRUCTION, not just for teardown. Nothing in
  // the language stops a caller holding the reference afterwards — it is an
  // ordinary object and the call typechecks — so the engine has to be the one
  // that refuses. This is the shape a leak takes in practice: something captured
  // the provider and outlived the scope that owned it.
  const closedScope = new ServiceManifest<'singleton'>()
    .addValue(STORE_TOKEN, { rows: [] })
    .build()
    .createScope('singleton');
  closedScope.dispose();
  lines.push(stagedFailure('resolving from a scope already disposed', () => closedScope.resolve(STORE_TOKEN)));

  // ── and the escape hatch ───────────────────────────────────────────────────
  //
  // Everything above extends ONE root, and that root is declared by di.core —
  // which is what lets `diagnose` live in a library at all. The engine
  // re-exports the same classes rather than declaring its own, so there is one
  // runtime identity per class and the `instanceof` below holds no matter which
  // specifier a caller reached them through. A consumer that does not want to
  // enumerate the taxonomy catches `DiError` and knows it has caught a container
  // problem rather than swallowed a bug in its own code.
  lines.push(`every failure above shares one root: ${new UnregisteredTokenError(REPORT_TOKEN) instanceof DiError}`);
  lines.push(`something else entirely: ${diagnose(new TypeError('not ours'))}`);

  return lines;
}
