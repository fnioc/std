// A tour of the di REGISTRATION surface, authored WITH the transformer: every
// service type is DERIVED from the type it names, and no token string appears
// anywhere. The explicit forms in
// ../../examples.app.without-transformer/src/registration-demo.ts are the
// PRIMARY surface; the calls below are sugar for exactly those, and the two
// print the same report.
//
// THE SCENARIO: an order-shipping notifier. A notification goes to a message
// SINK, and an AUDIT LOG records what was sent. Every registration verb below
// earns its place in that one story rather than standing alone.
//
// The demo builds its own container instead of registering into the host's, so
// it reads top-to-bottom and can be run from anywhere in the app.
//
// ── the two things to take away ──────────────────────────────────────────────
//
// 1. THE MANIFEST IS IMMUTABLE. Every verb returns a NEW manifest and leaves
//    the receiver alone, so a call whose result is discarded registers NOTHING.
//    Thread it: `services = services.add(...)`. `demonstrateDiscardTrap`
//    below shows the failure mode on purpose.
// 2. A CONSTRUCTOR TYPE IS ALWAYS STATED, never inferred. `typefor<T>()`
//    derives the TYPE an argument names; it does not read a constructor and
//    guess the argument list, so "this class takes no dependencies" is still
//    written `Type.ctor(theServiceType, [[]])` — one overload, taking nothing beyond
//    the address.

import { di } from '@rhombus-std/di';
import { DefaultManifest, LifetimeModel, Type } from '@rhombus-std/di.core';
import type { ImportedType, Manifest, ServiceDescriptor } from '@rhombus-std/di.core';
// The type-driven MINT primitive, and the whole of what this dialect is:
// `typefor<T>()` becomes the very `Type` a hand author composes by name. It has
// no runtime footprint — the build folds every call and elides this import with
// them — so the shipped output is exactly what the manual twin wrote out.
import { typefor } from '@rhombus-std/primitives.extras';

// ── the domain ───────────────────────────────────────────────────────────────

/** Reads the current time. Registered as an already-built VALUE. */
interface IClock {
  now(): string;
}

/**
 * A third-party package's own clock port. Structurally identical to `IClock`,
 * but a DIFFERENT type — which is the whole reason `VendorSink` below needs its
 * dependency slot pointed somewhere by hand.
 */
interface ILegacyClock {
  now(): string;
}

/** Where a notification goes. Several implementations compete for this one port. */
interface IMessageSink {
  readonly name: string;
  send(message: string): string;
}

/**
 * Per-application email settings. DELIBERATELY never registered — it is what
 * makes `EmailSink`'s two-slot overload unsatisfiable, so the engine falls back
 * to the one-slot overload and the sink uses its built-in default address.
 */
interface IEmailOptions {
  readonly address: string;
}

/** Records what was sent, echoing to a sink when the container has one. */
interface IAuditLog {
  record(line: string): void;
  readonly entries: readonly string[];
}

/**
 * A metrics recorder. Also never registered — it is one member of the notifier's
 * union slot, so resolution settles on the audit log instead.
 */
interface IMetricsRecorder {
  count(name: string): void;
}

/** The service the whole scenario exists to build. */
interface IOrderNotifier {
  notify(orderId: string): string;
}

/** A plain settings bag, registered under its own token. */
class FeatureFlags {
  public readonly echoToSink = true;
}

// ── the implementations ──────────────────────────────────────────────────────

/** A deterministic clock — this demo's output is byte-compared, so no `Date`. */
class FixedClock implements IClock, ILegacyClock {
  public now(): string {
    return '2024-05-01T09:00:00Z';
  }
}

/**
 * The default sink. Its second constructor parameter is a plain string that no
 * container could resolve, so its signature supplies it DIRECTLY as a literal
 * slot (`Type.typeLiteral('production')`) instead of as a service type — no
 * lookup happens.
 */
class PlainTextSink implements IMessageSink {
  public readonly name = 'text';
  readonly #clock: IClock;
  readonly #environment: string;

  public constructor(clock: IClock, environment: 'production') {
    this.#clock = clock;
    this.#environment = environment;
  }

  public send(message: string): string {
    return `[${this.#environment}] ${this.#clock.now()} ${message}`;
  }
}

/**
 * The keyed sink. Two injectable overloads are registered for it: the richer
 * `[clock, options]` one and a `[clock]` fallback. `IEmailOptions` is never
 * registered, so the richer one is unsatisfiable and the fallback wins.
 */
