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
//     (`typefor<GreetingWorkshop>()` on both the registration and the lookup),
//     because both sides derive the same type from the same declaration; and
//   - the dependency signatures are MINTED from the constructors themselves —
//     `signatureof(GreetingCard)` — instead of being written out as slot arrays.
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

import { RESOLVER_TYPE } from '@rhombus-std/di.core';
import type { IServiceProvider, Manifest } from '@rhombus-std/di.core';
// The type-driven dependency-signature MINT primitive. It has no runtime
// footprint: the build lowers `signatureof(C)` to the slot arrays a hand author
// would have written, and elides this import along with it.
import { signatureof } from '@rhombus-std/di.extras';
import type { IGreeting } from '@rhombus-std/examples.contracts';
// `typefor<T>()` folds to the very `Type` the registration sugar derives, so a
// lookup written from a type and a registration written from a type cannot drift.
import { typefor } from '@rhombus-std/primitives.extras';

/** The mutable slot a builder exposes so siblings share one manifest. */
interface ManifestSlot<S extends string> {
  services: Manifest<S>;
}

// ── tokens ───────────────────────────────────────────────────────────────────

/**
 * `token(IGreeting)` — the contract the workshop registers a greeting under.
 *
 * Spelled out because the implementation arrives as a runtime parameter, so
 * there is no type at the call site to derive from (see the header). It is
 * written in the same `<import-specifier>:<exported-name>` form the transformer
 * derives, so a reader can check it against what the sugar would produce.
 */
const GREETING_TOKEN = '@rhombus-std/examples.contracts:IGreeting';

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
 * TYPES rather than written out as types.
 *
 * `signatureof(C)` reads the constructor itself — one inner array per overload —
 * and lowers to exactly the `[["…:IGreeting", "…:ICardRecipient"]]` the manual
 * dialect writes by hand.
 *
 * Slot 0 derives `"@rhombus-std/examples.contracts:IGreeting"`, the same type the
 * workshop registers the greeting under. `ICardRecipient` derives one that is
 * never registered anywhere; that is the point — it can only ever be filled by
 * the caller.
 */
const CARD_SIGNATURES = signatureof(GreetingCard);

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

  public constructor(mintCard: (recipient: ICardRecipient) => GreetingCard, stationery?: ICardStationery) {
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
  readonly #resolver: IServiceProvider;

  /** Built on FIRST USE — the provider offers no way to be handed one earlier. */
  #mintCard: ((recipient: ICardRecipient) => GreetingCard) | undefined;

  public readonly stationery: ICardStationery;

  public constructor(resolver: IServiceProvider) {
    this.#resolver = resolver;
    // `getService` is the verb whose miss is `undefined` rather than a
    // throw, which is the whole "use the app's registration if there is one,
    // otherwise build my default" idiom. The good class declares the same thing
    // as an optional parameter.
    this.stationery = (resolver.getService(typefor<ICardStationery>()) as ICardStationery | undefined)
      ?? new PlainStationery();
  }

  /**
   * `resolveFactory(type, params)` IS the caller/container partition, done
   * imperatively: `params` names the types the CALLER supplies, and every other
   * slot in the target's signature resolves from the container. It is the SAME
   * partition {@link GreetingWorkshop} states as a constructor parameter — the
   * only difference is whether the container is asked for it or hands it over.
   */
  public card(name: string): string {
    this.#mintCard ??= this.#resolver.resolveFactory(typefor<GreetingCard>(), [typefor<ICardRecipient>()]) as (
      recipient: ICardRecipient,
    ) => GreetingCard;
    return this.#mintCard({ name }).render(this.stationery.border);
  }

  /**
   * Re-asks the container on every read, because a locator has no other way to
   * know. The good class answers the same question from a field it was handed.
   */
  public get stationeryIsOverridden(): boolean {
    return this.#resolver.isService(typefor<ICardStationery>());
  }
}

// ── the configure(builder) seam ──────────────────────────────────────────────

/**
 * What a consuming application sees inside `addGreetingWorkshop(services, …)`.
 * A fluent, ORDINARY object — no manifest threading, no return value to
 * remember. That ergonomics is bought entirely by the manifest slot; see
 * {@link GreetingWorkshopBuilder}.
 */
export interface IGreetingWorkshopBuilder {
  /** Chooses the greeting implementation every card is rendered with. */
  useGreeting(greeting: new() => IGreeting): IGreetingWorkshopBuilder;
  /** Overrides the library's default stationery. */
  useStationery(stationery: ICardStationery): IGreetingWorkshopBuilder;
}

