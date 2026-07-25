// LIFETIMES, SCOPES AND DISPOSAL — the tokenless (with-transformer) dialect.
//
// ONE realistic scenario: a small order-processing service.
//   - the connection pool is expensive to open and safe to share, so it is a
//     SINGLETON — one per process;
//   - each inbound request gets its own unit of work and its own outbox
//     channel, so those are "request"-scoped — one per request;
//   - the order validator is stateless and cheap, so it is TRANSIENT — which in
//     this container means it carries NO scope tag at all.
//
// What this file exists to teach, in the order it demonstrates it:
//
//   1. `.as(...)` attaches a lifetime; `createScope(name)` opens the FRAME that
//      makes that lifetime actually cache; closing a frame disposes exactly what
//      THAT frame owns, in REVERSE construction order — so a service is still
//      usable while the services depending on it shut down.
//   2. A scope is a UNIFORM TAG, and "transient" is the ABSENCE of a tag rather
//      than a tag of its own. A tagged registration whose frame is not open is
//      NOT an error: it silently resolves transiently, fresh every time. That
//      silence is the hazard the next two features exist to remove.
//   3. `validateScopes` makes the hazard loud at resolution time. It is what
//      catches a CAPTIVE DEPENDENCY — a long-lived service holding a
//      shorter-lived one, whose writes then go nowhere.
//   4. `validateOnBuild` moves "can this registration even be built?" forward to
//      `build()`, and reports EVERY broken registration at once instead of
//      failing on the first one at some later resolve.
//   5. Disposal is AGGREGATED, never abort-on-first-throw: one service throwing
//      on teardown never robs its siblings of theirs.
//
// A host typically turns BOTH flags on in development and leaves them off in
// production — which is exactly how the first provider below is built.
//
// This is the tokenless half of the pair: every registration is authored as
// `addClass<IThing>(Thing)` and every lookup as `resolve<IThing>()`, and the
// build lowers each to the explicit-token form its
// ../../examples.app.without-transformer/src/lifetimes-demo.ts sibling writes by
// hand. Diff the two files: the scenario, the assertions and the printed lines
// are identical — only the authoring dialect differs. As in main.ts the
// registrations sit at the module's top level (the composition root); the
// exported entry function only builds providers, opens scopes, resolves, and
// closes them again.

import { ScopeValidationError, ServiceManifest } from '@rhombus-std/di';
import type { IServiceManifest, RegistrationValidationError, ServiceProviderOptions } from '@rhombus-std/di';

/** The scope names this application declares. `createScope` accepts only these. */
type OrderScopes = 'singleton' | 'request';

// ── the domain ───────────────────────────────────────────────────────────────

/** A pooled set of database connections: expensive to open, safe to share. */
interface IConnectionPool {
  lease(): string;
}

/** One request's unit of work — buffers that request's writes, commits on close. */
interface IOrderUnitOfWork {
  write(entry: string): void;
}

/** Publishes a request's outbound messages through that request's unit of work. */
interface IOutboxChannel {
  publish(order: string): void;
}

/** Mirrors a request's writes into the search index, in the same transaction. */
interface ISearchIndexWriter {
  index(order: string): void;
}

/** Stateless order validation. Cheap to build, so there is nothing to cache. */
interface IOrderValidator {
  validate(order: string): boolean;
}

/**
 * A process-wide report cache that holds on to a unit of work. Registering THIS
 * as a singleton is the classic captive-dependency mistake — see the
 * `validateScopes` section below. It exists here to be caught, not to be copied.
 */
interface IOrderReportCache {
  readonly heldUnitOfWork: IOrderUnitOfWork;
}

/**
 * Where each service announces its teardown, so the demonstration can show the
 * ORDER disposal actually happened in. Registered as a shared value.
 */
interface ILifecycleTrace {
  record(event: string): void;
}

// ── the implementations ──────────────────────────────────────────────────────

/** Collects teardown events in the order they occur; `take` drains and formats. */
class LifecycleTrace implements ILifecycleTrace {
  readonly #events: string[] = [];

  public record(event: string): void {
    this.#events.push(event);
  }

  /** Returns the events recorded since the last call, and resets. */
  public take(): string {
    const drained = this.#events.join(', ');
    this.#events.length = 0;
    return drained;
  }
}