class EmailSink implements IMessageSink {
  public readonly name = 'email';
  readonly #clock: IClock;
  readonly #address: string;

  public constructor(clock: IClock, options?: IEmailOptions) {
    this.#clock = clock;
    this.#address = options?.address ?? 'orders@example.test';
  }

  public send(message: string): string {
    return `to:${this.#address} ${this.#clock.now()} ${message}`;
  }
}

/**
 * A sink from a package we cannot edit: its constructor asks for the vendor's
 * own `ILegacyClock` port, which this application never registers under that
 * name. We point the slot at our own keyed clock registration instead — the
 * signature is ours to write, so adapting a third-party class costs one token.
 */
class VendorSink implements IMessageSink {
  public readonly name = 'vendor';
  readonly #clock: ILegacyClock;

  public constructor(clock: ILegacyClock) {
    this.#clock = clock;
  }

  public send(message: string): string {
    return `vendor ${this.#clock.now()} ${message}`;
  }
}

/** Captures what it is given, so a host can assert on it instead of formatting. */
class RecordingSink implements IMessageSink {
  public readonly name = 'recording';
  public readonly captured: string[] = [];

  public send(message: string): string {
    this.captured.push(message);
    return message;
  }
}

/**
 * The audit log. Its `sink` parameter is OPTIONAL, which is the honest way to
 * say "use one if the container has one". That is expressed in the signature as
 * a UNION whose other member is the literal `undefined` — a member that supplies
 * itself, so the slot is always satisfiable and simply yields `undefined` when
 * no sink is registered.
 */
class AuditLog implements IAuditLog {
  readonly #clock: IClock;
  readonly #sink: IMessageSink | undefined;
  readonly #entries: string[] = [];

  public constructor(clock: IClock, sink?: IMessageSink) {
    this.#clock = clock;
    this.#sink = sink;
  }

  public record(line: string): void {
    this.#entries.push(`${this.#clock.now()} ${line}`);
    this.#sink?.send(`audit ${line}`);
  }

  public get entries(): readonly string[] {
    return this.#entries;
  }
}

/**
 * The notifier factory. `recorder` takes either a metrics recorder or the audit
 * log — a genuine either/or, registered as a union slot.
 */
function makeOrderNotifier(sink: IMessageSink, recorder?: IMetricsRecorder | IAuditLog): IOrderNotifier {
  return { notify(orderId: string): string {
    const message = sink.send(`${orderId} shipped`);
    if (recorder !== undefined && 'record' in recorder) {
      recorder.record(message);
    }
    return message;
  } };
}

// ── the service types ────────────────────────────────────────────────────────

// Each one is derived from the declaration above it, so a rename moves the
// service type with the type it names and the two can never drift apart. The
// manual twin writes the same values out by name.
const CLOCK_TYPE = typefor<IClock>() as ImportedType;
const SINK_TYPE = typefor<IMessageSink>() as ImportedType;
const EMAIL_OPTIONS_TYPE = typefor<IEmailOptions>();
const AUDIT_TYPE = typefor<IAuditLog>();
const METRICS_TYPE = typefor<IMetricsRecorder>();
const NOTIFIER_TYPE = typefor<IOrderNotifier>() as ImportedType;
const FLAGS_TYPE = typefor<FeatureFlags>();

// A KEY is a TAG ON the service type rather than a parallel lookup: `Type.tag`
// composes one type that carries it, so a keyed request hits exactly the same
// exact-match lookup an unkeyed one does. A key is a runtime string with no type
// to derive it from, so this composition is written out in both dialects.
const VENDOR_CLOCK_TYPE = Type.tag(CLOCK_TYPE, 'vendor');
const EMAIL_SINK_TYPE = Type.tag(SINK_TYPE, 'email');

// The library-defaults scenario needs its own service types rather than the
// application's, so that the descriptor verbs below can register, override and
// strip them without touching the container the rest of the chapter builds. They
// are tagged rather than separately declared: a tag makes one more type out of a
// type that already exists.
const DEFAULT_CLOCK_TYPE = Type.tag(CLOCK_TYPE, 'defaults');
const DEFAULT_SINK_TYPE = Type.tag(SINK_TYPE, 'defaults');
const DEFAULT_NOTIFIER_TYPE = Type.tag(NOTIFIER_TYPE, 'defaults');

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Counts the registrations bound to `type`. A manifest is an
 * `Iterable<ServiceDescriptor>`, so this is the honest way to observe what a
 * chain of verbs actually recorded — no build, no resolution. Types are
 * INTERNED, so two spellings of one type are one object and `===` is the whole
 * comparison.
 */
