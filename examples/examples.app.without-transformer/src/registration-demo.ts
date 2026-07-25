// A tour of the di REGISTRATION surface, authored WITHOUT the transformer:
// every token is a hand-written string and every dependency signature is
// plain data. This is the PRIMARY surface — the type-driven forms in
// ../../examples.app.with-transformer/src/registration-demo.ts are sugar that
// lowers to exactly the calls below, and the two print the same report.
//
// THE SCENARIO: an order-shipping notifier. A notification goes to a message
// SINK; an AUDIT LOG records what was sent; a REPOSITORY loads the order. Every
// registration verb below earns its place in that one story rather than
// standing alone.
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
//    dependencies" is written `[[]]` — an absent argument means "not supplied
//    yet", which is a different (and gated) state.

import { ServiceManifest, typeArg, union } from '@rhombus-std/di';
import type { IServiceManifest, IServiceProvider, ManifestEntry, Token } from '@rhombus-std/di';

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
 * A metrics recorder. Also never registered — it is the PREFERRED member of the
 * notifier's union slot, so resolution falls through it to the audit log.
 */
interface IMetricsRecorder {
  count(name: string): void;
}

/** The entity the open repository template is closed over. */
interface Order {
  readonly id: string;
}

/** An open-generic repository: registered ONCE as a template, closed per entity. */
interface IRepository<T> {
  readonly entityToken: Token;
  describe(entity: T): string;
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
 * slot (`{ value: 'production' }`) instead of as a token — no lookup happens.
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
 * a UNION whose last member is the literal `undefined` — so the slot is always
 * satisfiable and simply yields `undefined` when no sink is registered.
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
 * The open repository template. ONE JavaScript class serves every closing: its
 * first parameter receives the TOKEN STRING of whichever entity the closing
 * bound, which is what the `typeArg(1)` slot supplies.
 */
class SqlRepository<T> implements IRepository<T> {
  public readonly entityToken: Token;
  readonly #clock: IClock;

  public constructor(entityToken: Token, clock: IClock) {
    this.entityToken = entityToken;
    this.#clock = clock;
  }

