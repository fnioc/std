// The INFRASTRUCTURE surface of `@rhombus-std/di.core` — the parts a LIBRARY
// AUTHOR reaches for, rather than the registration/resolution verbs an
// application composition root uses. Authored in the TOKENLESS dialect: types
// drive the tokens and the dependency signatures, and the Go/ttsc engine lowers
// them during this package's build.
//
// The mirror of this file is `../../examples.lib.without-transformer/src/
// infrastructure-greeting-workshop.ts` — the same scenario, the same output,
// hand-written tokens. Diff them and the difference is exactly two things:
//
//   - the workshop's own registration + lookup are TOKENLESS here
//     (`addClass<GreetingWorkshop>(…)` / `resolve<GreetingWorkshop>()`), because
//     both sides derive the same token from the same type; and
//   - the dependency signatures are MINTED from type tuples —
//     `signaturesfor<[[A, B]]>()` for the card's whole set, `signaturefor<[A]>()`
//     for the workshop's one appended overload — instead of being written out as
//     slot arrays.
//
// Everything else is identical, and deliberately so. Where a token names
// something that has no type to derive from — a ctor arriving as a runtime
// parameter, a slot the CALLER fills rather than the container — the explicit
// form is the only form, in both dialects. That is the no-transformer-first
// doctrine working as intended: the explicit form is the real API, and the sugar
// only removes boilerplate where there is a type to remove it from.
//
// The scenario is one small library — a "greeting workshop" a consuming
// application configures and then asks for a rendered greeting card. It is
// deliberately self-contained: it builds and owns its OWN container, so nothing
// here lands in (or perturbs) the interop container the example apps assemble.

import { RESOLVER_TOKEN, ServiceManifest } from '@rhombus-std/di';
import type { IResolver, IServiceManifest, IServiceManifestHolder, IServiceProviderFactory } from '@rhombus-std/di';
// The type-driven dependency-signature MINT primitives. They have no runtime
// footprint: the build lowers `signaturefor<[A, B]>()` / `signaturesfor<[[A]]>()`
// to the slot arrays a hand author would have written, and elides this import
// along with them.
import { signaturefor, signaturesfor } from '@rhombus-std/di.core';
import type { IGreeting } from '@rhombus-std/examples.contracts';

// ── tokens ───────────────────────────────────────────────────────────────────

// Spelled out because each names a slot with no type to derive from at the call
// site (see the header). They are LOCAL to this demo — nothing outside it
// registers or resolves them — and are written in the same
// `<import-specifier>:<exported-name>` form the transformer derives, so a reader
// can check them against what the sugar would produce.

/** `token(IGreeting)` — the contract the workshop registers a greeting under. */
const GREETING_TOKEN = '@rhombus-std/examples.contracts:IGreeting';

/** The card stationery. Registered only when the consuming app chooses to override it. */
const CARD_STATIONERY_TOKEN = '@rhombus-std/examples.lib.with-transformer:ICardStationery';

// ── the domain ───────────────────────────────────────────────────────────────

/** Who a card is addressed to. Known only at call time, so never a registration. */
export interface ICardRecipient {
  readonly name: string;
}

/** How a card is framed. The library ships a default; an app may register its own. */
export interface ICardStationery {
  readonly border: string;
}

/** The library's fallback stationery, used when the app registered none. */
export class PlainStationery implements ICardStationery {
  public readonly border = '--';
}

/**
 * The greeting this demo's containers are configured with. Local to the
 * workshop rather than the package's own `FormalGreeting`, so that this file and
 * its without-transformer mirror render the same text and the two demos can be
 * diffed line for line.
 */
export class WorkshopGreeting implements IGreeting {
  public readonly source = 'greeting-workshop';

  public greet(name: string): string {
    return `Hello, ${name}`;
  }
}

/**
 * One rendered greeting card. There is a fresh one per recipient, and one of its
 * constructor arguments — the recipient — is data the container has no way to
 * know. It is registered anyway, because a registration is what carries the
 * DEPENDENCY SIGNATURE; `resolveFactory` then splits that signature in two,
 * filling the greeting slot from the container and leaving the recipient slot to
 * the caller.
 */
