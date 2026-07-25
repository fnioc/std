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
//     `signaturesfor<[[A, B]]>()` for the card's whole set, `withSignature<[A, B]>()`
//     for the workshop's one appended overload, `signaturefor<[A]>()` for the
//     locator's — instead of being written out as slot arrays.
//
// Everything else is identical, and deliberately so. Where a token names
// something that has no type to derive from — a ctor arriving as a runtime
// parameter, a slot the CALLER fills rather than the container — the explicit
// form is the only form, in both dialects. That is the no-transformer-first
// doctrine working as intended: the explicit form is the real API, and the sugar
// only removes boilerplate where there is a type to remove it from.
//
// The scenario is one small library — a "greeting workshop" a consuming
// application configures and then asks for a rendered greeting card. Nothing in
// this file builds a container: `addGreetingWorkshop` registers into the manifest
// it was handed and gives it back, and the application decides what to do with
// the result. That is the rule the whole package holds to, and it is why the only
// di-family import below is `@rhombus-std/di.core`.
//
// The file also carries the ONE deliberately-discouraged shape in the package:
// {@link LocatorGreetingWorkshop} is {@link GreetingWorkshop} rewritten to take
// the live provider and look its dependencies up. It is registered beside the
// good one and prints the identical card, so a reader can hold the two
// constructors side by side. The comparison IS the lesson; neither class is
// interesting without the other.

import type { IResolver, IServiceManifest, IServiceManifestHolder } from '@rhombus-std/di.core';
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
 * DEPENDENCY SIGNATURE; a FACTORY slot then splits that signature in two, filling
 * the greeting slot from the container and leaving the recipient slot to whoever
 * calls the factory.
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
 * The locator twin's signature, minted with the SINGULAR `signaturefor<[…]>()` —
 * one type tuple in, one `DepSlot[]` out, appended by the REPEATABLE
 * `withSignature`. The two mint primitives say opposite things about a
 * registration's future: the bulk form above forbids further overloads, this one
 * invites them, which is how a library builds a set up conditionally.
 *
 * `IResolver` derives the intrinsic provider token, so even the "give me the
 * container" slot never has to be spelled — which is worth seeing precisely
 * because it is the slot this file argues against reaching for.
 *
 * Held as a const and SPREAD into the call, rather than written as the
 * `withSignature<T>()` sugar the workshop below uses: the two forms lower to the
 * same append, and having one of each keeps both the source-written primitive and
 * the sugar visible in one file.
 */
const LOCATOR_SIGNATURE = signaturefor<[IResolver]>();

/**
 * The library's one real service, and the model citizen of the package: it mints
 * {@link GreetingCard}s on demand WITHOUT ever holding the container.
 *
 * "On demand" is what usually pushes a class into taking the provider. A card is
 * built later, once per recipient, from data the container cannot know — so the
 * obvious move is to keep the provider around and ask it for a card factory when
 * one is wanted. The obvious move is wrong, for a reason worth stating plainly: a
 * class holding the provider has dependencies its constructor does not declare.
 * Nobody reading the signature can see what it needs, no test can supply them
 * without standing up a container, and an eager whole-graph validation has
 * nothing to check.
 *
 * The answer is to ask for the FACTORY as a parameter. `mintCard` is an ordinary
 * function the container hands over at construction — already partitioned, so
 * calling it supplies only the recipient — and `stationery` is an ordinary
 * optional parameter. Both are visible in the constructor, both arrive filled,
 * and the class never learns that a container exists.
 *
 * {@link LocatorGreetingWorkshop} is this same class written the other way. It
 * produces identical cards and is registered right beside this one so the two can
 * be resolved and compared; it is there as the counter-example, not as an
 * alternative.
 */
export class GreetingWorkshop {
  /**
   * The card factory, handed over ALREADY BUILT. The container worked the slot
   * plan out once, at registration — which slot the caller fills, which it
   * resolves — so there is nothing to memoise and no first-use branch. The lazy
   * `#mintCard ??= …` this class used to carry existed only because the provider
   * arrived where the factory should have.
   *
   * The factory deliberately does not cache its RESULT either: the arguments
   * differ per call, so a fresh card every time is the only correct answer.
   */
  readonly #mintCard: (recipient: ICardRecipient) => GreetingCard;

  /**
   * The stationery in force. The optional parameter carries the whole "use the
   * app's registration if there is one, otherwise build my default" idiom by
   * itself — absence arrives as `undefined` rather than as a throw, which is what
   * makes an unregistered stationery a legitimate deployment shape instead of a
   * wiring bug.
   */
  public readonly stationery: ICardStationery;

  /**
   * Whether the app registered its own stationery, or the library default is in
   * force. Settled at construction, because the answer arrived with the argument:
   * there is no container to re-ask, and a singleton could not see a different
   * answer later anyway.
   */
  public readonly stationeryIsOverridden: boolean;

  public constructor(
    mintCard: (recipient: ICardRecipient) => GreetingCard,
    stationery?: ICardStationery,
  ) {
    this.#mintCard = mintCard;
    this.stationeryIsOverridden = stationery !== undefined;
    this.stationery = stationery ?? new PlainStationery();
  }

  /**
   * Renders a card for `name`. The greeting comes from the container, the
   * recipient from the caller — and which is which was decided by the factory
   * slot pinned by {@link addGreetingWorkshop}, not by anything this method does.
   */
  public card(name: string): string {
    return this.#mintCard({ name }).render(this.stationery.border);
  }
}