function countRegistrations(services: Iterable<ServiceDescriptor<unknown>>, type: Type): number {
  let count = 0;
  for (const descriptor of services) {
    if (descriptor.serviceType === type) {
      count += 1;
    }
  }
  return count;
}

// ── 1. the immutability trap ─────────────────────────────────────────────────

/**
 * Shows, on purpose, the one mistake this API makes easy to catch: a
 * registration call whose result is thrown away registers nothing. The manifest
 * is a frozen chain — every verb wraps the receiver in a NEW node — so the only
 * way to keep a registration is to keep the value it returns.
 */
function demonstrateDiscardTrap(): string {
  const empty = new DefaultManifest<unknown>(LifetimeModel.noop);

  // WRONG — the new manifest is built and immediately dropped on the floor.
  // `empty` is exactly as empty as it was. This compiles, and it is silent.
  empty.add(FLAGS_TYPE, FeatureFlags, Type.ctor(FLAGS_TYPE, [[]]), 'singleton');

  // RIGHT — thread the result back in.
  const threaded = empty.add(FLAGS_TYPE, FeatureFlags, Type.ctor(FLAGS_TYPE, [[]]), 'singleton');

  return `immutability: the discarded call registered ${countRegistrations(empty, FLAGS_TYPE)}, `
    + `the threaded one registered ${countRegistrations(threaded, FLAGS_TYPE)}`;
}

// ── 2. the library's defaults, and a host overriding them ────────────────────

/**
 * What a library ships: registrations an application gets for free. Every verb
 * here is a `tryAdd` — "register this only if nobody already has" — which is
 * what makes calling it twice, or calling it after the application wired its
 * own implementation, harmless. Under an immutable manifest the
 * already-registered branch simply hands the receiver back, so the caller
 * threads the result either way.
 *
 * The scope union is generic so any application union works, and `| 'singleton'`
 * states the one scope these defaults register at.
 *
 * @param services The application's registration builder.
 */
function addOrderDefaults<S>(
  services: Manifest<S | 'singleton'>,
): Manifest<S | 'singleton'> {
  // A default VALUE — the clock every other default depends on.
  services = services.tryAdd(DEFAULT_CLOCK_TYPE, new FixedClock());
  // A default CLASS.
  services = services.tryAdd(DEFAULT_SINK_TYPE, PlainTextSink, Type.ctor(DEFAULT_SINK_TYPE, [[DEFAULT_CLOCK_TYPE, Type.typeLiteral('production')]]), 'singleton' as S | 'singleton');
  // A default FACTORY.
  services = services.tryAdd(DEFAULT_NOTIFIER_TYPE, makeOrderNotifier, Type.func(DEFAULT_NOTIFIER_TYPE, [[DEFAULT_SINK_TYPE]]), 'singleton' as S | 'singleton');
  return services;
}

/**
 * The descriptor verbs, in the order a real application meets them:
 *
 *   - `tryAdd`   — IDEMPOTENT DEFAULTS. A library registers only what is
 *                  missing, so applying its defaults twice, or applying them
 *                  after the application registered its own, changes nothing.
 *   - `replace`  — HOST OVERRIDE. The application wants ITS implementation to
 *                  be the only one at that type: drop what is there, register
 *                  anew. (A plain `add` would leave both, and collection
 *                  resolution would see the loser too.)
 *   - `removeAll`— TEARDOWN. Strip a type back to nothing, which is what a
 *                  test host or a "no default providers" switch needs.
 *
 * None of these has a type-driven form, so this function is IDENTICAL in the
 * with-transformer app.
 */