/**
 * Closing a real pool drains its in-flight queries, so this one is an
 * `AsyncDisposable`. That choice is what forces the shutdown below to be
 * `await provider.disposeAsync()`: the synchronous `dispose()` runs only
 * `Symbol.dispose`.
 */
class ConnectionPool implements IConnectionPool, AsyncDisposable {
  readonly #trace: ILifecycleTrace;
  #leased = 0;

  public constructor(trace: ILifecycleTrace) {
    this.#trace = trace;
  }

  public lease(): string {
    this.#leased += 1;
    return `connection-${this.#leased}`;
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await Promise.resolve(); // stand-in for draining in-flight queries
    this.#trace.record('pool closed');
  }
}

/** Leases a connection for the life of one request and commits when it closes. */
class OrderUnitOfWork implements IOrderUnitOfWork, Disposable {
  readonly #trace: ILifecycleTrace;
  readonly #connection: string;
  readonly #entries: string[] = [];

  public constructor(pool: IConnectionPool, trace: ILifecycleTrace) {
    this.#trace = trace;
    this.#connection = pool.lease();
  }

  public write(entry: string): void {
    this.#entries.push(`${this.#connection}:${entry}`);
  }

  public [Symbol.dispose](): void {
    this.#trace.record('unit of work committed');
  }
}

/**
 * Writes its messages THROUGH the request's unit of work so they land in the
 * same transaction. That dependency is why teardown order matters: the outbox
 * must flush while the unit of work it writes into is still open, and reverse
 * construction order is exactly what guarantees it.
 */
class OutboxChannel implements IOutboxChannel, Disposable {
  readonly #unitOfWork: IOrderUnitOfWork;
  readonly #trace: ILifecycleTrace;

  public constructor(unitOfWork: IOrderUnitOfWork, trace: ILifecycleTrace) {
    this.#unitOfWork = unitOfWork;
    this.#trace = trace;
  }

  public publish(order: string): void {
    this.#unitOfWork.write(`outbox:${order}`);
  }

  public [Symbol.dispose](): void {
    this.#trace.record('outbox flushed');
  }
}

/** No state, no teardown, nothing worth caching — the shape of a transient. */
class OrderValidator implements IOrderValidator {
  public validate(order: string): boolean {
    return order.length > 0;
  }
}

/** The captive-dependency mistake, isolated so it can be caught below. */
class OrderReportCache implements IOrderReportCache {
  public readonly heldUnitOfWork: IOrderUnitOfWork;

  public constructor(unitOfWork: IOrderUnitOfWork) {
    this.heldUnitOfWork = unitOfWork;
  }
}

/**
 * A drop-in outbox whose broker connection has already dropped, so flushing it
 * throws. Same constructor shape as `OutboxChannel`, so registering it later at
 * the same service replaces it without disturbing anything else.
 */
class UnreliableOutboxChannel implements IOutboxChannel, Disposable {
  readonly #unitOfWork: IOrderUnitOfWork;
  readonly #trace: ILifecycleTrace;

  public constructor(unitOfWork: IOrderUnitOfWork, trace: ILifecycleTrace) {
    this.#unitOfWork = unitOfWork;
    this.#trace = trace;
  }

  public publish(order: string): void {
    this.#unitOfWork.write(`outbox:${order}`);
  }

  public [Symbol.dispose](): void {
    this.#trace.record('outbox flushed');
    throw new Error('outbox: broker connection reset');
  }
}

/** A search-index writer whose index was closed underneath it: closing throws. */
class UnreliableSearchIndexWriter implements ISearchIndexWriter, Disposable {
  readonly #unitOfWork: IOrderUnitOfWork;
  readonly #trace: ILifecycleTrace;

  public constructor(unitOfWork: IOrderUnitOfWork, trace: ILifecycleTrace) {
    this.#unitOfWork = unitOfWork;
    this.#trace = trace;
  }

  public index(order: string): void {
    this.#unitOfWork.write(`index:${order}`);
  }

  public [Symbol.dispose](): void {
    this.#trace.record('search index closed');
    throw new Error('search index: writer already closed');
  }
}

// ── the containers (registrations at the module's top level) ─────────────────

const requestTrace = new LifecycleTrace();