/**
 * THE DISCOURAGED SHAPE, kept on purpose. {@link GreetingWorkshop} above is the
 * answer; this is what the same library looks like when it takes the container
 * instead, registered beside the good one so an application can resolve both and
 * watch them print the identical card.
 *
 * Everything wrong with it is visible in the constructor: `resolver: IResolver`.
 * From that signature you cannot tell that this class needs a `GreetingCard`
 * registration and consults `ICardStationery` — you have to read the body. Every
 * other cost follows from that one fact: a test has to stand up a container
 * rather than pass two arguments, an eager whole-graph validation has no slots to
 * check, and a missing registration surfaces at the first `card()` call instead
 * of at construction. Reaching into the container for whatever you need is the
 * service-locator pattern, and taking the provider as a dependency is how it gets
 * in.
 *
 * It is not always wrong, which is why this is a comparison rather than a
 * prohibition: it is the shape you are forced into when what you need is chosen
 * by a KEY that does not exist until runtime, and no fixed factory slot can
 * express that. `@rhombus-std/examples.lib.without-transformer`'s `PaymentRouter`
 * is exactly that case, and says so. This class has no such excuse — every lookup
 * below has a parameter form sitting above it — which is what makes it the
 * counter-example.
 *
 * As a side effect it keeps `resolveFactory` / `tryResolve` / `isService` and the
 * intrinsic provider slot demonstrated from inside a library, in the tokenless
 * dialect, which is where a reader is most likely to meet them.
 */
export class LocatorGreetingWorkshop {
  readonly #resolver: IResolver;

  /** Built on FIRST USE — the provider offers no way to be handed one earlier. */
  #mintCard: ((recipient: ICardRecipient) => GreetingCard) | undefined;

  public readonly stationery: ICardStationery;

  public constructor(resolver: IResolver) {
    this.#resolver = resolver;
    // Explicit-token: `ICardStationery` is registered under a token the app may
    // or may not have written, and this class names it back — the same string
    // the builder's `useStationery` registers it under.
    this.stationery = resolver.tryResolve<ICardStationery>(CARD_STATIONERY_TOKEN)
      ?? new PlainStationery();
  }

  /**
   * In this dialect the whole caller/container partition rides on ONE function
   * type: `resolve<(recipient: ICardRecipient) => GreetingCard>()` lowers to
   * `resolveFactory("…:GreetingCard", ["…:ICardRecipient"])`. It is the SAME type
   * {@link GreetingWorkshop} states as a constructor parameter — the only
   * difference is whether the container is asked for it or hands it over.
   */
  public card(name: string): string {
    this.#mintCard ??= this.#resolver.resolve<(recipient: ICardRecipient) => GreetingCard>();
    return this.#mintCard({ name }).render(this.stationery.border);
  }

  /**
   * Re-asks the container on every read, because a locator has no other way to
   * know. The good class answers the same question from a field it was handed.
   */
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
    // Same story from the other side: the workshop's optional slot and the
    // locator's `tryResolve` both name this token, so the registration has to
    // agree with it by hand.
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
 * Like every `add*` in this repo it takes the caller's manifest and hands one
 * back. It never makes one, and it never builds one.
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

  // The workshop itself goes on next so a consumer cannot forget it — and this
  // one is fully tokenless, right down to its dependency signature. The demo
  // resolves it with `resolve<GreetingWorkshop>()`, which derives the same token
  // from the same class type; `withSignature<[…]>()` PINS the overload from a type
  // tuple, so neither the factory slot nor the optional stationery slot is ever
  // named at a call site.
  //
  // Pinning is a deliberate choice, and this constructor is the case that earns
  // the line: `addClass<T>(C)` DERIVES the signature from the ctor, and a derived
  // signature TRACKS the ctor — so the day someone adds a third, defaulted
  // parameter it silently becomes a third injected slot, and a new way for the
  // registration to stop being satisfiable. Stating the two slots makes that an
  // edit a reviewer sees. Both are worth reading, because neither is a plain
  // token: `(recipient: ICardRecipient) => GreetingCard` lowers to the factory
  // slot `{ type: "…:GreetingCard", params: ["…:ICardRecipient"] }` — return type
  // names what gets built, parameter types name what the CALLER supplies — and
  // `ICardStationery | undefined` lowers to the union slot
  // `{ union: ["…:ICardStationery", { value: undefined }] }`, which is how an
  // OPTIONAL dependency is DECLARED rather than probed for.
  //
  // Registration sugar lowers in any expression context, not only at a module's
  // top level, which is what lets a library function like this one be authored
  // tokenlessly at all.
  holder.services = holder.services
    .addClass<GreetingWorkshop>(GreetingWorkshop)
    .withSignature<[(recipient: ICardRecipient) => GreetingCard, ICardStationery | undefined]>()
    .as<'singleton'>();

  // The counter-example, at its own derived token so a caller can resolve both
  // from one container and compare the cards. Its one slot is the intrinsic
  // provider — spread in from `LOCATOR_SIGNATURE` rather than stated inline, so
  // the file shows both ways of supplying a pinned overload.
  holder.services = holder.services
    .addClass<LocatorGreetingWorkshop>(LocatorGreetingWorkshop)
    .withSignature(...LOCATOR_SIGNATURE)
    .as<'singleton'>();

  return holder.services;
}
