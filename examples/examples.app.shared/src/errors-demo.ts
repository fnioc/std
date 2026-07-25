// THE ERROR TAXONOMY — every way a container can be wrong, provoked on purpose.
//
// The scenario is a DEPLOYMENT SELF-CHECK: a small diagnostic an application
// runs against its own container before it starts taking traffic, turning
// whatever the container throws into a line an operator can act on. That is the
// honest reason to know these classes apart — an error you cannot branch on is
// an error you can only log.
//
// Why branch on the CLASS and never on the message: messages name tokens, and a
// token is a moving target (it changes when a type is renamed, and the two
// authoring dialects spell some of them differently). The class is the contract.
// Each one also carries the FIELDS needed to write the fix — the token that had
// no source, the path that closed the cycle, the constructor that could not be
// built — so `diagnose` below never has to parse a string.
//
// WHY THE CHAPTER IS SPLIT, and it is the whole restructure in one file. Every
// failure below the registration line needs a BUILT CONTAINER to happen at all —
// a `build()`, a `createScope()`, a `resolve()`, a `dispose()`. Those are the
// composition root's verbs, not a library's, and the classes they throw
// (`UnregisteredTokenError`, `CircularDependencyError`, `AsyncDisposalRequiredError`
// and seven more) are exported by `@rhombus-std/di` — the engine — and not by
// `@rhombus-std/di.core`. A library cannot name them, so a library cannot
// diagnose them. What a library CAN do is everything that happens before the
// build, and `@rhombus-std/examples.lib.without-transformer` keeps exactly that
// half: `demonstrateRegistrationErrors` provokes the two registration-time
// failures against a manifest it was handed, and `diagnoseRegistration` reads
// them. This file extends that table rather than restating it — see `diagnose`.
//
// Dialect-independent, and deliberately so: an error class has no type-driven
// form to have a twin of. Both example apps import THIS chapter rather than
// twinning it, which is why the header line names neither dialect, and why the
// two apps' output cannot drift apart here by construction rather than by
// discipline. (`@rhombus-std/di.extras` changes how you ASK for a service; it
// changes nothing about what happens when the answer is no.)
//
// The one failure not staged here is `ScopeValidationError` — the captive
// dependency — because it needs a two-level scope chain to be worth reading, and
// each app's lifetimes chapter already builds one.

import { AsyncDisposalRequiredError, AsyncResolutionRequiredError, CircularDependencyError, DiError, FactoryTargetError,
  MissingMetadataError, NoSatisfiableSignatureError, NoSatisfiableUnionError, OpenTokenResolutionError,
  RegistrationValidationError, ServiceManifest, union, UnregisteredTokenError } from '@rhombus-std/di';
import type { IServiceManifest } from '@rhombus-std/di';
import { demonstrateRegistrationErrors, diagnoseRegistration } from '@rhombus-std/examples.lib.without-transformer';

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
// The `selfcheck:` namespace is shared with the library's registration half, so
// the two sets of lines read as one catalogue. Nothing resolves across the
// boundary — each half builds its own throwaway container — so agreement here is
// about the REPORT, not about wiring.

const REPORT_TOKEN = 'selfcheck:IReportService';
const STORE_TOKEN = 'selfcheck:IStore';
const CONNECTION_TOKEN = 'selfcheck:IConnection';
const LEDGER_TOKEN = 'selfcheck:ILedger';
const AUDIT_TOKEN = 'selfcheck:IAuditLog';
const CONFIG_TOKEN = 'selfcheck:RemoteConfig';
const CONFIG_PROMISE_TOKEN = `Promise<${CONFIG_TOKEN}>`;
const REPOSITORY_TEMPLATE = 'selfcheck:IRepository<$1>';

// ── the diagnostic ───────────────────────────────────────────────────────────

/**
 * Turns a caught value into one operator-facing line.
 *
 * The order of the branches is `instanceof`-narrowest first, which matters:
 * every class below extends `DiError`, so a `DiError` test placed early would
 * swallow all of them. The last arm is the interesting one — instead of
 * restating the registration-time branch and the two catch-alls, it hands the
 * value to the LIBRARY's `diagnoseRegistration`. The root's table is a strict
 * EXTENSION of the library's, and it composes rather than copies, so a fix to
 * either half lands once.
 *
 * @param error Whatever the container threw.
 * @returns A single line naming the failure and what to do about it.
 */
