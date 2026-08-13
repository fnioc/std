// A tour of the di REGISTRATION surface, authored WITHOUT the transformer:
// every token is hand-written and every dependency signature is spelled out.
// This is the PRIMARY surface — the type-driven forms in
// ../../examples.app.with-transformer/src/registration-demo.ts are sugar for
// exactly the calls below, and the two print the same report.
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
//    Thread it: `services = services.addClass(...)`. `demonstrateDiscardTrap`
//    below shows the failure mode on purpose.
// 2. A SIGNATURE IS ALWAYS STATED, never inferred. Without the transformer
//    there is nothing to derive a dependency list from, so "this class takes no
//    dependencies" is written `[[]]` — one overload, taking nothing.

import { DefaultManifest, Type } from '@rhombus-std/di.core';
import type { Manifest, ServiceDescriptor } from '@rhombus-std/di.core';
import '@rhombus-std/di';

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

// A hand author picks these token strings; they only have to be stable and
// unique. These are short for readability. When you need to INTEROPERATE with
// registrations the transformer produced, compose the same Type it derives
// instead — see examples.lib.without-transformer/src/types.ts.
const CLOCK_TYPE = Type.from('orders:IClock');
const SINK_TYPE = Type.from('orders:IMessageSink');
const EMAIL_OPTIONS_TYPE = Type.from('orders:IEmailOptions');
const AUDIT_TYPE = Type.from('orders:IAuditLog');
const METRICS_TYPE = Type.from('orders:IMetricsRecorder');
const NOTIFIER_TYPE = Type.from('orders:IOrderNotifier');
const FLAGS_TYPE = Type.from('orders:FeatureFlags');

// A KEY is a TAG ON the service type rather than a parallel lookup: `Type.tag`
// composes one type that carries it, so a keyed request hits exactly the same
// exact-match lookup an unkeyed one does.
const VENDOR_CLOCK_TYPE = Type.tag(CLOCK_TYPE, 'vendor');
const EMAIL_SINK_TYPE = Type.tag(SINK_TYPE, 'email');

// The library-defaults scenario keeps its own namespace, so the descriptor
// verbs below name types this file owns end-to-end.
const DEFAULT_CLOCK_TYPE = Type.from('orders.defaults:IClock');
const DEFAULT_SINK_TYPE = Type.from('orders.defaults:IMessageSink');
const DEFAULT_NOTIFIER_TYPE = Type.from('orders.defaults:IOrderNotifier');

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Counts the registrations bound to `type`. A manifest is an
 * `Iterable<ServiceDescriptor>`, so this is the honest way to observe what a
 * chain of verbs actually recorded — no build, no resolution. Types are
 * INTERNED, so two spellings of one type are one object and `===` is the whole
 * comparison.
 */
function countRegistrations(services: Iterable<ServiceDescriptor<string>>, type: Type): number {
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
  const empty = new DefaultManifest<'singleton'>();

  // WRONG — the new manifest is built and immediately dropped on the floor.
  // `empty` is exactly as empty as it was. This compiles, and it is silent.
  empty.addClass(FLAGS_TYPE, FeatureFlags, [[]], 'singleton');

  // RIGHT — thread the result back in.
  const threaded = empty.addClass(FLAGS_TYPE, FeatureFlags, [[]], 'singleton');

  return `immutability: the discarded call registered ${countRegistrations(empty, FLAGS_TYPE)}, `
    + `the threaded one registered ${countRegistrations(threaded, FLAGS_TYPE)}`;
}

// ── 2. the library's defaults, and a host overriding them ────────────────────

