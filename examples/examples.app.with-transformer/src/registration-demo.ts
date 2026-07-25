// The SAME registration tour as
// ../../examples.app.without-transformer/src/registration-demo.ts, authored in
// the type-driven dialect. Read the two side by side: the scenario, the
// behaviour and the printed report are identical — only the authoring form
// differs. Every sugar call below lowers, during the build, to exactly the
// explicit-token call its sibling writes by hand.
//
// THE SCENARIO: an order-shipping notifier. A notification goes to a message
// SINK; an AUDIT LOG records what was sent; a REPOSITORY loads the order.
//
// WHAT THE SUGAR DOES AND DOES NOT REACH:
//   - `addClass<I>(C)` / `addFactory<I>(fn)` / `addValue<I>(v)` derive the
//     service TOKEN from `I` and the dependency SIGNATURE from the value's own
//     parameter types. `addClass(C)` with no type argument self-registers under
//     the token of what it builds.
//   - `Keyed<I, "k">` is the type-driven spelling of `.withKey("k")`;
//     `.as<"scope">()` of `.as("scope")`; `withSignature<[A, B]>()` and
//     `withSignatures<[[A, B], [A]]>()` of their value-argument twins.
//   - `addClass<I>(C, overrides)` repoints individual DERIVED slots — the form
//     that only makes sense when something was derived in the first place.
//   - The DESCRIPTOR VERBS (`tryAdd*`, `replace*`, `removeAll`) have NO
//     type-driven form. They take a token string, so `demonstrateDescriptorVerbs`
//     below is character-for-character the without-transformer version.
//   - There is no GATED form under the sugar: the signature is always derived,
//     so the manifest face is never withheld and `withSignature` /
//     `withSignatures` are overrides rather than a gate. The gated 2-argument
//     form is a no-transformer affordance; see the sibling file.
//
// Everything else — the immutability rule, the discard trap, what each verb is
// FOR — is unchanged, because the sugar changes nothing but the typing.

import { ServiceManifest } from '@rhombus-std/di';
import type { $, IServiceManifest, IServiceProvider, ManifestEntry, Token, Typeof } from '@rhombus-std/di';
import type { Keyed } from '@rhombus-std/di.core';

// ── the domain ───────────────────────────────────────────────────────────────

/** Reads the current time. Registered as an already-built VALUE. */
interface IClock {
  now(): string;
}

/**
 * A third-party package's own clock port. Structurally identical to `IClock`,
 * but a DIFFERENT type — so the token derived for `VendorSink`'s parameter is
 * one this application never registers. That is exactly what the override form
 * exists to fix.
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

/** A plain settings bag, registered under its own token by self-registration. */
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
 * The default sink. Its second constructor parameter is a string LITERAL type,
 * so the derived signature supplies the value directly rather than looking a
 * token up — a type with exactly one inhabitant needs no container.
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
 * The keyed sink. Two injectable overloads are registered for it below: the
 * richer `[clock, options]` one and a `[clock]` fallback. `IEmailOptions` is
 * never registered, so the richer one is unsatisfiable and the fallback wins.
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
 * own `ILegacyClock` port, so the derived slot names a token nothing registers.
 * The registration below overrides that one slot to point at our own keyed
 * clock instead — adapting a third-party class without touching it.
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
 * say "use one if the container has one". An optional parameter derives a UNION
 * slot whose last member is the literal `undefined`, so the slot is always
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
 * first parameter is branded `Typeof<T>`, which means "give me the TOKEN STRING
 * of the type argument bound at this position" — the type-driven spelling of
 * the positional `typeArg(1)` slot.
 */
class SqlRepository<T> implements IRepository<T> {
  public readonly entityToken: Token;
  readonly #clock: IClock;