export function diagnose(error: unknown): string {
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
  if (error instanceof AsyncDisposalRequiredError) {
    return 'AsyncDisposalRequiredError — this scope owns a promise, which a synchronous teardown cannot '
      + 'settle; await disposeAsync';
  }

  // ── registration time, and the two catch-alls ──────────────────────────────
  //
  // Everything left is reachable from `@rhombus-std/di.core` alone, so the
  // library half already knows how to read it: the `OpenTokenRegistrationError`
  // branch with its `method` discrimination, the honest `DiError` arm for a
  // failure neither half has been taught yet, and the "not ours at all" arm.
  return diagnoseRegistration(error);
}

// ── the staged failures ──────────────────────────────────────────────────────

/**
 * Runs `attempt` and reports what it threw, or says so if it did not.
 *
 * Every case below is a container built to fail in exactly one way. They are
 * separate containers on purpose: a graph with two holes reports whichever it
 * meets first, which is fine for an operator and useless for a reader.
 */
function staged(what: string, attempt: () => unknown): string {
  try {
    attempt();
    return `${what}: DID NOT FAIL — this staging is wrong`;
  } catch (error) {
    return `${what}: ${diagnose(error)}`;
  }
}

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
  // The trade-off is real, and the infrastructure chapter's provider factory
  // declines the pass for it: a slot that is deliberately caller-supplied looks
  // exactly like a wiring hole to a whole-graph check.
  lines.push(staged(
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
  lines.push(staged('resolving through the same hole, unvalidated', () => lazy.resolve(STORE_TOKEN)));

  // Nothing registered at all — the plain miss, and the one a consumer most
  // often means to soften with `tryResolve`.
  lines.push(staged('resolving a token nobody registered', () => lazy.resolve(REPORT_TOKEN)));

  // A template is not a service: the token still has a hole in it, so there is
  // nothing to construct.
  lines.push(staged('resolving an open template directly', () => lazy.resolve(REPOSITORY_TEMPLATE)));

  // A constructor that takes parameters, registered with an EMPTY signature
  // list. `[]` is not `[[]]`: the first says "no signatures were supplied", the
  // second says "this constructor takes nothing". The engine can tell, because
  // the registration carries the constructor's declared arity.
  lines.push(staged('a constructor with parameters and no signature', () => {
    const services = new ServiceManifest<'singleton'>().addClass(REPORT_TOKEN, ReportService, []);
    return services.build().createScope('singleton').resolve(REPORT_TOKEN);
  }));

  // A cycle. The error carries the whole PATH, because a cycle is only readable
  // as the loop it makes — naming just the token that closed it would leave the
  // reader to find the other half.
  lines.push(staged('a dependency cycle', () => {
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
  lines.push(staged('a union whose every member fails to build', () => {
    let services = withUnsatisfiableStore();
    services = services.addClass(REPORT_TOKEN, ReportService, [[union(STORE_TOKEN)]], 'singleton');
    return services.build().createScope('singleton').resolve(REPORT_TOKEN);
  }));

  // A FACTORY slot pointed at a token with no registration. A factory defers a
  // lookup; it cannot invent one. Worth knowing: this fires when the CALLABLE is
  // built, not when it is first called, so the failure lands during construction
  // of the thing that wanted the factory.
  lines.push(staged('a factory slot with no target', () => {
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
  lines.push(staged('a sync resolve while an async build is in flight', () => asyncScope.resolve(REPORT_TOKEN)));
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
  lines.push(staged('disposing a scope that owns a promise', () => promiseScope.dispose()));
  await promiseScope.disposeAsync();

  // ── and the escape hatch ───────────────────────────────────────────────────
  //
  // Everything above extends ONE root, and that root is a di.core export — which
  // is what lets the library half catch it too. A consumer that does not want to
  // enumerate the taxonomy can catch `DiError` and be sure it has caught a
  // container problem rather than swallowed a bug in its own code.
  lines.push(`every failure above shares one root: ${new UnregisteredTokenError(REPORT_TOKEN) instanceof DiError}`);
  lines.push(`something else entirely: ${diagnose(new TypeError('not ours'))}`);

  return lines;
}