function demonstrateDescriptorVerbs(): string[] {
  const lines: string[] = [];

  // Applying the defaults twice leaves exactly one of each.
  let library: Manifest<unknown> = new DefaultManifest<unknown>(LifetimeModel.noop);
  library = addOrderDefaults(library);
  library = addOrderDefaults(library);
  lines.push(
    `defaults: applying them twice leaves ${countRegistrations(library, DEFAULT_SINK_TYPE)} sink `
      + `(tryAdd only registers what is missing)`,
  );

  // An application that already wired its own sink keeps it.
  let application: Manifest<unknown> = new DefaultManifest<unknown>(LifetimeModel.noop);
  application = application.add(DEFAULT_SINK_TYPE, RecordingSink, Type.ctor(DEFAULT_SINK_TYPE, [[]]), 'singleton');
  application = addOrderDefaults(application);
  const kept = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(application).build()
    .getRequiredService(DEFAULT_SINK_TYPE) as IMessageSink;
  lines.push(`defaults: an application that registered its own sink keeps it (${kept.name})`);

  // The host overrides all three defaults outright.
  let host = addOrderDefaults(new DefaultManifest<unknown>(LifetimeModel.noop));
  host = host.replace(DEFAULT_CLOCK_TYPE, new FixedClock());
  host = host.replace(DEFAULT_SINK_TYPE, RecordingSink, Type.ctor(DEFAULT_SINK_TYPE, [[]]), 'singleton');
  host = host.replace(DEFAULT_NOTIFIER_TYPE, makeOrderNotifier, Type.func(DEFAULT_NOTIFIER_TYPE, [[DEFAULT_SINK_TYPE]]), 'singleton');
  const hostProvider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(host).build();
  const recorder = hostProvider.getRequiredService(DEFAULT_SINK_TYPE) as RecordingSink;
  lines.push(
    `override: replace swapped all three defaults; the host sink is ${recorder.name}, and `
      + `${countRegistrations(host, DEFAULT_SINK_TYPE)} registration is left at its type`,
  );

  // Teardown strips the type completely.
  const stripped = host.removeAll(DEFAULT_SINK_TYPE);
  lines.push(
    `teardown: removeAll left ${countRegistrations(stripped, DEFAULT_SINK_TYPE)} sinks on the new manifest, `
      + `and ${countRegistrations(host, DEFAULT_SINK_TYPE)} on the original (nothing mutates)`,
  );

  return lines;
}

// ── 3. the application container ─────────────────────────────────────────────

/**
 * Registers the whole scenario. Read it as one pass down the registration
 * surface: a value (twice, once keyed), two sinks sharing one type plus a keyed
 * third, an optional dependency, a factory with two overloads, and a
 * zero-dependency class.
 */
function buildOrderContainer(): Manifest<unknown> {
  let services: Manifest<unknown> = new DefaultManifest<unknown>(LifetimeModel.noop);
  const clock = new FixedClock();

  // A value — an already-built instance. No signature (there is nothing to
  // construct) and no scope (a value IS its instance, so caching is moot).
  services = services.add(CLOCK_TYPE, clock);

  // The SAME instance again under a KEYED type. The key rides the type itself:
  // registering at the tagged `VENDOR_CLOCK_TYPE` composed above is all a keyed
  // registration is.
  services = services.add(VENDOR_CLOCK_TYPE, clock);

  // A third-party class adapted onto our own clock: its constructor names the
  // vendor's `ILegacyClock`, but the composed constructor type is ours to
  // write, so the argument simply names the keyed clock registered above.
  services = services.add(SINK_TYPE, VendorSink, Type.ctor(SINK_TYPE, [[VENDOR_CLOCK_TYPE]]), 'singleton');

  // The 4-argument constructor form: serviceType, ctor, implementerType, scope. The second
  // argument is a LITERAL — its value is injected verbatim, with no container
  // lookup.
  //
  // This lands at the SAME type as the vendor sink above. Registering twice at
  // one type is legal and useful — a collection request sees both — and a single
  // request takes the MOST RECENTLY registered one, so this is the sink the rest
  // of the scenario gets.
  services = services.add(SINK_TYPE, PlainTextSink, Type.ctor(SINK_TYPE, [[CLOCK_TYPE, Type.typeLiteral('production')]]), 'singleton');

  // TWO OVERLOADS for one class, and a KEY — the tagged address. Each parameter row is one
  // constructor overload, and the engine takes the first whose every argument it
  // can supply, longest row first: the two-argument row needs `IEmailOptions`,
  // which nothing registers, so the single-argument row wins and the sink falls
  // back to its built-in address.
  services = services.add(Type.tag(SINK_TYPE, 'email'), EmailSink, Type.ctor({ instance: SINK_TYPE, signatures: [[CLOCK_TYPE, EMAIL_OPTIONS_TYPE], [CLOCK_TYPE]] }), 'singleton');

  // An OPTIONAL dependency, spelled honestly: a union whose other member is the
  // literal `undefined`. A literal member supplies ITSELF rather than competing
  // for the argument, so this yields the sink when one is registered and
  // `undefined` when none is — and the argument is never unsatisfiable.
  services = services.add(AUDIT_TYPE, AuditLog, Type.ctor(AUDIT_TYPE, [[CLOCK_TYPE, Type.union(SINK_TYPE, Type.typeLiteral(undefined))]]), 'singleton');

  // The same shape on a FACTORY, whose second argument is a union of two
  // SERVICES plus the literal `undefined`. Only the audit log is registered, so
  // exactly one member can be supplied and the argument settles on it without
  // ambiguity.
  services = services.add(NOTIFIER_TYPE, makeOrderNotifier, Type.func(NOTIFIER_TYPE, [[SINK_TYPE, Type.union(METRICS_TYPE, AUDIT_TYPE, Type.typeLiteral(undefined))]]), 'singleton');

  // A zero-dependency class: a composed constructor type that carries no
  // argument types beyond the address.
  services = services.add(FLAGS_TYPE, FeatureFlags, Type.ctor(FLAGS_TYPE, [[]]), 'singleton');

  return services;
}