/**
 * The builder — and the reason the manifest slot exists.
 *
 * A manifest is IMMUTABLE: every verb returns a NEW manifest and leaves the
 * receiver alone. So a builder cannot hold a manifest and register "into" it;
 * whatever it registers would be thrown away the moment its method returned.
 * The alternatives are both bad: hand the consumer the manifest and make them
 * thread the result (`services = builder.useGreeting(...)`), which silently
 * registers NOTHING the one time they forget, or have every builder method
 * return the manifest and give up the fluent chain.
 *
 * `ManifestSlot` is the third option: ONE mutable slot over the immutable chain.
 * The builder reassigns `holder.services` on each call, and the function that
 * owns the holder reads the final chain out at the end. That is how
 * `ILoggingBuilder`, `IMetricsBuilder` and `IHostApplicationBuilder` all work,
 * and handing the SAME holder to several builders is what keeps them on one
 * chain instead of silently dropping each other's registrations.
 */
export class GreetingWorkshopBuilder<S extends string> implements IGreetingWorkshopBuilder {
  readonly #holder: ManifestSlot<S | 'singleton'>;

  public constructor(holder: ManifestSlot<S | 'singleton'>) {
    this.#holder = holder;
  }

  public useGreeting(greeting: new() => IGreeting): IGreetingWorkshopBuilder {
    // Explicit in BOTH dialects: the ctor arrives as a runtime PARAMETER, so
    // there is no class type for the transformer to derive a signature — or a
    // service type — from.
    this.#holder.services = this.#holder.services.addClass(GREETING_TOKEN, greeting, [[]], 'singleton');
    return this;
  }

  public useStationery(stationery: ICardStationery): IGreetingWorkshopBuilder {
    // Tokenless from the other side too: the workshop's optional slot and the
    // locator's `getService` derive the same type this registration does, so the
    // three cannot drift apart.
    this.#holder.services = this.#holder.services.addValue(typefor<ICardStationery>(), stationery);
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
export function addGreetingWorkshop<S extends string>(services: Manifest<S | 'singleton'>,
  configure: (builder: IGreetingWorkshopBuilder) => void): Manifest<S | 'singleton'> {
  const holder: ManifestSlot<S | 'singleton'> = { services };
  configure(new GreetingWorkshopBuilder<S>(holder));

  // The card. Its SERVICE TYPE is derived (`typefor<GreetingCard>()`) and so is
  // its signature, because one of its slots — the recipient — is the caller's
  // and has no registration behind it, which the derivation states rather than
  // hides.
  //
  // No lifetime, so transient: the honest tag for something built fresh per
  // recipient.
  holder.services = holder.services.addClass(typefor<GreetingCard>(), GreetingCard, CARD_SIGNATURES);

  // The workshop itself goes on next so a consumer cannot forget it — and this
  // one is fully tokenless, right down to its dependency signature. The demo
  // resolves it with `getRequiredService(typefor<GreetingWorkshop>())`, which derives the
  // same type from the same class declaration, so neither the callable slot nor
  // the optional stationery slot is ever named at a call site.
  //
  // Both slots are worth reading, because neither is a plain named type:
  // `(recipient: ICardRecipient) => GreetingCard` derives a CALLABLE — return
  // type names what gets built, parameter types name what the CALLER supplies —
  // and `ICardStationery | undefined` derives a UNION with a literal, which is
  // how an OPTIONAL dependency is DECLARED rather than probed for.
  //
  // Registration sugar lowers in any expression context, not only at a module's
  // top level, which is what lets a library function like this one be authored
  // tokenlessly at all.
  holder.services = holder.services.addClass(typefor<GreetingWorkshop>(), GreetingWorkshop,
    signatureof(GreetingWorkshop), 'singleton');

  // The counter-example, at its own derived service type so a caller can resolve
  // both from one container and compare the cards. Its one slot is the intrinsic
  // provider, which `RESOLVER_TYPE` names without deriving anything — "I want the
  // provider" is plain DI rather than a special slot kind, which is precisely why
  // nothing stops a library doing it and why the comparison has to be made in
  // prose.
  holder.services = holder.services.addClass(typefor<LocatorGreetingWorkshop>(), LocatorGreetingWorkshop, [[
    RESOLVER_TYPE,
  ]], 'singleton');

  return holder.services;
}