/**
 * The order-processing container. Note the three lifetimes side by side:
 * `.as<'singleton'>()`, `.as<'request'>()`, and — for the validator — no `.as()`
 * at all. There is no `"transient"` tag to write: transient IS the absence of a
 * tag. The manifest is immutable, so the whole chain is ONE expression and its
 * RESULT is what carries the registrations.
 */
const orderServices: IServiceManifest<OrderScopes> = new ServiceManifest<OrderScopes>()
  .addValue<ILifecycleTrace>(requestTrace)
  .addClass<IConnectionPool>(ConnectionPool).as<'singleton'>()
  .addClass<IOrderUnitOfWork>(OrderUnitOfWork).as<'request'>()
  .addClass<IOutboxChannel>(OutboxChannel).as<'request'>()
  .addClass<IOrderValidator>(OrderValidator);

const captiveTrace = new LifecycleTrace();

/**
 * The same container plus the captive mistake — a SINGLETON report cache whose
 * constructor takes a "request"-scoped unit of work. Derived from
 * `orderServices` rather than rebuilt: registering onto an existing manifest
 * hands back a NEW one and leaves the original untouched, so the correct
 * container above is unaffected. Its own trace is registered over the shared one
 * (a later registration of the same service wins) so this container's teardown
 * never lands in the request container's trace.
 */
const captiveServices: IServiceManifest<OrderScopes> = orderServices
  .addValue<ILifecycleTrace>(captiveTrace)
  .addClass<IOrderReportCache>(OrderReportCache).as<'singleton'>();

const incompleteTrace = new LifecycleTrace();

/**
 * A container with a genuine wiring mistake: the unit of work needs a connection
 * pool and nobody registered one. Without `validateOnBuild` this builds happily
 * and only fails at the first request that needs it.
 */
const incompleteServices: IServiceManifest<OrderScopes> = new ServiceManifest<OrderScopes>()
  .addValue<ILifecycleTrace>(incompleteTrace)
  .addClass<IOrderUnitOfWork>(OrderUnitOfWork).as<'request'>();

const flakyTrace = new LifecycleTrace();

/**
 * The order container with two teardowns that fail — a broker that has already
 * dropped the connection, and a search index that has already been closed. Both
 * are "request"-scoped, so ONE request frame ends up owning three disposables of
 * which two throw.
 */
const flakyShutdownServices: IServiceManifest<OrderScopes> = orderServices
  .addValue<ILifecycleTrace>(flakyTrace)
  .addClass<IOutboxChannel>(UnreliableOutboxChannel).as<'request'>()
  .addClass<ISearchIndexWriter>(UnreliableSearchIndexWriter).as<'request'>();

/**
 * How a host should build its provider in DEVELOPMENT. Both flags default to
 * `false`, which is the right production setting — the checks cost time on every
 * resolve and every build. Turning them on while developing is what converts the
 * two silent lifetime hazards below into loud, early failures.
 */
const developmentOptions: ServiceProviderOptions = {
  validateScopes: true,
  validateOnBuild: true,
};

// ── the demonstration ────────────────────────────────────────────────────────

/**
 * Runs every lifetime / scope / disposal demonstration and returns the report
 * lines for the caller to print. Nothing here is time-, order- or
 * environment-dependent: the same run produces the same lines every time.
 */