/**
 * What a library ships: registrations an application gets for free. Every verb
 * here is a `tryAdd*` — "register this only if nobody already has" — which is
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
function addOrderDefaults<S extends string>(
  services: Manifest<S | 'singleton'>,
): Manifest<S | 'singleton'> {
  // A default VALUE — the clock every other default depends on.
  services = services.tryAddValue(DEFAULT_CLOCK_TYPE, new FixedClock());
  // A default CLASS.
  services = services.tryAddClass(DEFAULT_SINK_TYPE, PlainTextSink, [[DEFAULT_CLOCK_TYPE,
    Type.typeLiteral('production')]], 'singleton');
  // A default FACTORY.
  services = services.tryAddFactory(DEFAULT_NOTIFIER_TYPE, makeOrderNotifier, [[DEFAULT_SINK_TYPE]], 'singleton');
  return services;
}

/**
 * The descriptor verbs, in the order a real application meets them:
 *
 *   - `tryAdd*`  — IDEMPOTENT DEFAULTS. A library registers only what is
 *                  missing, so applying its defaults twice, or applying them
 *                  after the application registered its own, changes nothing.
 *   - `replace*` — HOST OVERRIDE. The application wants ITS implementation to
 *                  be the only one at that type: drop what is there, register
 *                  anew. (Plain `addClass` would leave both, and collection
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
  let library: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
  library = addOrderDefaults(library);
  library = addOrderDefaults(library);
  lines.push(
    `defaults: applying them twice leaves ${countRegistrations(library, DEFAULT_SINK_TYPE)} sink `
      + `(tryAdd* only registers what is missing)`,
  );

  // An application that already wired its own sink keeps it.
  let application: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
  application = application.addClass(DEFAULT_SINK_TYPE, RecordingSink, [[]], 'singleton');
  application = addOrderDefaults(application);
  const kept = application.build().getRequiredService(DEFAULT_SINK_TYPE) as IMessageSink;
  lines.push(`defaults: an application that registered its own sink keeps it (${kept.name})`);

  // The host overrides all three defaults outright.
  let host = addOrderDefaults(new DefaultManifest<'singleton'>());
  host = host.replaceValue(DEFAULT_CLOCK_TYPE, new FixedClock());
  host = host.replaceClass(DEFAULT_SINK_TYPE, RecordingSink, [[]], 'singleton');
  host = host.replaceFactory(DEFAULT_NOTIFIER_TYPE, makeOrderNotifier, [[DEFAULT_SINK_TYPE]], 'singleton');
  const hostProvider = host.build();
  const recorder = hostProvider.getRequiredService(DEFAULT_SINK_TYPE) as RecordingSink;
  lines.push(
    `override: replace* swapped all three defaults; the host sink is ${recorder.name}, and `
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
function buildOrderContainer(): Manifest<'singleton'> {
  let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
  const clock = new FixedClock();

  // addValue — an already-built instance. No signature (there is nothing to
  // construct) and no scope (a value IS its instance, so caching is moot).
  services = services.addValue(CLOCK_TYPE, clock);

  // The SAME instance again under a KEYED type. Argument 3 is the key, and it is
  // shorthand for tagging the type: passing `'vendor'` here registers at exactly
  // the `VENDOR_CLOCK_TYPE` composed above.
  services = services.addValue(CLOCK_TYPE, clock, 'vendor');

  // A third-party class adapted onto our own clock: its constructor names the
  // vendor's `ILegacyClock`, but the signature is ours to write, so the slot
  // simply points at the keyed clock registered above.
  services = services.addClass(SINK_TYPE, VendorSink, [[VENDOR_CLOCK_TYPE]], 'singleton');

  // addClass, 4-argument form: type, ctor, signatures, scope. The second slot is
  // a LITERAL — its value is injected verbatim, with no container lookup. (The
  // 5-argument form takes a key after the scope.)
  //
  // This lands at the SAME type as the vendor sink above. Registering twice at
  // one type is legal and useful — a collection request sees both — and a single
  // request takes the MOST RECENTLY registered one, so this is the sink the rest
  // of the scenario gets.
  services = services.addClass(SINK_TYPE, PlainTextSink, [[CLOCK_TYPE, Type.typeLiteral('production')]], 'singleton');

  // TWO OVERLOADS for one class, and a KEY. Each inner array is one constructor
  // overload, and the engine takes the first whose every slot it can supply:
  // `[clock, options]` needs `IEmailOptions`, which nothing registers, so the
  // `[clock]` overload wins and the sink falls back to its built-in address.
  services = services.addClass(SINK_TYPE, EmailSink, [[CLOCK_TYPE, EMAIL_OPTIONS_TYPE], [CLOCK_TYPE]], 'singleton',
    'email');

  // An OPTIONAL dependency, spelled honestly: a union whose other member is the
  // literal `undefined`. A literal member supplies ITSELF rather than competing
  // for the slot, so this yields the sink when one is registered and `undefined`
  // when none is — and the slot is never unsatisfiable.
  services = services.addClass(AUDIT_TYPE, AuditLog, [[CLOCK_TYPE, Type.union(SINK_TYPE, Type.typeLiteral(undefined))]],
    'singleton');

  // The same shape on a FACTORY, whose second parameter is a union of two
  // SERVICES plus the literal `undefined`. Only the audit log is registered, so
  // exactly one member can be supplied and the slot settles on it without
  // ambiguity.
  services = services.addFactory(NOTIFIER_TYPE, makeOrderNotifier, [[SINK_TYPE,
    Type.union(METRICS_TYPE, AUDIT_TYPE, Type.typeLiteral(undefined))]], 'singleton');

  // A zero-dependency class. `[[]]` is not decoration: it states ONE overload
  // that takes nothing, which is different from supplying no overloads at all.
  services = services.addClass(FLAGS_TYPE, FeatureFlags, [[]], 'singleton');

  return services;
}

/**
 * The other way to spell a registration: instead of positional arguments, a
 * lambda walks the slots by name and hands back what it configured. Each step
 * returns a NEW node — the same rule the manifest itself follows — and the
 * manifest verb is withheld until an implementation and a signature have both
 * been chosen, so an incomplete registration is refused where it is written
 * rather than at build time.
 *
 * It has no type-driven form, so this function too is identical in the twin.
 */