  public constructor(entityToken: Typeof<T>, clock: IClock) {
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
 * log — a genuine either/or, and a union-typed parameter derives a union slot
 * whose members are tried in order.
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

// ── the few tokens that are still written by hand ────────────────────────────

// The transformer derives a token for every `<I>` above, so this file never
// spells one. These two are the exceptions, and both are exceptions for the
// same reason: they are consumed by a form that takes a token STRING.
//
//   - VENDOR_CLOCK_TOKEN is an entry in an override array (see `VendorSink`
//     below), so its target has to be registered under a name this file chose.
//   - The `orders.defaults:*` family belongs to the descriptor-verb scenario,
//     which has no type-driven form at all.
//
// Both are spelled exactly as the without-transformer app spells them, which is
// the point: a hand-written token is an ordinary, supported thing to write, and
// the two dialects meet on the string.
const CLOCK_TOKEN = 'orders:IClock';
const VENDOR_CLOCK_TOKEN = `${CLOCK_TOKEN}#vendor`;

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

/**
 * Reads back the token the transformer DERIVED for a type, by finding the
 * registration that landed on it. A `removeAll(token)` or a `countRegistrations`
 * needs the token as a string, and there is no `removeAll<T>()` sugar — so a
 * with-transformer author otherwise has to hard-code the derived spelling
 * (`<package>/tokens/<file>:<TypeName>`) and keep it in step by hand. Recovering
 * it from the manifest is the workaround, not the recommended shape; the
 * recommended shape would be a type-driven descriptor verb, which does not
 * exist today.
 *
 * @param services The manifest to search, in authoring order.
 * @param typeName The exported name the derived token ends with.
 */
function derivedTokenFor(services: Iterable<ManifestEntry>, typeName: string): Token {
  const suffix = `:${typeName}`;
  // A `Token` IS a string — that is the whole point of the design — so the
  // tokens a manifest carries can simply be searched for the type's name.
  const registered: string[] = [];
  for (const entry of services) {
    if (entry.kind === 'exact') {
      registered.push(entry.token);
    }
  }

  const match = registered.find((token) => token.endsWith(suffix));
  if (match === undefined) {
    throw new Error(`no registration derived a token ending in "${suffix}"`);
  }
  return match;
}

// ── 1. the immutability trap ─────────────────────────────────────────────────

/**
 * Shows, on purpose, the one mistake this API makes easy to catch: a
 * registration call whose result is thrown away registers nothing. The manifest
 * is a frozen linked list — every verb wraps the receiver in a NEW node — so
 * the only way to keep a registration is to keep the value it returns. The
 * sugar does not change this: it lowers to the same immutable verbs.
 */
function demonstrateDiscardTrap(): string {
  const empty = new ServiceManifest<'singleton'>();

  // WRONG — the new manifest is built and immediately dropped on the floor.
  // `empty` is exactly as empty as it was. This compiles, and it is silent.
  empty.addClass(FeatureFlags).as<'singleton'>();

  // RIGHT — thread the result back in. `addClass(C)` with no type argument
  // self-registers: the token comes from what the class BUILDS.
  const threaded = empty.addClass(FeatureFlags).as<'singleton'>();

  const flagsToken = derivedTokenFor(threaded, 'FeatureFlags');
  return `immutability: the discarded call registered ${countRegistrations(empty, flagsToken)}, `
    + `the threaded one registered ${countRegistrations(threaded, flagsToken)}`;
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
 * NOTHING HERE IS SUGAR. The descriptor verbs take a token string and have no
 * type-driven form, so this function is identical in the without-transformer
 * app — and a library that wants to ship it as a reusable registration function
 * would write it exactly like this whichever dialect its consumers use.
 *
 * @param services The application's registration builder.
 */
function addOrderDefaults<S extends string>(
  services: IServiceManifest<S | 'singleton'>,
): IServiceManifest<S | 'singleton'> {
  // A default VALUE — the clock every other default depends on.
  services = services.tryAddValue(DEFAULT_CLOCK_TOKEN, new FixedClock());
  // A default CLASS.
  services = services.tryAdd(DEFAULT_SINK_TOKEN, PlainTextSink, [[DEFAULT_CLOCK_TOKEN, { value: 'production' }]],
    'singleton');
  // A default FACTORY.
  services = services.tryAddFactory(DEFAULT_NOTIFIER_TOKEN, makeOrderNotifier, [[DEFAULT_SINK_TOKEN]], 'singleton');
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
 * Registers the whole scenario. Every call here has a line-for-line twin in the
 * without-transformer app; the comments name it where the shape differs.
 */
function buildOrderContainer(): IServiceManifest<'singleton'> {
  let services = new ServiceManifest<'singleton'>();
  const clock = new FixedClock();

  // addValue<I> — an already-built instance under the token derived from `I`.
  // No signature (there is nothing to construct) and no scope (a value IS its
  // instance, so caching is moot).
  services = services.addValue<IClock>(clock);

  // The SAME instance again under a KEYED token, `orders:IClock#vendor`. This
  // one uses the explicit form: its token is an entry in the override array
  // below, which names tokens as strings. The type-driven spelling would be
  // `addValue<Keyed<IClock, 'vendor'>>(...)`, but then the token would be
  // derived and the override array could not name it.
  services = services.addValue(CLOCK_TOKEN, clock, 'vendor');

  // The OVERRIDE form: a sparse positional array laid over the DERIVED
  // signature. `VendorSink`'s only parameter is typed `ILegacyClock`, which
  // derives a token nothing registers, so slot 0 is repointed at our keyed
  // clock. An array hole would keep the derived token; an explicit `undefined`
  // would clear the slot.
  //
  // The without-transformer twin has nothing to override — it simply writes the
  // signature it wants, `[[VENDOR_CLOCK_TOKEN]]`. This form exists precisely
  // because the sugar derived one for you.
  services = services.addClass<IMessageSink>(VendorSink, [VENDOR_CLOCK_TOKEN]).as<'singleton'>();

  // addClass<I> with the signature fully derived: `[clock, environment]` where
  // `environment` is a literal type, so its value is supplied directly.
  //
  // This lands at the SAME token as the vendor sink above. Registering twice at
  // one token is legal and useful — a collection resolve sees both — and a
  // single resolve takes the LAST one registered, so this is the sink the rest
  // of the scenario gets.
  services = services.addClass<IMessageSink>(PlainTextSink).as<'singleton'>();

  // `Keyed<I, 'email'>` is the type-driven `.withKey('email')`: the registration
  // lands on the composed token `<IMessageSink token>#email`.
  //
  // `withSignatures<T>()` REPLACES the derived signature set wholesale from a
  // tuple-of-tuples, and is once-only. The two overloads are tried
  // longest-first: `[clock, options]` needs `IEmailOptions`, which nothing
  // registers, so the `[clock]` overload wins and the sink falls back to its
  // built-in address.
  services = services.addClass<Keyed<IMessageSink, 'email'>>(EmailSink).withSignatures<
    [[IClock], [IClock, IEmailOptions]]
  >().as<'singleton'>();

  // An OPTIONAL dependency needs no ceremony: `sink?: IMessageSink` derives a
  // union slot whose last member is the literal `undefined`. Union members are
  // tried in order and the first resolvable one wins, so this yields the sink
  // when one is registered and `undefined` when none is.
  services = services.addClass<IAuditLog>(AuditLog).as<'singleton'>();

  // addFactory<I> derives the token from the factory's RETURN type and the
  // signature from its parameters — here `[sink, union(metrics, audit,
  // undefined)]`, since the second parameter is a union AND optional. The
  // metrics recorder is preferred but never registered, so resolution falls
  // through to the audit log.
  //
  // `withSignature<T>()` APPENDS one more injectable overload and is
  // REPEATABLE, unlike the bulk `withSignatures<T>()` above.
  services = services.addFactory<IOrderNotifier>(makeOrderNotifier).withSignature<[IMessageSink]>().as<'singleton'>();

  // An OPEN template, written as an instantiation expression on both sides:
  // `$<1>` is the first hole. `SqlRepository`'s `Typeof<T>` parameter derives
  // the open type-argument slot that substitution closes per resolved token.
  services = services.addClass<IRepository<$<1>>>(SqlRepository<$<1>>).as<'singleton'>();

  // Self-registration: no type argument, so the token is derived from what the
  // class BUILDS. Reach for it when the implementation IS the service.
  services = services.addClass(FeatureFlags).as<'singleton'>();

  return services;
}

/** Exercises the container and reports what each registration produced. */
function describeOrderContainer(services: IServiceManifest<'singleton'>): string[] {
  // `build()` opens no frame; a scope has to be opened for `'singleton'`
  // registrations to cache.
  const app: IServiceProvider<'singleton'> = services.build().createScope('singleton');

  // Tokenless resolution, the mirror of the registration sugar: the token comes
  // from the type argument. `Keyed<I, 'email'>` reaches the keyed sink.
  const notifier = app.resolve<IOrderNotifier>();
  const audit = app.resolve<IAuditLog>();
  const email = app.resolve<Keyed<IMessageSink, 'email'>>();
  const repository = app.resolve<IRepository<Order>>();
  const flags = app.resolve<FeatureFlags>();
  // The vendor clock was registered under a hand-written token, so it is
  // resolved by that token too — base plus key.
  const vendorClock = app.resolve<IClock>(CLOCK_TOKEN, 'vendor');

  const sinkToken = derivedTokenFor(services, 'IMessageSink');

  return [`notify: ${notifier.notify('order-42')}`,
    `audit: ${audit.entries.length} entry, sink echo enabled=${flags.echoToSink}`,
    `keyed sink (key "email"): ${email.send('welcome')}`, `keyed value (key "vendor"): ${vendorClock.now()}`,
    `open template, closed per entity: ${repository.describe({ id: 'order-42' })}`,
    `${countRegistrations(services, sinkToken)} sinks share the IMessageSink token; the last one `
    + `registered wins a single resolve`];
}

/**
 * Forks the container with every sink removed. The audit log's optional sink
 * slot falls through to `undefined` rather than failing, and — because nothing
 * mutates — the container it was forked from still has all of its sinks.
 */
function describeSinklessFork(services: IServiceManifest<'singleton'>): string {
  const sinkToken = derivedTokenFor(services, 'IMessageSink');
  const noSinks = services.removeAll(sinkToken);
  const audit = noSinks.build().createScope('singleton').resolve<IAuditLog>();
  audit.record('order-42 shipped');

  return `fork: removeAll left ${countRegistrations(noSinks, sinkToken)} sinks (the original still has `
    + `${countRegistrations(services, sinkToken)}), so the audit log's optional sink slot resolved to `
    + `undefined and it recorded ${audit.entries.length} entry anyway`;
}

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * Runs the whole registration tour and returns a deterministic report, leaving
 * the caller to decide where the lines go — the same body the
 * without-transformer app returns, from the type-driven dialect.
 */
export function demonstrateRegistration(): readonly string[] {
  const services = buildOrderContainer();

  return ['=== di registration — with transformer ===', demonstrateDiscardTrap(), ...demonstrateDescriptorVerbs(),
    ...describeOrderContainer(services), describeSinklessFork(services)];
}