/**
 * The other way to spell a registration: a chain opened at `describe`, walked
 * step by step. Each step returns a NEW node — the same rule the manifest
 * itself follows — and once an implementer door is taken the node IS a
 * ServiceDescriptor, so the finished chain hands straight to the
 * descriptor-taking `add`, sits in a variable, or travels between helpers.
 */
function demonstrateDescribedRegistration(): string {
  const withClock: Manifest<unknown> = new DefaultManifest<unknown>(LifetimeModel.noop).add(CLOCK_TYPE, new FixedClock());
  const services = withClock.add(
    withClock.describe(SINK_TYPE)
      .asClass(PlainTextSink, Type.ctor(SINK_TYPE, [[CLOCK_TYPE, Type.typeLiteral('staging')]]))
      .withLifetime('singleton'),
  );

  const sink = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build()
    .getRequiredService(SINK_TYPE) as IMessageSink;
  return `described by chain: ${sink.send('order-99 shipped')}`;
}

/** Exercises the container and reports what each registration produced. */
function describeOrderContainer(services: Manifest<unknown>): string[] {
  // The front door: every genesis starts by choosing the lifetime model, then
  // seeds the manifest this file already built.
  const app = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build();

  const notifier = app.getRequiredService(NOTIFIER_TYPE) as IOrderNotifier;
  const audit = app.getRequiredService(AUDIT_TYPE) as IAuditLog;
  const email = app.getRequiredService(EMAIL_SINK_TYPE) as IMessageSink;
  const vendorClock = app.getRequiredService(VENDOR_CLOCK_TYPE) as IClock;
  const flags = app.getRequiredService(FLAGS_TYPE) as FeatureFlags;

  // The optional sink slot found a sink, so the entry the audit log records is
  // echoed to it as well as kept.
  audit.record('order-42 shipped');

  return [`notify: ${notifier.notify('order-42')}`, `audit: ${audit.entries.length} entry, sink echo enabled=${flags.echoToSink}`, `keyed sink (key "email"): ${email.send('welcome')}`,
    `keyed value (key "vendor"): ${vendorClock.now()}`, `${countRegistrations(services, SINK_TYPE)} sinks share the IMessageSink type; the most recently `
    + `registered one wins a single request, and all of them answer a collection request `
    + `(${[...app.getServices(SINK_TYPE)].length})`];
}

/**
 * Forks the container with every sink removed. The audit log's optional sink
 * slot falls through to `undefined` rather than failing, and — because nothing
 * mutates — the container it was forked from still has all of its sinks.
 */
function describeSinklessFork(services: Manifest<unknown>): string {
  const noSinks = services.removeAll(SINK_TYPE);
  const audit = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(noSinks).build()
    .getRequiredService(AUDIT_TYPE) as IAuditLog;
  audit.record('order-42 shipped');

  return `fork: removeAll left ${countRegistrations(noSinks, SINK_TYPE)} sinks (the original still has `
    + `${countRegistrations(services, SINK_TYPE)}), so the audit log's optional sink slot resolved to `
    + `undefined and it recorded ${audit.entries.length} entry anyway`;
}

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * Runs the whole registration tour and returns a deterministic report, leaving
 * the caller to decide where the lines go. The with-transformer app returns the
 * same body from the type-driven dialect.
 */
export function demonstrateRegistration(): readonly string[] {
  const services = buildOrderContainer();

  return ['=== di registration — with transformer ===', demonstrateDiscardTrap(), ...demonstrateDescriptorVerbs(), ...describeOrderContainer(services), demonstrateDescribedRegistration(),
    describeSinklessFork(services)];
}
