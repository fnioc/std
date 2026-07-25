// The INFRASTRUCTURE surface of `@rhombus-std/di.core` — the parts a LIBRARY
// AUTHOR reaches for, rather than the registration/resolution verbs an
// application composition root uses. Authored in the MANUAL dialect: explicit
// string tokens and plain-data dependency signatures, no transformer.
//
// The scenario is one small library — a "greeting workshop" a consuming
// application configures and then asks for a rendered greeting card. It is
// deliberately self-contained: it builds and owns its OWN container, so nothing
// here lands in (or perturbs) the interop container the example apps assemble.
// A library that shipped these pieces for real would let the app supply the
// manifest instead; that variant is the `addGreetingWorkshop` function below.
//
// What each piece is here to teach:
//
//   - `IServiceManifestHolder` — the mutable-slot seam that makes a
//     `configure(builder)` callback API possible at all (see the builder below).
//   - `IResolver.resolveFactory` — building an object whose dependencies are PART
//     container-owned and PART caller-owned, without the library having to know
//     what the application registered.
//   - `IServiceProviderFactory` — the pluggable seam between "the registrations
//     are collected" and "here is the provider to run against".
//   - `EmptyServiceProvider` — the null-object provider to fall back on when
//     there is no container at all.
//
// The mirror of this file is `../../examples.lib.with-transformer/src/
// infrastructure-greeting-workshop.ts`: the same scenario, the same output, the
// type-driven dialect. Diff them to see exactly what the transformer removes.

import { RESOLVER_TOKEN, ServiceManifest } from '@rhombus-std/di';
import type { IResolver, IServiceManifest, IServiceManifestHolder, IServiceProviderFactory } from '@rhombus-std/di';
import type { IGreeting } from '@rhombus-std/examples.contracts';

import { GREETING_TOKEN } from './tokens.js';

// ── tokens ───────────────────────────────────────────────────────────────────

// Hand-written in the same `<import-specifier>:<exported-name>` form
// `@rhombus-std/di.extras` derives, exactly as `./tokens.ts` does. These are
// LOCAL to this demo — nothing outside it registers or resolves them — so they
// only have to agree with each other. `GREETING_TOKEN` is re-used from
// `./tokens.js` because the workshop registers a real `IGreeting` and the card
// resolves it back through the same slot.

/**
 * The per-card recipient. Deliberately NEVER registered: it is an argument, not
 * a service, and that is the whole point of the factory below — a slot the
 * container cannot fill has to come from the caller.
 */
const CARD_RECIPIENT_TOKEN = '@rhombus-std/examples.lib.without-transformer:ICardRecipient';

/** The card stationery. Registered only when the consuming app chooses to override it. */
const CARD_STATIONERY_TOKEN = '@rhombus-std/examples.lib.without-transformer:ICardStationery';

/** One rendered card. Registered, but never resolved directly — see {@link GreetingWorkshop}. */
const GREETING_CARD_TOKEN = '@rhombus-std/examples.lib.without-transformer:GreetingCard';

/** The workshop service itself — the one thing this library registers unconditionally. */
export const GREETING_WORKSHOP_TOKEN = '@rhombus-std/examples.lib.without-transformer:GreetingWorkshop';

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
 * workshop rather than the package's own `CasualGreeting`, so that this file and
 * its with-transformer mirror render the same text and the two demos can be
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
 * The library's one registered service. It mints {@link GreetingCard}s on
 * demand, which is why it takes the live `IResolver` (the intrinsic
 * `RESOLVER_TOKEN` slot) rather than the greeting directly: a card is built
 * later, per recipient, against whatever the container holds at that moment.
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
    this.stationery = resolver.tryResolve<ICardStationery>(CARD_STATIONERY_TOKEN)
      ?? new PlainStationery();
  }

  /**
   * Renders a card for `name`. The greeting comes from the container; the
   * recipient is the caller's.
   *
   * `resolveFactory(token, params)` IS the partition: `params` names the tokens
   * the CALLER supplies, and every other slot in the target's signature resolves
   * from the container as usual. Call arguments line up with the `params` list in
   * order, so `[CARD_RECIPIENT_TOKEN]` means "argument 1 is the recipient" — the
   * container never sees a recipient registration and never needs to.
   *
   * A parameterized factory deliberately does NOT cache: the arguments differ per
   * call, so a fresh card every time is the only correct answer.
   */
  public card(name: string): string {
    this.#mintCard ??= this.#resolver.resolveFactory<(recipient: ICardRecipient) => GreetingCard>(
      GREETING_CARD_TOKEN,
      [CARD_RECIPIENT_TOKEN],
    );
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
    // The ctor arrives as a runtime PARAMETER, so there is no type argument for
    // a transformer to derive a token from — this call is explicit-token in BOTH
    // dialects. Zero-dep ctor, so the signature list is empty.
    this.#holder.services = this.#holder.services.addClass(GREETING_TOKEN, greeting, [[]], 'singleton');
    return this;
  }

  public useStationery(stationery: ICardStationery): IGreetingWorkshopBuilder {
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

  // The card, registered with NO lifetime — transient, the honest tag for
  // something built fresh per recipient. Its second slot names a token nothing
  // ever registers; that slot is the caller's, and `resolveFactory` is what hands
  // it over.
  holder.services = holder.services.addClass(
    GREETING_CARD_TOKEN,
    GreetingCard,
    [[GREETING_TOKEN, CARD_RECIPIENT_TOKEN]],
  );

  // The workshop itself goes on last so a consumer cannot forget it. The
  // intrinsic RESOLVER_TOKEN slot is how a plugin-less author asks for the live
  // provider view — "I want the provider" is plain DI, not a special slot kind.
  holder.services = holder.services.addClass(
    GREETING_WORKSHOP_TOKEN,
    GreetingWorkshop,
    [[RESOLVER_TOKEN]],
    'singleton',
  );
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