  public describe(entity: T): string {
    // `entityToken` is the full token of whatever the closing bound. Only its
    // tail is printed, so this line reads the same in both authoring dialects —
    // they pick their tokens differently, but bind the same entity.
    const name = this.entityToken.slice(this.entityToken.lastIndexOf(':') + 1);
    return `${name} ${JSON.stringify(entity)} at ${this.#clock.now()}`;
  }
}

/**
 * The notifier factory. `recorder` takes either a metrics recorder or the audit
 * log — a genuine either/or, registered as a union slot whose members are tried
 * in order.
 */
function makeOrderNotifier(
  sink: IMessageSink,
  recorder?: IMetricsRecorder | IAuditLog,
): IOrderNotifier {
  return {
    notify(orderId: string): string {
      const message = sink.send(`${orderId} shipped`);
      if (recorder !== undefined && 'record' in recorder) {
        recorder.record(message);
      }
      return message;
    },
  };
}

// ── tokens ───────────────────────────────────────────────────────────────────

// A hand author picks the token strings; they only have to be stable and unique.
// These are short for readability. When you need to INTEROPERATE with
// registrations the transformer produced, spell the token exactly as it derives
// it instead — see examples.lib.without-transformer/src/tokens.ts.
const CLOCK_TOKEN = 'orders:IClock';
const SINK_TOKEN = 'orders:IMessageSink';
const EMAIL_OPTIONS_TOKEN = 'orders:IEmailOptions';
const AUDIT_TOKEN = 'orders:IAuditLog';
const METRICS_TOKEN = 'orders:IMetricsRecorder';
const NOTIFIER_TOKEN = 'orders:IOrderNotifier';
const FLAGS_TOKEN = 'orders:FeatureFlags';

// A KEYED token is not a parallel subsystem — it is the base token with a
// `#<key>` suffix, composed by the `key` argument or by `.withKey()`. Writing
// the composed form by hand (as this slot does) hits exactly the same lookup.
const VENDOR_CLOCK_TOKEN = `${CLOCK_TOKEN}#vendor`;

// An OPEN template token: every type argument is a `$N` hole. It never resolves
// directly — resolving a CLOSED token that has no exact registration matches
// against the templates and synthesizes a registration for that closing.
const REPOSITORY_TEMPLATE = 'orders:IRepository<$1>';
const ORDER_TOKEN = 'orders:Order';
// A CLOSED token is the template with its hole filled in — plain string
// composition, which is all "closing a generic" amounts to on the wire.
const ORDER_REPOSITORY_TOKEN = `orders:IRepository<${ORDER_TOKEN}>`;

// The library-defaults scenario keeps its own namespace, so the descriptor
// verbs below name tokens this file owns end-to-end.
const DEFAULT_CLOCK_TOKEN = 'orders.defaults:IClock';
const DEFAULT_SINK_TOKEN = 'orders.defaults:IMessageSink';
const DEFAULT_NOTIFIER_TOKEN = 'orders.defaults:IOrderNotifier';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Counts the registrations bound to `token`. A manifest is an
 * `Iterable<ManifestEntry>` whose entries come out in AUTHORING order, so this
 * is the honest way to observe what a chain of verbs actually recorded —
 * no build, no resolution.
 */
function countRegistrations(services: Iterable<ManifestEntry>, token: Token): number {
  let count = 0;
  for (const entry of services) {
    if (entry.kind === 'exact' && entry.token === token) {
      count += 1;
    }
  }
  return count;
}

// ── 1. the immutability trap ─────────────────────────────────────────────────

/**
 * Shows, on purpose, the one mistake this API makes easy to catch: a
 * registration call whose result is thrown away registers nothing. The manifest
 * is a frozen linked list — every verb wraps the receiver in a NEW node — so
 * the only way to keep a registration is to keep the value it returns.
 */
function demonstrateDiscardTrap(): string {
  const empty = new ServiceManifest<'singleton'>();

  // WRONG — the new manifest is built and immediately dropped on the floor.
  // `empty` is exactly as empty as it was. This compiles, and it is silent.
  empty.addClass(FLAGS_TOKEN, FeatureFlags, [[]], 'singleton');

  // RIGHT — thread the result back in.
  const threaded = empty.addClass(FLAGS_TOKEN, FeatureFlags, [[]], 'singleton');

  return `immutability: the discarded call registered ${countRegistrations(empty, FLAGS_TOKEN)}, `
    + `the threaded one registered ${countRegistrations(threaded, FLAGS_TOKEN)}`;
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
  services: IServiceManifest<S | 'singleton'>,
): IServiceManifest<S | 'singleton'> {
  // A default VALUE — the clock every other default depends on.
  services = services.tryAddValue(DEFAULT_CLOCK_TOKEN, new FixedClock());
  // A default CLASS.
  services = services.tryAdd(
    DEFAULT_SINK_TOKEN,
    PlainTextSink,
    [[DEFAULT_CLOCK_TOKEN, { value: 'production' }]],
    'singleton',
  );
  // A default FACTORY.
  services = services.tryAddFactory(
    DEFAULT_NOTIFIER_TOKEN,
    makeOrderNotifier,
    [[DEFAULT_SINK_TOKEN]],
    'singleton',
  );
  return services;
}

/**
 * The descriptor verbs, in the order a real application meets them:
 *
 *   - `tryAdd*`  — IDEMPOTENT DEFAULTS. A library registers only what is
 *                  missing, so applying its defaults twice, or applying them
 *                  after the application registered its own, changes nothing.
 *   - `replace*` — HOST OVERRIDE. The application wants ITS implementation to
 *                  be the only one at that token: drop what is there, register
 *                  anew. (Plain `addClass` would leave both, and collection
 *                  resolution would see the loser too.)
 *   - `removeAll`— TEARDOWN. Strip a token back to nothing, which is what a
 *                  test host or a "no default providers" switch needs.
 *
 * None of these has a type-driven form, so this function is IDENTICAL in the
 * with-transformer app.
 */
function demonstrateDescriptorVerbs(): string[] {
  const lines: string[] = [];

  // Applying the defaults twice leaves exactly one of each.
  let library = new ServiceManifest<'singleton'>();
  library = addOrderDefaults(library);
  library = addOrderDefaults(library);
  lines.push(
    `defaults: applying them twice leaves ${countRegistrations(library, DEFAULT_SINK_TOKEN)} sink `
      + `(tryAdd* only registers what is missing)`,
  );

  // An application that already wired its own sink keeps it.
  let application = new ServiceManifest<'singleton'>();
  application = application.addClass(DEFAULT_SINK_TOKEN, RecordingSink, [[]], 'singleton');
  application = addOrderDefaults(application);
  const kept = application.build().createScope('singleton').resolve<IMessageSink>(DEFAULT_SINK_TOKEN);
  lines.push(`defaults: an application that registered its own sink keeps it (${kept.name})`);

  // The host overrides all three defaults outright.
  let host = addOrderDefaults(new ServiceManifest<'singleton'>());
  host = host.replaceValue(DEFAULT_CLOCK_TOKEN, new FixedClock());
  host = host.replace(DEFAULT_SINK_TOKEN, RecordingSink, [[]], 'singleton');
  host = host.replaceFactory(DEFAULT_NOTIFIER_TOKEN, makeOrderNotifier, [[DEFAULT_SINK_TOKEN]], 'singleton');
  const hostScope = host.build().createScope('singleton');
  hostScope.resolve<IOrderNotifier>(DEFAULT_NOTIFIER_TOKEN).notify('order-7');
  const recorder = hostScope.resolve<RecordingSink>(DEFAULT_SINK_TOKEN);
  lines.push(
    `override: replace* swapped all three defaults; the host sink is ${recorder.name}, it captured `
      + `${recorder.captured.length} message, and ${countRegistrations(host, DEFAULT_SINK_TOKEN)} `
      + `registration is left at its token`,
  );

  // Teardown strips the token completely.
  const stripped = host.removeAll(DEFAULT_SINK_TOKEN);
  lines.push(
    `teardown: removeAll left ${countRegistrations(stripped, DEFAULT_SINK_TOKEN)} sinks on the new manifest, `
      + `and ${countRegistrations(host, DEFAULT_SINK_TOKEN)} on the original (nothing mutates)`,
  );

  return lines;
}

// ── 3. the application container ─────────────────────────────────────────────

/**
 * Registers the whole scenario. Read it as one pass down the registration
 * surface: a value (twice, once keyed), two sinks sharing one token plus a
 * keyed third, an optional dependency, a factory with two overloads, an open
 * template, and a zero-dependency class.
 */
function buildOrderContainer(): IServiceManifest<'singleton'> {
  let services = new ServiceManifest<'singleton'>();
  const clock = new FixedClock();

  // addValue — an already-built instance. No signature (there is nothing to
  // construct) and no scope (a value IS its instance, so caching is moot).
  services = services.addValue(CLOCK_TOKEN, clock);

  // The SAME instance again under a KEYED token, `orders:IClock#vendor`. The
  // third argument is the key; `addValue` has no fluent chain to hang a
  // `.withKey()` on, because it has no other slot left to fill.
  services = services.addValue(CLOCK_TOKEN, clock, 'vendor');

  // A third-party class adapted onto our own clock: its constructor names the
  // vendor's `ILegacyClock`, but the signature is ours to write, so the slot
  // simply points at the keyed clock registered above.
  services = services.addClass(SINK_TOKEN, VendorSink, [[VENDOR_CLOCK_TOKEN]], 'singleton');

  // addClass, 4-argument form: token, ctor, signatures, scope. The second slot
  // is a LITERAL — its value is injected verbatim, with no container lookup.
  // (The 5-argument form takes a key after the scope, and is exactly
  // `.as(scope).withKey(key)` written positionally.)
  //
  // This lands at the SAME token as the vendor sink above. Registering twice at
  // one token is legal and useful — a collection resolve sees both — and a
  // single resolve takes the LAST one registered, so this is the sink the rest
  // of the scenario gets.
  services = services.addClass(
    SINK_TOKEN,
    PlainTextSink,
    [[CLOCK_TOKEN, { value: 'production' }]],
    'singleton',
  );

  // The GATED 2-argument form: no signature is supplied, so the returned chain
  // WITHHOLDS the manifest face — `build`/`addClass` are absent until a
  // signature arrives. `withSignatures` supplies the whole set at once and
  // opens the gate; it is once-only (it consumes both signature slots), so it
  // can never follow an append. `.withKey()` then makes the registration keyed
  // and `.as()` names its lifetime; the modifiers may come in any order.
  //
  // The two overloads are tried longest-first: `[clock, options]` needs
  // `IEmailOptions`, which nothing registers, so the `[clock]` overload wins
  // and the sink falls back to its built-in address.
  services = services
    .addClass(SINK_TOKEN, EmailSink)
    .withSignatures([CLOCK_TOKEN], [CLOCK_TOKEN, EMAIL_OPTIONS_TOKEN])
    .withKey('email')
    .as('singleton');

  // An OPTIONAL dependency, spelled honestly: a union whose last member is the
  // literal `undefined`. Union members are tried in order and the first
  // resolvable one wins, so this yields the sink when one is registered and
  // `undefined` when none is — and the slot is never unsatisfiable.
  services = services.addClass(
    AUDIT_TOKEN,
    AuditLog,
    [[CLOCK_TOKEN, union(SINK_TOKEN, { value: undefined })]],
    'singleton',
  );

  // The gated form again, opened by `withSignature` — which APPENDS one
  // overload and is REPEATABLE, unlike the bulk `withSignatures` above. The
  // second slot is a union of two SERVICES plus the literal `undefined` (the
  // factory's parameter is optional): the metrics recorder is preferred but
  // never registered, so resolution falls through to the audit log. The second
  // call appends a leaner fallback overload.
  services = services
    .addFactory(NOTIFIER_TOKEN, makeOrderNotifier)
    .withSignature(SINK_TOKEN, union(METRICS_TOKEN, AUDIT_TOKEN, { value: undefined }))
    .withSignature(SINK_TOKEN)
    .as('singleton');

  // An OPEN template. `typeArg(1)` is the positional way to say "this parameter
  // receives the token string of the registration's first type argument"; when
  // a closing is resolved, substitution turns it into a literal carrying that
  // argument's token.
  services = services.addClass(
    REPOSITORY_TEMPLATE,
    SqlRepository,
    [[typeArg(1), CLOCK_TOKEN]],
    'singleton',
  );

  // A zero-dependency class. `[[]]` is not decoration: it STATES that the class
  // takes nothing, which is different from not having supplied a signature yet.
  services = services.addClass(FLAGS_TOKEN, FeatureFlags, [[]], 'singleton');

  return services;
}

/** Exercises the container and reports what each registration produced. */
function describeOrderContainer(services: IServiceManifest<'singleton'>): string[] {
  // `build()` opens no frame; a scope has to be opened for `'singleton'`
  // registrations to cache.
  const app: IServiceProvider<'singleton'> = services.build().createScope('singleton');

  const notifier = app.resolve<IOrderNotifier>(NOTIFIER_TOKEN);
  const audit = app.resolve<IAuditLog>(AUDIT_TOKEN);
  const email = app.resolve<IMessageSink>(SINK_TOKEN, 'email');
  const vendorClock = app.resolve<IClock>(CLOCK_TOKEN, 'vendor');
  const repository = app.resolve<IRepository<Order>>(ORDER_REPOSITORY_TOKEN);
  const flags = app.resolve<FeatureFlags>(FLAGS_TOKEN);

  return [
    `notify: ${notifier.notify('order-42')}`,
    `audit: ${audit.entries.length} entry, sink echo enabled=${flags.echoToSink}`,
    `keyed sink (key "email"): ${email.send('welcome')}`,
    `keyed value (key "vendor"): ${vendorClock.now()}`,
    `open template, closed per entity: ${repository.describe({ id: 'order-42' })}`,
    `${countRegistrations(services, SINK_TOKEN)} sinks share the IMessageSink token; the last one `
    + `registered wins a single resolve`,
  ];
}

/**
 * Forks the container with every sink removed. The audit log's optional sink
 * slot falls through to `undefined` rather than failing, and — because nothing
 * mutates — the container it was forked from still has all of its sinks.
 */
function describeSinklessFork(services: IServiceManifest<'singleton'>): string {
  const noSinks = services.removeAll(SINK_TOKEN);
  const audit = noSinks.build().createScope('singleton').resolve<IAuditLog>(AUDIT_TOKEN);
  audit.record('order-42 shipped');

  return `fork: removeAll left ${countRegistrations(noSinks, SINK_TOKEN)} sinks (the original still has `
    + `${countRegistrations(services, SINK_TOKEN)}), so the audit log's optional sink slot resolved to `
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

  return [
    '=== di registration — without transformer ===',
    demonstrateDiscardTrap(),
    ...demonstrateDescriptorVerbs(),
    ...describeOrderContainer(services),
    describeSinklessFork(services),
  ];
}
