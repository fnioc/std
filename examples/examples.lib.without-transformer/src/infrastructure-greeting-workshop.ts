// The INFRASTRUCTURE surface of `@rhombus-std/di.core` — the parts a LIBRARY
// AUTHOR reaches for, rather than the registration/resolution verbs an
// application composition root uses. Authored in the MANUAL dialect: explicit
// hand-composed Types and plain-data dependency signatures, no transformer.
//
// The scenario is one small library — a "greeting workshop" a consuming
// application configures and then asks for a rendered greeting card. Like every
// library, it CONTRIBUTES REGISTRATIONS and nothing else: `addGreetingWorkshop`
// takes the caller's manifest and hands it back with the workshop in it. The
// application owns the container, so the demo's registrations cannot perturb
// anything the app did not ask them to.
//
// What each piece is here to teach:
//
//   - `ManifestSlot` — the mutable-slot seam that makes a
//     `configure(builder)` callback API possible at all (see the builder below).
//   - THE AD-HOC FACTORY PARAMETER — a library needing to build something on
//     demand asks for a CALLABLE in its constructor, not for the container. The
//     workshop is the worked example, and it is the most important thing in this
//     file.
//   - the discouraged twin — `LocatorGreetingWorkshop` does the same job by
//     injecting the provider, so the two constructors can be read side by side.
//     It exists to be compared against, never to be copied.
//
// The mirror of this file is `../../examples.lib.with-transformer/src/
// infrastructure-greeting-workshop.ts`: the same scenario, the same output, the
// type-driven dialect. Diff them to see exactly what the transformer removes.

import { Type } from '@rhombus-std/di.core';
import type { IServiceProvider, Manifest } from '@rhombus-std/di.core';
import type { IGreeting } from '@rhombus-std/examples.contracts';

import { GREETING_TYPE } from './types.js';

/** The mutable slot a builder exposes so siblings share one manifest. */
interface ManifestSlot<S> {
  services: Manifest<S>;
}

// ── types ────────────────────────────────────────────────────────────────────

// Hand-written with `Type.global(...)`, exactly as `./types.ts` does, because
// the slots below compose these Types — a union, a callable — rather than only
// naming them. These are LOCAL to this demo, so they only have to agree with
// each other. `GREETING_TYPE` is re-used from `./types.js` because the
// workshop registers a real `IGreeting` and the card resolves it back through
// the same slot.

/**
 * The per-card recipient. Deliberately NEVER registered: it is an argument, not
 * a service, and that is the whole point of the factory below — a slot the
 * container cannot fill has to come from the caller.
 */
const CARD_RECIPIENT_TYPE = Type.imported('ICardRecipient', '@rhombus-std/examples.lib.without-transformer');

/** The card stationery. Registered only when the consuming app chooses to override it. */
const CARD_STATIONERY_TYPE = Type.imported('ICardStationery', '@rhombus-std/examples.lib.without-transformer');

/** One rendered card. Registered, but never resolved directly — see {@link GreetingWorkshop}. */
const GREETING_CARD_TYPE = Type.imported('GreetingCard', '@rhombus-std/examples.lib.without-transformer');

/** The workshop service itself — the one thing this library registers unconditionally. */
export const GREETING_WORKSHOP_TYPE: Type = Type.imported('GreetingWorkshop', '@rhombus-std/examples.lib.without-transformer');

/** The discouraged twin, at its own Type so both can be resolved and compared. */
export const LOCATOR_GREETING_WORKSHOP_TYPE: Type = Type.imported('LocatorGreetingWorkshop', '@rhombus-std/examples.lib.without-transformer');

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
 * DEPENDENCY SIGNATURE; a factory slot then splits that signature in two,
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
 * The library's one registered service, and THE worked example of the rule this
 * whole package is built to demonstrate: A LIBRARY NEVER NEEDS THE PROVIDER.
 *
 * The workshop mints a fresh {@link GreetingCard} per recipient, so it genuinely
 * needs something built later, on demand, against whatever the application
 * registered. The tempting answer is to inject the container and look the card
 * up when one is wanted. The correct answer is the constructor below: ASK FOR
 * THE CALLABLE. Both dependencies come in as ordinary parameters —
 *
 *   - `mintCard` is an ad-hoc FACTORY. The registration's slot is a CALLABLE
 *     type, `Type.func(GREETING_CARD_TYPE, [[CARD_RECIPIENT_TYPE]])`: the return
 *     type is what the callable produces, and its argument types are the ones
 *     the CALLER supplies, so every other slot in the target's signature is
 *     resolved from the container as usual. The container hands over a
 *     `(recipient) => GreetingCard` already wired to the app's greeting, and the
 *     recipient — which no registration stands behind, and none should — arrives
 *     per call. A parameterized factory deliberately does not cache: the
 *     arguments differ every time, so a fresh card is the only correct answer.
 *
 *   - `stationery` is OPTIONAL, spelled as the union of its type with a literal
 *     `undefined`. A literal is the union's FALLBACK rather than a competitor,
 *     so an app that registered stationery gets it and an app that did not gets
 *     `undefined` — absence as a legitimate deployment shape rather than a
 *     wiring bug.
 *
 * What this buys, and it is not stylistic. The class's real dependencies are
 * visible in its own signature; a test constructs it with two plain values and
 * no container at all; the wiring mistakes that a locator defers to the first
 * `card()` call surface when the workshop is built; and there is no memo to
 * keep, because the container worked the slot plan out once at construction.
 *
 * Compare with {@link LocatorGreetingWorkshop} below, which is this class
 * rewritten the wrong way.
 */
