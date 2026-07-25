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
//   - the card's activation signature is MINTED from a type tuple with
//     `signaturefor<[IGreeting, ICardRecipient]>()` instead of being written out
//     as a slot array.
//
// Everything else is identical, and deliberately so. `ActivatorUtilities` is a
// RAW-TOKEN API by design — di.core documents its dependency signature as
// something "a `tokenfor`-free caller hand-feeds" — so any registration whose
// token an `ActivatorUtilities` call has to name back stays explicit in BOTH
// dialects. That is the no-transformer-first doctrine working as intended: the
// explicit form is the real API, and the sugar only removes boilerplate where
// there is a type to remove it from.
//
// The scenario is one small library — a "greeting workshop" a consuming
// application configures and then asks for a rendered greeting card. It is
// deliberately self-contained: it builds and owns its OWN container, so nothing
// here lands in (or perturbs) the interop container the example apps assemble.

import { ActivatorUtilities, RESOLVER_TOKEN, ServiceManifest } from '@rhombus-std/di';
import type { IResolver, IServiceManifest, IServiceManifestHolder, IServiceProviderFactory,
  ObjectFactory } from '@rhombus-std/di';
// The type-driven dependency-signature MINT primitive. It has no runtime
// footprint: the build lowers `signaturefor<[A, B]>()` to the slot array a hand
// author would have written and elides this import along with it.
import { signaturefor } from '@rhombus-std/di.core';
import type { IGreeting } from '@rhombus-std/examples.contracts';

// ── tokens ───────────────────────────────────────────────────────────────────

// These two are spelled out because `ActivatorUtilities` takes raw tokens (see
// the header). They are LOCAL to this demo — nothing outside it registers or
// resolves them — and are written in the same `<import-specifier>:<exported-name>`
// form the transformer derives, so a reader can check them against what the
// sugar would produce.

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
 * One rendered greeting card. NOT a service and never registered: there is a
 * fresh one per recipient, and one of its constructor arguments (the recipient)
 * is data the container has no way to know. This is precisely the shape
 * `ActivatorUtilities` exists for — a class whose dependencies are PART
 * container-owned and PART caller-owned.
 */
export class GreetingCard {
  public constructor(
    private readonly greeting: IGreeting,
    private readonly recipient: ICardRecipient,
  ) {}

  public render(border: string): string {
    return `${border} ${this.greeting.greet(this.recipient.name)} ${border}`;
  }
}

/**
 * The activation plan for a {@link GreetingCard}, minted from its constructor's
 * parameter TYPES rather than written out as tokens.
 *
 * `signaturefor<[A, B]>()` is the type-driven sibling of a hand-written
 * `[TOKEN_A, TOKEN_B]` slot array, and lowers to exactly that array — slot 0 to
 * `"@rhombus-std/examples.contracts:IGreeting"`, the same string the manual
 * dialect writes by hand and the same one the workshop registers the greeting
 * under. Slot 1 derives a token for `ICardRecipient`, which is never registered
 * anywhere; that is the point — it can only ever be filled by the caller.
 */
const CARD_SIGNATURE = signaturefor<[IGreeting, ICardRecipient]>();

/**
 * The library's one registered service. It mints {@link GreetingCard}s on
 * demand, which is why it takes the live `IResolver` (the intrinsic provider
 * slot) rather than the greeting directly: a card is built later, per recipient,
 * against whatever the container holds at that moment.
 */
export class GreetingWorkshop {
  readonly #resolver: IResolver;
  readonly #mintCard: ObjectFactory<GreetingCard>;

  /**
   * The stationery in force. `getServiceOrCreateInstance` is the reason this is
   * one line rather than a `tryResolve` + `??` dance: "use the app's
   * registration if there is one, otherwise build my default" is a single verb.
   * Resolved ONCE at construction — the workshop is a singleton, so the answer
   * cannot change under it.
   */
  public readonly stationery: ICardStationery;

  public constructor(resolver: IResolver) {
    this.#resolver = resolver;
    this.stationery = ActivatorUtilities.getServiceOrCreateInstance(
      resolver,
      CARD_STATIONERY_TOKEN,
      PlainStationery,
    ) as ICardStationery;

    // `createFactory` rather than `createInstance` because the workshop mints
    // MANY cards: the slot plan is worked out once here and reused per call.
    // `createInstance` is the one-shot form (used in the demo's degenerate-host
    // section) and is literally `createFactory(...)(provider, args)`.
    this.#mintCard = ActivatorUtilities.createFactory<GreetingCard>(GreetingCard, CARD_SIGNATURE);
  }

  /**
   * Renders a card for `name`. The greeting comes from the container; the
   * recipient is the caller's, passed positionally into the slots the provider
   * could not satisfy.
   *
   * Supplied arguments are matched to unsatisfiable slots LEFT TO RIGHT, not by
   * type — so the argument list must line up with the slots the container
   * cannot fill, in order. Run this against a provider that has no `IGreeting`
   * and the single `recipient` argument lands in the GREETING slot instead; the
   * demo shows what that failure looks like.
   */
  public card(name: string): string {
    const recipient: ICardRecipient = { name };
    return this.#mintCard(this.#resolver, [recipient]).render(this.stationery.border);
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
    // Explicit-token in BOTH dialects, for two reasons worth knowing apart:
    // the ctor arrives as a runtime PARAMETER (so there is no class type to
    // derive a signature from), and the card's activation looks this token up
    // through a raw-token `ActivatorUtilities` call, which has no tokenless
    // form to agree with.
    this.#holder.services = this.#holder.services.addClass(GREETING_TOKEN, greeting, [[]], 'singleton');
    return this;
  }

  public useStationery(stationery: ICardStationery): IGreetingWorkshopBuilder {
    // Same story: `getServiceOrCreateInstance` names this token back.
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
  // The workshop itself goes on last so a consumer cannot forget it — and this
  // one IS tokenless. Nothing looks it up through a raw-token API: the demo
  // resolves it with `resolve<GreetingWorkshop>()`, which derives the same token
  // from the same class type. The dependency signature comes from the class's
  // own constructor, so the intrinsic provider slot never has to be named.
  //
  // Registration sugar lowers in any expression context, not only at a module's
  // top level, which is what lets a library function like this one be authored
  // tokenlessly at all.
  holder.services = holder.services.addClass<GreetingWorkshop>(GreetingWorkshop).as<'singleton'>();
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
    // The one policy this factory imposes: every registration is checked at
    // build time rather than on first resolve, so a mis-wired container fails
    // during startup instead of halfway through a request.
    return containerBuilder.build({ validateOnBuild: true });
  }
}

/** A fresh, empty manifest for this demo's own container. */
export function newWorkshopManifest(): IServiceManifest<'singleton'> {
  return new ServiceManifest<'singleton'>();
}