export async function demonstrateLifetimes(): Promise<readonly string[]> {
  const lines: string[] = ['=== di lifetimes and disposal — with transformer ==='];

  // ── 1. two requests in one process ─────────────────────────────────────────
  //
  // `build()` returns a FRAMELESS provider — no scope is open yet, so nothing
  // caches. Opening the "singleton" frame is what gives singleton-tagged
  // registrations somewhere to live, and each request opens a "request" frame
  // beneath it. Both validation flags are on: this is how a host is configured
  // in development, and a correct graph passes both.
  const provider = orderServices.build(developmentOptions);
  const root = provider.createScope('singleton');

  // Request 1. The validator carries no scope tag, so every resolve builds a
  // fresh one — there is no frame anywhere that could cache it.
  const requestOne = root.createScope('request');

  // A provider knows the name of the frame it was opened with — that name IS
  // the lifetime tag a registration has to match to be cached here.
  const rootScopeName = root.name;
  const requestScopeName = requestOne.name;

  const validatorA = requestOne.resolve<IOrderValidator>();
  const validatorB = requestOne.resolve<IOrderValidator>();
  validatorA.validate('order-1');
  const validatorInstances = new Set([validatorA, validatorB]).size;

  // Resolving the outbox constructs its unit of work FIRST (it is a dependency)
  // and the outbox second, so the request frame owns them in that order.
  const outboxOne = requestOne.resolve<IOutboxChannel>();
  const unitOfWorkOne = requestOne.resolve<IOrderUnitOfWork>();
  const poolOne = requestOne.resolve<IConnectionPool>();
  outboxOne.publish('order-1');

  // Closing the request disposes exactly what the REQUEST frame owns, in reverse
  // construction order: the outbox flushes while the unit of work it writes into
  // is still open, and only then does the unit of work commit. The pool belongs
  // to the enclosing "singleton" frame and is left alone.
  requestOne.dispose();
  const requestOneTeardown = requestTrace.take();

  // Request 2 — a whole new "request" frame, so a whole new unit of work. The
  // pool resolves from the same enclosing frame, so it is the same instance.
  const requestTwo = root.createScope('request');
  const outboxTwo = requestTwo.resolve<IOutboxChannel>();
  const unitOfWorkTwo = requestTwo.resolve<IOrderUnitOfWork>();
  const poolTwo = requestTwo.resolve<IConnectionPool>();
  outboxTwo.publish('order-2');
  requestTwo.dispose();
  const requestTwoTeardown = requestTrace.take();

  const distinctUnitsOfWork = unitOfWorkOne !== unitOfWorkTwo;
  const sharedPool = poolOne === poolTwo;

  // Shutdown. Closing a frame does NOT cascade into the frames opened beneath it
  // — each scope is closed by whoever opened it, which is why both requests were
  // closed above. The pool is an `AsyncDisposable`, so the root frame is closed
  // with `disposeAsync`.
  await root.disposeAsync();
  const shutdownTeardown = requestTrace.take();

  lines.push(
    `open frames: "${rootScopeName}" > "${requestScopeName}"`,
    `request 1: 2 validator resolves -> ${validatorInstances} instances (no scope tag = transient)`,
    `request 1 closed -> ${requestOneTeardown}`,
    `request 2 closed -> ${requestTwoTeardown}`,
    `each request had its own unit of work: ${distinctUnitsOfWork}; both shared one pool: ${sharedPool}`,
    `shutdown -> ${shutdownTeardown}`,
  );

  // ── 2. a tag with no open frame is not an error ────────────────────────────
  //
  // Straight off `build()` there is no "singleton" frame, so the pool has no
  // owner and falls back to transient — a fresh pool per resolve, silently. A
  // frameless provider owns nothing, so it has nothing to dispose either.
  const frameless = orderServices.build();
  const framelessPools = new Set([
    frameless.resolve<IConnectionPool>(),
    frameless.resolve<IConnectionPool>(),
  ]).size;

  // With no frame open there is no frame NAME either — `provider.name` reports
  // which frame this provider is, and a provider straight out of `build()` is
  // not any frame at all.
  let framelessHasNoScopeName = false;
  try {
    const probed = frameless.name;
    framelessHasNoScopeName = probed.length === 0;
  } catch {
    framelessHasNoScopeName = true;
  }

  lines.push(
    `a "singleton" tag with no open frame is not an error: 2 resolves -> ${framelessPools} pools`,
    `  ...because build() opens no frame at all: it has no scope name (${framelessHasNoScopeName})`,
  );

  // ── 3. the captive dependency ──────────────────────────────────────────────
  //
  // A SINGLETON that takes a "request"-scoped dependency. A service is always
  // constructed relative to the frame that OWNS it, and the singleton frame has
  // no "request" frame in its chain — so the dependency falls back to a
  // transient nobody else can see. The cache then serves every request from a
  // unit of work belonging to no request at all, whose writes are never
  // committed by any request's teardown.
  const lenient = captiveServices.build();
  const lenientRoot = lenient.createScope('singleton');
  const lenientRequest = lenientRoot.createScope('request');
  const requestUnitOfWork = lenientRequest.resolve<IOrderUnitOfWork>();
  const cache = lenientRequest.resolve<IOrderReportCache>();
  const heldByNoRequest = cache.heldUnitOfWork !== requestUnitOfWork;
  lenientRequest.dispose();
  await lenientRoot.disposeAsync();
  captiveTrace.take();

  // The same container with `validateScopes` on. The check fires at the moment
  // the dependency would have gone silently transient, and the error names both
  // parties: who was about to capture, and what they were about to capture.
  const strict = captiveServices.build({ validateScopes: true });
  const strictRoot = strict.createScope('singleton');
  const strictRequest = strictRoot.createScope('request');
  let captiveReport = 'no error — the captive dependency went unnoticed';
  try {
    strictRequest.resolve<IOrderReportCache>();
  } catch (error) {
    if (!(error instanceof ScopeValidationError)) {
      throw error;
    }
    captiveReport = `${error.name}: a "${error.consumer?.scope ?? '?'}" consumer `
      + `cannot hold a "${error.scope}" service`;
  }
  strictRequest.dispose();
  await strictRoot.disposeAsync();
  captiveTrace.take();

  lines.push(
    'captive dependency (a singleton holding a request-scoped unit of work):',
    `  build() plain             -> held a unit of work owned by no request: ${heldByNoRequest}`,
    `  build({ validateScopes }) -> ${captiveReport}`,
  );

  // ── 4. the forgotten registration ──────────────────────────────────────────
  //
  // Without `validateOnBuild` a missing dependency is invisible until the first
  // request that needs it — in production that is a runtime incident rather than
  // a startup failure.
  const lateProvider = incompleteServices.build();
  const lateRoot = lateProvider.createScope('singleton');
  const lateRequest = lateRoot.createScope('request');
  let lateFailure = 'nothing — the missing pool went unnoticed';
  try {
    lateRequest.resolve<IOrderUnitOfWork>();
  } catch (error) {
    lateFailure = error instanceof Error ? error.name : String(error);
  }
  lateRequest.dispose();
  await lateRoot.disposeAsync();

  // With it on, `build()` dry-runs EVERY sealed registration and collects the
  // failures: one `AggregateError`, one wrapped error per broken registration,
  // each carrying the underlying cause. A graph with five mistakes reports five,
  // not just whichever one a request happened to reach first.
  let earlyFailure = 'nothing — build() accepted the broken graph';
  try {
    incompleteServices.build({ validateOnBuild: true });
  } catch (error) {
    if (!(error instanceof AggregateError)) {
      throw error;
    }
    const wrapped = error.errors[0] as RegistrationValidationError;
    const cause = wrapped.cause instanceof Error ? wrapped.cause.name : 'unknown';
    earlyFailure = `AggregateError naming ${error.errors.length} broken registration (${cause})`;
  }

  lines.push(
    'a dependency that was never registered:',
    `  build() plain              -> built fine; the first resolve threw ${lateFailure}`,
    `  build({ validateOnBuild }) -> ${earlyFailure}`,
  );

  // ── 5. aggregated disposal ─────────────────────────────────────────────────
  //
  // The request frame owns three disposables and two of them throw. Every
  // teardown is still ATTEMPTED — the unit of work commits even though both
  // flushes failed, which is the whole point of aggregating: a broken resource
  // must not take the working ones down with it. A single failure rethrows as
  // itself; two or more arrive as one `AggregateError`.
  const flaky = flakyShutdownServices.build();
  const flakyRoot = flaky.createScope('singleton');
  const flakyRequest = flakyRoot.createScope('request');
  flakyRequest.resolve<IOutboxChannel>();
  flakyRequest.resolve<ISearchIndexWriter>();

  let aggregateReport = 'no error — both failing teardowns were swallowed';
  try {
    flakyRequest.dispose();
  } catch (error) {
    if (!(error instanceof AggregateError)) {
      throw error;
    }
    aggregateReport = `${error.name} carrying ${error.errors.length} failures`;
  }
  const flakyTeardown = flakyTrace.take();
  await flakyRoot.disposeAsync();
  flakyTrace.take();

  lines.push(
    'disposal is aggregated, never abort-on-first-throw:',
    `  every teardown still ran -> ${flakyTeardown}`,
    `  the caller got ${aggregateReport}`,
  );

  return lines;
}