export class GreetingWorkshop {
  readonly #mintCard: (recipient: ICardRecipient) => GreetingCard;
  readonly #overridden: boolean;

  /**
   * The stationery in force — the app's registration when there is one, the
   * library's default otherwise. Resolved ONCE, at construction: the workshop is
   * a singleton, so the answer cannot change under it.
   */
  public readonly stationery: ICardStationery;

  public constructor(mintCard: (recipient: ICardRecipient) => GreetingCard, stationery?: ICardStationery) {
    this.#mintCard = mintCard;
    // Recorded here rather than asked of the container later, which is the point:
    // "did the app override this?" is answerable from the parameter itself.
    this.#overridden = stationery !== undefined;
    this.stationery = stationery ?? new PlainStationery();
  }

  /**
   * Renders a card for `name`. The greeting comes from the container; the
   * recipient is the caller's.
   */
  public card(name: string): string {
    return this.#mintCard({ name }).render(this.stationery.border);
  }

  /** Whether the app registered its own stationery, or the library default is in force. */
  public get stationeryIsOverridden(): boolean {
    return this.#overridden;
  }
}

/**
 * THE DISCOURAGED TWIN — the same workshop, written as a service locator. It is
 * here to be compared against {@link GreetingWorkshop} above, which is the
 * answer; do not copy this shape into a library.
 *
 * Everything it does, the class above does better. Read the two constructors
 * together and the cost is plain: this one declares a single `IServiceProvider`
 * parameter, so its REAL dependencies — a card factory and some stationery — are
 * invisible to anyone reading the signature, invisible to the container's
 * validation, and discoverable only by reading the method bodies. A test cannot
 * pass fakes; it has to stand up a container. A typo in a hand-composed Type
 * survives construction and fails at the first `card()` call, in production,
 * on the request that happened to need one.
 *
 * The verbs it uses are all perfectly good verbs — this is not a lesson about
 * `getService` or `resolve` being wrong. It is a lesson about WHERE
 * they belong: at a composition root, which knows what it is composing, rather
 * than inside a library, which does not.
 *
 * There is exactly one thing it can do that the class above cannot: it
 * CONSTRUCTS against a provider that holds no cards at all, because it defers
 * every lookup. A class whose factory slot is filled at construction cannot be
 * built against such a provider, which is the good failure, at the honest
 * moment.
 */
export class LocatorGreetingWorkshop {
  readonly #resolver: IServiceProvider;

  /**
   * The card factory, built on FIRST USE and then reused. Resolving
   * `Type.func(GREETING_CARD_TYPE, [[CARD_RECIPIENT_TYPE]])` works the slot plan out
   * once — which slot the caller fills, which the container resolves — so paying
   * for that per card would be waste. The memo is pure overhead the
   * injected-callable version does not have: the container already did this work.
   */
  #mintCard: ((recipient: ICardRecipient) => GreetingCard) | undefined;

  /**
   * `resolve` over a union-with-`undefined` address, plus `??`, is the whole
   * "use the app's registration if there is one, otherwise build my default"
   * idiom: the literal fallback is what answers `undefined` rather than a
   * throw. The union slot on the good class expresses exactly this,
   * declaratively.
   */
  public readonly stationery: ICardStationery;

  public constructor(resolver: IServiceProvider) {
    this.#resolver = resolver;
    this.stationery = (resolver.resolve(Type.union(CARD_STATIONERY_TYPE, Type.typeLiteral(undefined))) as ICardStationery | undefined)
      ?? new PlainStationery();
  }

  /**
   * `Type.func(result, [[...args]])` IS the partition, spelled as a type: the listed
   * arguments are the ones the CALLER supplies, and every other slot in the
   * target's signature resolves from the container.
   * `Type.func(GREETING_CARD_TYPE, [[CARD_RECIPIENT_TYPE]])` means "a callable producing a card, whose one argument
   * is the recipient" — the same plan the good class receives as a constructor
   * parameter, except asked for here in a method body where nothing can check it.
   */
  public card(name: string): string {
    this.#mintCard ??= this.#resolver.getService(
      Type.func(GREETING_CARD_TYPE, [[CARD_RECIPIENT_TYPE]]),
    ) as (recipient: ICardRecipient) => GreetingCard;
    return this.#mintCard({ name }).render(this.stationery.border);
  }

  /** Whether the app registered its own stationery, asked of the container rather than known. */
  public get stationeryIsOverridden(): boolean {
    return this.#resolver.resolve(Type.union(CARD_STATIONERY_TYPE, Type.typeLiteral(undefined))) !== undefined;
  }
}