export class GreetingCard {
  readonly #greeting: IGreeting;
  readonly #recipient: ICardRecipient;

  public constructor(greeting: IGreeting, recipient: ICardRecipient) {
    this.#greeting = greeting;
    this.#recipient = recipient;
  }

  public render(border: string): string {
    return `${border} ${this.#greeting.greet(this.#recipient.name)} ${border}`;
  }
}

/**
 * The card's dependency signatures, minted from its constructor's parameter
 * TYPES rather than written out as tokens.
 *
 * `signaturesfor<[[A, B]]>()` is the tuple-OF-tuples form: one inner tuple per
 * OVERLOAD, so it returns the whole `DepSignatures` array and lowers to exactly
 * the `[["…:IGreeting", "…:ICardRecipient"]]` the manual dialect writes by hand.
 * The set has ONE member here, and choosing the bulk form anyway is the point:
 * `withSignatures` is once-only and STATES the whole set, so a later edit cannot
 * quietly append a second overload to a registration meant to have exactly one.
 *
 * Slot 0 derives `"@rhombus-std/examples.contracts:IGreeting"`, the same string
 * the workshop registers the greeting under. `ICardRecipient` derives a token
 * that is never registered anywhere; that is the point — it can only ever be
 * filled by the caller.
 */
const CARD_SIGNATURES = signaturesfor<[[IGreeting, ICardRecipient]]>();

/**
 * The workshop's signature, minted with the SINGULAR `signaturefor<[…]>()` — one
 * type tuple in, one `DepSlot[]` out, appended by the REPEATABLE `withSignature`.
 * The two modifiers say opposite things about a registration's future: the bulk
 * form above forbids further overloads, this one invites them, which is how a
 * library builds a set up conditionally.
 *
 * Pinning at all is a deliberate library-author choice: `addClass<T>(C)` would
 * derive this from the constructor, and a derived signature TRACKS the
 * constructor — so adding a defaulted parameter later would silently become a new
 * injected slot, and a new way for the registration to stop being satisfiable.
 */
const WORKSHOP_SIGNATURE = signaturefor<[IResolver]>();

/**
 * The library's one registered service. It mints {@link GreetingCard}s on
 * demand, which is why it takes the live `IResolver` (the intrinsic provider
 * slot) rather than the greeting directly: a card is built later, per recipient,
 * against whatever the container holds at that moment.
 */
export class GreetingWorkshop {
  readonly #resolver: IResolver;

  /**
   * The card factory, built on FIRST USE and then reused. `resolveFactory` works
   * the slot plan out once — which slot the caller fills, which the container
   * resolves — so paying for that per card would be waste.
   *
   * Lazy rather than eager because a workshop has to be CONSTRUCTIBLE against a
   * provider that holds no cards at all; see the `EmptyServiceProvider` section
   * of the demo, where exactly that happens and the failure surfaces at the first
   * `card()` call instead of taking the constructor down with it.
   */
  #mintCard: ((recipient: ICardRecipient) => GreetingCard) | undefined;

  /**
   * The stationery in force. `tryResolve` + `??` is the whole "use the app's
   * registration if there is one, otherwise build my default" idiom: `tryResolve`
   * is the verb whose miss is `undefined` rather than a throw, which is what makes
   * absence a legitimate deployment shape instead of a wiring bug. Resolved ONCE
   * at construction — the workshop is a singleton, so the answer cannot change
   * under it.
   */
  public readonly stationery: ICardStationery;

  public constructor(resolver: IResolver) {
    this.#resolver = resolver;
    // Explicit-token: `ICardStationery` is registered under a token the app may
    // or may not have written, and the workshop names it back — the same string
    // the builder's `useStationery` registers it under.
    this.stationery = resolver.tryResolve<ICardStationery>(CARD_STATIONERY_TOKEN)
      ?? new PlainStationery();
  }