function demonstrateConfiguredRegistration(): string {
  const withClock: Manifest<'singleton'> = new DefaultManifest<'singleton'>().addValue(CLOCK_TYPE, new FixedClock());
  const services = withClock
    .add(SINK_TYPE, sink =>
      sink.asClass(PlainTextSink)
        .withSignature(CLOCK_TYPE, Type.typeLiteral('staging'))
        .withLifetime('singleton'));

  const sink = services.build().getRequiredService(SINK_TYPE) as IMessageSink;
  return `configured by lambda: ${sink.send('order-99 shipped')}`;
}

/** Exercises the container and reports what each registration produced. */
function describeOrderContainer(services: Manifest<'singleton'>): string[] {
  const app = services.build();

  const notifier = app.getRequiredService(NOTIFIER_TYPE) as IOrderNotifier;
  const audit = app.getRequiredService(AUDIT_TYPE) as IAuditLog;
  const email = app.getRequiredService(EMAIL_SINK_TYPE) as IMessageSink;
  const vendorClock = app.getRequiredService(VENDOR_CLOCK_TYPE) as IClock;
  const flags = app.getRequiredService(FLAGS_TYPE) as FeatureFlags;

  // The optional sink slot found a sink, so the entry the audit log records is
  // echoed to it as well as kept.
  audit.record('order-42 shipped');

  return [`notify: ${notifier.notify('order-42')}`,
    `audit: ${audit.entries.length} entry, sink echo enabled=${flags.echoToSink}`,
    `keyed sink (key "email"): ${email.send('welcome')}`, `keyed value (key "vendor"): ${vendorClock.now()}`,
    `${countRegistrations(services, SINK_TYPE)} sinks share the IMessageSink type; the most recently `
    + `registered one wins a single request, and all of them answer a collection request `
    + `(${[...app.getServices(SINK_TYPE)].length})`];
}

/**
 * Forks the container with every sink removed. The audit log's optional sink
 * slot falls through to `undefined` rather than failing, and — because nothing
 * mutates — the container it was forked from still has all of its sinks.
 */
function describeSinklessFork(services: Manifest<'singleton'>): string {
  const noSinks = services.removeAll(SINK_TYPE);
  const audit = noSinks.build().getRequiredService(AUDIT_TYPE) as IAuditLog;
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

  return ['=== di registration — without transformer ===', demonstrateDiscardTrap(), ...demonstrateDescriptorVerbs(),
    ...describeOrderContainer(services), demonstrateConfiguredRegistration(), describeSinklessFork(services)];
}