// ── the configure(builder) seam ──────────────────────────────────────────────

/**
 * What a consuming application sees inside `addGreetingWorkshop(services, …)`.
 * A fluent, ORDINARY object — no manifest threading, no return value to
 * remember. That ergonomics is bought entirely by
 * {@link ManifestSlot}; see {@link GreetingWorkshopBuilder}.
 */
export interface IGreetingWorkshopBuilder {
  /** Chooses the greeting implementation every card is rendered with. */
  useGreeting(greeting: new() => IGreeting): IGreetingWorkshopBuilder;
  /** Overrides the library's default stationery. */
  useStationery(stationery: ICardStationery): IGreetingWorkshopBuilder;
}

/**
 * The builder — and the reason `ManifestSlot` exists.
 *
 * A manifest is IMMUTABLE: every verb returns a NEW manifest and leaves the
 * receiver alone. So a builder cannot hold a manifest and register "into" it;
 * whatever it registered would be thrown away the moment its method returned.
 * The alternatives are both bad: hand the consumer the manifest and make them
 * thread the result (`services = builder.useGreeting(...)`), which silently
 * registers NOTHING the one time they forget, or have every builder method
 * return the manifest and give up the fluent chain.
 *
 * `ManifestSlot` is the third option: ONE mutable slot over the
 * immutable chain. The builder reassigns `holder.services` on each call, and the
 * function that owns the holder reads the final chain out at the end. That is
 * how `ILoggingBuilder`, `IMetricsBuilder` and `IHostApplicationBuilder` all
 * work, and handing the SAME holder to several builders is what keeps them on
 * one chain instead of silently dropping each other's registrations.
 */
export class GreetingWorkshopBuilder<S> implements IGreetingWorkshopBuilder {
  readonly #holder: ManifestSlot<S | 'singleton'>;

  public constructor(holder: ManifestSlot<S | 'singleton'>) {
    this.#holder = holder;
  }

  public useGreeting(greeting: new() => IGreeting): IGreetingWorkshopBuilder {
    // The ctor arrives as a runtime PARAMETER, so there is no type argument for
    // a transformer to derive a Type from — this call is explicit in BOTH
    // dialects. Zero-dep ctor, so the composed constructor type carries no
    // argument types beyond the address.
    this.#holder.services = this.#holder.services.add(GREETING_TYPE, greeting, Type.ctor(GREETING_TYPE, [[]]), 'singleton' as S | 'singleton');
    return this;
  }

  public useStationery(stationery: ICardStationery): IGreetingWorkshopBuilder {
    this.#holder.services = this.#holder.services.add(CARD_STATIONERY_TYPE, stationery);
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
export function addGreetingWorkshop<S>(services: Manifest<S | 'singleton'>, configure: (builder: IGreetingWorkshopBuilder) => void): Manifest<S | 'singleton'> {
  const holder: ManifestSlot<S | 'singleton'> = { services };
  configure(new GreetingWorkshopBuilder<S>(holder));

  // The card, registered with NO lifetime — transient, the honest tag for
  // something built fresh per recipient. Its second argument type names a Type
  // nothing ever registers; that slot is the caller's, and the factory
  // parameter below is what hands it over.
  holder.services = holder.services.add(GREETING_CARD_TYPE, GreetingCard, Type.ctor(GREETING_CARD_TYPE, [[GREETING_TYPE, CARD_RECIPIENT_TYPE]]), undefined as S | 'singleton');

  // The workshop itself goes on last so a consumer cannot forget it. Its whole
  // dependency plan is right here, in the composed constructor type, where the
  // container can check it: a CALLABLE argument for the card (whose own
  // argument types are the caller's half) and an OPTIONAL stationery argument,
  // spelled as the union of the stationery with a literal `undefined` that
  // always resolves.
  holder.services = holder.services.add(GREETING_WORKSHOP_TYPE, GreetingWorkshop,
    Type.ctor(GREETING_WORKSHOP_TYPE, [[Type.func(GREETING_CARD_TYPE, [[CARD_RECIPIENT_TYPE]]), Type.union(CARD_STATIONERY_TYPE, Type.typeLiteral(undefined))]]), 'singleton' as S | 'singleton');

  // The discouraged twin, registered beside it so a reader can resolve both and
  // watch them produce identical cards from very different constructors. The
  // reserved `'ServiceProvider'` token is how a plugin-less author asks for the
  // live provider — "I want the provider" is plain DI, not a special slot
  // kind, which is precisely why nothing stops a library doing it and why the
  // comparison has to be made in prose.
  holder.services = holder.services.add(LOCATOR_GREETING_WORKSHOP_TYPE, LocatorGreetingWorkshop, Type.ctor(LOCATOR_GREETING_WORKSHOP_TYPE, [[Type.from('ServiceProvider')]]),
    'singleton' as S | 'singleton');
  return holder.services;
}