  /**
   * Renders a card for `name`. The greeting comes from the container; the
   * recipient is the caller's.
   *
   * In this dialect the whole partition rides on ONE function type:
   * `resolve<(recipient: ICardRecipient) => GreetingCard>()` lowers to
   * `resolveFactory("…:GreetingCard", ["…:ICardRecipient"])` — the RETURN type
   * names what gets built, the PARAMETER types name what the caller supplies, and
   * every other slot in the target's signature resolves from the container.
   *
   * A parameterized factory deliberately does NOT cache: the arguments differ per
   * call, so a fresh card every time is the only correct answer.
   */
  public card(name: string): string {
    this.#mintCard ??= this.#resolver.resolve<(recipient: ICardRecipient) => GreetingCard>();
    return this.#mintCard({ name }).render(this.stationery.border);
  }

  /** Whether the app registered its own stationery, or the library default is in force. */
  public get stationeryIsOverridden(): boolean {
    return this.#resolver.isService(CARD_STATIONERY_TOKEN);
  }
}

// ── the configure(builder) seam ──────────────────────────────────────────────

/**
 * What a consuming application sees inside `addGreetingWorkshop(services, …)`.
 * A fluent, ORDINARY object — no manifest threading, no return value to
 * remember. That ergonomics is bought entirely by
 * {@link IServiceManifestHolder}; see {@link GreetingWorkshopBuilder}.
 */
export interface IGreetingWorkshopBuilder {
  /** Chooses the greeting implementation every card is rendered with. */
  useGreeting(greeting: new() => IGreeting): IGreetingWorkshopBuilder;
  /** Overrides the library's default stationery. */
  useStationery(stationery: ICardStationery): IGreetingWorkshopBuilder;
}

/**
 * The builder — and the reason `IServiceManifestHolder` exists.
 *
 * A `ServiceManifest` is IMMUTABLE: every verb returns a NEW manifest and leaves
 * the receiver alone. So a builder cannot hold a manifest and register "into"
 * it; whatever it registers would be thrown away the moment its method returned.
 * The alternatives are both bad: hand the consumer the manifest and make them
 * thread the result (`services = builder.useGreeting(...)`), which silently
 * registers NOTHING the one time they forget, or have every builder method
 * return the manifest and give up the fluent chain.
 *
 * `IServiceManifestHolder` is the third option: ONE mutable slot over the
 * immutable chain. The builder reassigns `holder.services` on each call, and the
 * function that owns the holder reads the final chain out at the end. That is
 * how `ILoggingBuilder`, `IMetricsBuilder` and `IHostApplicationBuilder` all
 * work, and handing the SAME holder to several builders is what keeps them on
 * one chain instead of silently dropping each other's registrations.
 */
export class GreetingWorkshopBuilder<S extends string> implements IGreetingWorkshopBuilder {
  readonly #holder: IServiceManifestHolder<S | 'singleton'>;

  public constructor(holder: IServiceManifestHolder<S | 'singleton'>) {
    this.#holder = holder;
  }

  public useGreeting(greeting: new() => IGreeting): IGreetingWorkshopBuilder {
    // Explicit-token in BOTH dialects: the ctor arrives as a runtime PARAMETER,
    // so there is no class type for the transformer to derive a signature — or a
    // token — from.
    this.#holder.services = this.#holder.services.addClass(GREETING_TOKEN, greeting, [[]], 'singleton');
    return this;
  }

  public useStationery(stationery: ICardStationery): IGreetingWorkshopBuilder {
    // Same story from the other side: the workshop's `tryResolve` names this
    // token back explicitly, so the registration has to agree with it by hand.
    this.#holder.services = this.#holder.services.addValue(CARD_STATIONERY_TOKEN, stationery);
    return this;
  }
}

/**
 * Registers the greeting workshop into `services`, letting the caller configure
 * it through a fluent builder. The manifest is immutable, so the caller still
 * threads the RESULT back in (`services = addGreetingWorkshop(services, …)`) —
 * but everything the callback did lands in one place regardless of what the
 * callback returned, because the callback wrote into the holder rather than into
 * a manifest it had to hand back.
 *
 * @param services The application's registration builder.
 * @param configure Receives the builder; its return value is deliberately ignored.
 */
export function addGreetingWorkshop<S extends string>(
  services: IServiceManifest<S | 'singleton'>,
  configure: (builder: IGreetingWorkshopBuilder) => void,
): IServiceManifest<S | 'singleton'> {
  const holder: IServiceManifestHolder<S | 'singleton'> = { services };
  configure(new GreetingWorkshopBuilder<S>(holder));

  // The card. Its TOKEN is derived (`addClass<GreetingCard>`), but its signature
  // is supplied through the GATED form, because one of its slots — the recipient
  // — is the caller's and has no registration behind it.
  //
  // No lifetime, so transient: the honest tag for something built fresh per
  // recipient.
  holder.services = holder.services
    .addClass<GreetingCard>(GreetingCard)
    .withSignatures(...CARD_SIGNATURES);

  // The workshop itself goes on last so a consumer cannot forget it — and this
  // one is fully tokenless. The demo resolves it with `resolve<GreetingWorkshop>()`,
  // which derives the same token from the same class type; `withSignature`
  // appends the pinned single overload (see `WORKSHOP_SIGNATURE`), so the
  // intrinsic provider slot never has to be named either.
  //
  // Registration sugar lowers in any expression context, not only at a module's
  // top level, which is what lets a library function like this one be authored
  // tokenlessly at all.
  holder.services = holder.services
    .addClass<GreetingWorkshop>(GreetingWorkshop)
    .withSignature(...WORKSHOP_SIGNATURE)
    .as<'singleton'>();
  return holder.services;
}

// ── the provider-factory seam ────────────────────────────────────────────────

/**
 * An `IServiceProviderFactory` over this repo's own container — the seam
 * `IHostBuilder.useServiceProviderFactory` and `configureContainer` are typed
 * against.
 *
 * The seam splits container construction in two: `createBuilder` adapts the
 * collected registrations into whatever object the container wants to be
 * configured through, and `createServiceProvider` turns that (by then
 * caller-configured) object into the provider everything resolves from. A
 * third-party container would do real adapting in the first step; with one
 * container type here the builder IS the manifest, and the value the seam adds
 * is that the BUILD OPTIONS live in one place instead of at every `build()`
 * call site — which is exactly what a host wants to own.
 *
 * Two things a reader should notice about the seam's current shape, because they
 * bound what an implementation can do:
 *
 *   - `createServiceProvider` hands back `IResolver`, the minimal resolution
 *     surface — scope creation and disposal are NOT part of it, so a host that
 *     went through the seam could not open a scope or close the container down.
 *   - `createBuilder`'s parameter is `IServiceManifest` with the DEFAULT
 *     `'singleton'` scope union baked in, so this class cannot be generic over
 *     an application's own scope names; an app declaring extra scopes has to
 *     cast on the way in.
 */
export class ManifestServiceProviderFactory implements IServiceProviderFactory<IServiceManifest> {
  public createBuilder(services: IServiceManifest): IServiceManifest {
    return services;
  }

  public createServiceProvider(containerBuilder: IServiceManifest): IResolver {
    // The one policy this factory imposes: every container it builds runs inside
    // an OPEN root scope. `build()` on its own is frameless, so a
    // `'singleton'`-tagged registration has no frame to be cached in and quietly
    // resolves transiently instead — a mistake that costs nothing at startup and
    // everything later. Deciding it once, here, rather than at each `build()`
    // call site is exactly what the seam is for.
    //
    // Deliberately NOT `build({ validateOnBuild: true })`, tempting as that
    // looks. The eager pass dry-runs every EXACT registration, and this library
    // ships one that can never satisfy it: `GreetingCard`'s recipient slot is the
    // CALLER's, handed over through `resolveFactory`, and no registration stands
    // behind it. A whole-graph check cannot tell a deliberately caller-supplied
    // slot apart from a wiring hole, so a container that uses the partition has
    // to opt out of it.
    return containerBuilder.build().createScope('singleton');
  }
}

/** A fresh, empty manifest for this demo's own container. */
export function newWorkshopManifest(): IServiceManifest<'singleton'> {
  return new ServiceManifest<'singleton'>();
}
