// The checkout building blocks BOTH example apps resolve, plus the manual-dialect
// registration function that wires them into a caller's manifest.
//
// Why the implementations live in ONE library rather than being duplicated per
// app: the point of the resolution examples is that the two authoring dialects
// differ ONLY in how they ASK the container for things. Sharing the registrations
// keeps the container identical on both sides, so the two `resolution-demo.ts`
// files can be diffed line for line and every difference is a resolution
// difference.
//
// Everything here is authored in the manual dialect — explicit hand-composed
// Types and plain-data dependency signatures, no transformer. The Types are
// composed exactly as `@rhombus-std/di.extras` derives them for the
// package-public `@rhombus-std/examples.contracts` types, which is what lets
// the tokenless app resolve the very same registrations without composing a
// Type anywhere — the two sides meet on one INTERNED object.
//
// Like every file in this library it imports `@rhombus-std/di.core` and never
// `@rhombus-std/di`: it hands back registrations and leaves the container to the
// application. Two classes below DO take the live provider as a dependency; the
// comments on each say why that is legitimate rather than the usual smell, and
// `PaymentRouter` deliberately sits the discouraged shape next to the correct
// one — an ad-hoc FACTORY parameter — so the comparison is readable in one
// constructor.

import { RESOLVER_TYPE, Type } from '@rhombus-std/di.core';
import type { Inject, IServiceProvider, Manifest, Typeof } from '@rhombus-std/di.core';
import type { CheckoutOrder, IAuditTrail, IExchangeRates, IOrderValidator, IPaymentGateway, IPaymentRouter, IReceipt,
  IReceiptNumbering } from '@rhombus-std/examples.contracts';

// ── types ────────────────────────────────────────────────────────────────────

/**
 * The Types this library registers under, hand-composed with `Type.named(...)`
 * exactly as `@rhombus-std/di.extras` derives them (`Type.named(exportedName,
 * importSpecifier)`, with a generic-wrapper argument for `Wrapper<…>`).
 * Exported so the without-transformer app can resolve against the very same
 * Types; the with-transformer app never names them, because `typefor<T>()`
 * derives the identical, INTERNED object from the contract types themselves.
 */
export const CHECKOUT_TYPES = {
  /** One element type; THREE registrations land on it (see `validators`). */
  validator: Type.named('IOrderValidator', '@rhombus-std/examples.contracts'),
  /** The COLLECTION request over that element type — `IOrderValidator[]` derives this. */
  validators: Type.named('Array', 'global', [Type.named('IOrderValidator', '@rhombus-std/examples.contracts')]),
  /** The keyed BASE. Nothing registers here bare; every gateway carries a key instead. */
  gateway: Type.named('IPaymentGateway', '@rhombus-std/examples.contracts'),
  receipt: Type.named('IReceipt', '@rhombus-std/examples.contracts'),
  numbering: Type.named('IReceiptNumbering', '@rhombus-std/examples.contracts'),
  /** Caller-supplied at factory-call time — deliberately never registered. */
  order: Type.named('CheckoutOrder', '@rhombus-std/examples.contracts'),
  audit: Type.named('IAuditTrail', '@rhombus-std/examples.contracts'),
  /** Registered ONLY in its promise wrapper, so `resolveAsync` is the only way in. */
  ratesPromise: Type.named('Promise', 'global', [Type.named('IExchangeRates', '@rhombus-std/examples.contracts')]),
  /** The bare rates Type a caller ASKS for; the promise registration satisfies it. */
  rates: Type.named('IExchangeRates', '@rhombus-std/examples.contracts'),
  /** Never registered by anyone — the deliberate miss the demos probe for. */
  fraudScreen: Type.named('IFraudScreen', '@rhombus-std/examples.contracts'),
  router: Type.named('IPaymentRouter', '@rhombus-std/examples.contracts'),
  /**
   * The spend ceiling, pinned to a Type of our own choosing rather than the
   * useless `number` the type alone would derive. `TotalWithinLimit`'s
   * constructor brands its parameter `Inject<number, …>` with this same string —
   * that brand is how a with-transformer author gets the identical slot without
   * hand-writing the signature.
   */
  spendLimit: Type.named('CheckoutSpendLimitMinor', '@rhombus-std/examples.contracts'),
  /**
   * di's INTRINSIC provider Type — the ONE entry in this bag that is not
   * hand-composed, because di.core exports the constant. Reach for the constant
   * rather than composing it: it is the Type the transformer derives for
   * `IServiceProvider`, the engine recognises it without any registration
   * existing for it, and a hand-composed copy is one more place for the two to
   * drift apart.
   */
  resolver: RESOLVER_TYPE,
} as const;

/** The gateway base, which every keyed lookup below tags. */
const GATEWAY_TYPE = CHECKOUT_TYPES.gateway;

/**
 * The slot that hands a class the gateway BASE TYPE rather than a gateway. It is
 * an ordinary service type carrying an ordinary value registration — a witness
 * has no special slot kind, because a `Type` is a value like any other.
 */
const GATEWAY_WITNESS_TYPE = Type.named('Typeof', '@rhombus-std/di.core', [GATEWAY_TYPE]);

// ── validators (three registrations, ONE Type — the collection) ─────────────

/**
 * Rejects an order above the configured ceiling.
 *
 * The constructor parameter is branded `Inject<number, "…:CheckoutSpendLimitMinor">`.
 * A bare `number` would derive the Type `number` — every numeric dependency in
 * the process would collide on it — so `Inject` PINS the Type the parameter
 * resolves against, overriding what the type alone would produce. Without a
 * transformer the brand is documentation: the signature below composes the same
 * Type by hand. With one, `signatureof(TotalWithinLimit)` reads the brand and
 * emits byte-identical output. That agreement is the whole reason the brand
 * exists.
 */
export class TotalWithinLimit implements IOrderValidator {
  public readonly name = 'total-within-limit';
  readonly #limitMinor: number;

  public constructor(limitMinor: Inject<number, '@rhombus-std/examples.contracts:CheckoutSpendLimitMinor'>) {
    this.#limitMinor = limitMinor;
  }

  public check(order: CheckoutOrder): string {
    if (order.amountMinor > this.#limitMinor) {
      return `over the ${this.#limitMinor} limit`;
    }
    return 'ok';
  }
}

/** The zero-dependency validator — its signature is the explicit "no deps" `[[]]`. */
export class AmountIsPositive implements IOrderValidator {
  public readonly name = 'amount-is-positive';

  public check(order: CheckoutOrder): string {
    if (order.amountMinor > 0) {
      return 'ok';
    }
    return 'amount must be positive';
  }
}

/**
 * Rejects an order whose payment method has no gateway wired up.
 *
 * This validator takes the CONTAINER as a dependency, which is normally a smell —
 * it hides the real dependencies from anyone reading the constructor. It is the
 * right call here for a specific reason, and the test is worth stating as a rule:
 * ASK WHETHER THE DEPENDENCY COULD HAVE BEEN A PARAMETER. Almost always it could
 * — a thing needed on demand is an ad-hoc FACTORY parameter, not a provider
 * (`PaymentRouter` below has one of each, side by side). Here it could not: the
 * question being asked is "is a gateway registered under the key THIS order
 * names?", and the key does not exist until the order arrives, so no parameter —
 * factory or otherwise — could express it. A `FactoryRef`'s target Type is fixed
 * at registration time; this one is not.
 *
 * Note what it does NOT do: it never resolves a gateway, only probes for one, so
 * it cannot quietly become a service locator for the rest of the checkout.
 *
 * The gateway BASE arrives as a `Typeof<IPaymentGateway>` parameter — a brand
 * that means "inject the TYPE of this service, not an instance of it". A manual
 * author supplies it as a value registration (below); a with-transformer author
 * gets the same value derived from the type argument.
 */
export class MethodIsConfigured implements IOrderValidator {
  public readonly name = 'method-is-configured';
  readonly #resolver: IServiceProvider;
  readonly #gatewayType: Typeof<IPaymentGateway>;

  public constructor(resolver: IServiceProvider, gatewayType: Typeof<IPaymentGateway>) {
    this.#resolver = resolver;
    this.#gatewayType = gatewayType;
  }

  public check(order: CheckoutOrder): string {
    // A key is a TAG on the service type rather than an argument beside it, so a
    // keyed probe tags the base and asks the ordinary question. It never
    // constructs anything — a registered service whose own dependencies are
    // missing still answers `true`.
    if (this.#resolver.isService(Type.tag(this.#gatewayType, order.method))) {
      return 'ok';
    }
    return `no gateway for "${order.method}"`;
  }
}

// ── gateways (three registrations, ONE Type, three KEYS) ────────────────────

/** Registered at `…:IPaymentGateway#card`. */
export class CardGateway implements IPaymentGateway {
  public readonly label = 'card';

  public charge(order: CheckoutOrder): string {
    return `card authorised ${order.amountMinor} for ${order.reference}`;
  }
}

/** Registered at `…:IPaymentGateway#wallet`. */
export class WalletGateway implements IPaymentGateway {
  public readonly label = 'wallet';

  public charge(order: CheckoutOrder): string {
    return `wallet debited ${order.amountMinor} for ${order.reference}`;
  }
}

/** Registered at `…:IPaymentGateway#invoice`. */
export class InvoiceGateway implements IPaymentGateway {
  public readonly label = 'invoice';

  public charge(order: CheckoutOrder): string {
    return `invoice raised ${order.amountMinor} for ${order.reference}`;
  }
}

// ── receipts (the factory-injection target) ─────────────────────────────────

/** A shared counter — registered `"singleton"`, so every receipt gets a distinct number. */
export class ReceiptNumbering implements IReceiptNumbering {
  #issued = 1000;

  public next(): number {
    this.#issued += 1;
    return this.#issued;
  }
}

/**
 * A receipt. Its constructor mixes the two kinds of parameter a PARAMETERIZED
 * factory partitions: `order` is caller-supplied (nothing registers
 * `…:CheckoutOrder`) and `numbering` is resolved from the container. Because of
 * that split, `Receipt` is NOT resolvable on its own — asking for
 * `…:IReceipt` directly fails, since the container cannot invent an order. It is
 * reachable only through the factory form, which is exactly the intent.
 */
export class Receipt implements IReceipt {
  public readonly text: string;

  public constructor(order: CheckoutOrder, numbering: IReceiptNumbering) {
    this.text = `#${numbering.next()} ${order.reference} via ${order.method}`;
  }
}

// ── optional + async services ───────────────────────────────────────────────

/** The optional sink consumers must probe for rather than assume. */
export class AuditTrail implements IAuditTrail {
  readonly #entries: string[] = [];

  public get entries(): readonly string[] {
    return this.#entries;
  }

  public record(entry: string): void {
    this.#entries.push(entry);
  }
}

/**
 * Stands in for a startup fetch of exchange rates. Registered under the PROMISE
 * Type, so a synchronous `resolve` for the bare rates type misses and only
 * `resolveAsync` — which is allowed to satisfy `T` from a `Promise<T>`
 * registration — delivers it.
 */
export async function fetchExchangeRates(): Promise<IExchangeRates> {
  await Promise.resolve(); // stand-in for a real network round-trip
  return { asOf: '2026-01-01', rate: (currency: string): number => (currency === 'GBP' ? 1 : 0.85) };
}

// ── the router (provider injection + factory injection) ─────────────────────

/**
 * Picks a gateway per order and mints a receipt for it.
 *
 * READ THIS CONSTRUCTOR AS A COMPARISON. Both parameters answer "I need
 * something later, not now", and they answer it two different ways — the
 * discouraged one and the correct one, in one signature:
 *
 *   - `mintReceipt` — THE CORRECT ANSWER, and the one to reach for by default. A
 *     dependency that is itself a FACTORY: a parameter typed as a function is not
 *     resolved as an instance; the container injects a callable that builds one
 *     on demand. Because this factory declares a parameter, it is PARAMETERIZED:
 *     `order` comes from the caller, `numbering` from the container, and a fresh
 *     receipt is built per call (a cached receipt would be wrong — the arguments
 *     differ every time). The dependency stays VISIBLE in the constructor, a test
 *     passes a stub function, and no container is involved.
 *
 *   - `resolver` — the live container, and USUALLY the wrong move: it turns a
 *     class's real dependencies invisible, defers every wiring mistake to
 *     runtime, and makes tests stand up a container instead of passing fakes.
 *     Legitimate here for the same reason as in `MethodIsConfigured`: the gateway
 *     is chosen by a KEY that only exists once an order is in hand, and a factory
 *     slot's target Type is FIXED at registration time, so `mintReceipt`'s shape
 *     genuinely cannot express it. That is the whole bar — if a factory parameter
 *     could have done the job, it should have.
 *
 * Note the parameter is spelled as a bare arrow type. That is deliberate and
 * load-bearing: the transformer recognises a factory slot from the SYNTACTIC
 * function-type node, so an alias such as `Func<[CheckoutOrder], IReceipt>` would
 * be derived as an ordinary Type instead.
 */
export class PaymentRouter implements IPaymentRouter {
  readonly #resolver: IServiceProvider;
  readonly #gatewayType: Typeof<IPaymentGateway>;
  readonly #mintReceipt: (order: CheckoutOrder) => IReceipt;

  public constructor(resolver: IServiceProvider, gatewayType: Typeof<IPaymentGateway>,
    mintReceipt: (order: CheckoutOrder) => IReceipt) {
    this.#resolver = resolver;
    this.#gatewayType = gatewayType;
    this.#mintReceipt = mintReceipt;
  }

  public checkout(order: CheckoutOrder): string {
    // The KEYED form: the base type tagged with the method, which is one type
    // and so an ordinary exact lookup. `getRequiredService` (not `getService`)
    // because by this point a validator has already confirmed the method — a
    // miss now is a wiring bug and should be loud.
    const gateway = this.#resolver.getRequiredService(Type.tag(this.#gatewayType, order.method)) as IPaymentGateway;
    return `${gateway.charge(order)} → ${this.#mintReceipt(order).text}`;
  }
}

// ── registration ────────────────────────────────────────────────────────────

/**
 * Registers the whole checkout container into `services`, returning the manifest
 * with those registrations added. The manifest is IMMUTABLE, so the caller must
 * thread the result back in (`services = addCheckoutServices(services)`); the
 * passed-in manifest is left untouched.
 *
 * Kept as its own `add*` entry rather than folded into
 * `addWithoutTransformerExamples`, because the resolution chapter deliberately
 * gets its OWN container: these registrations exist to be resolved against in
 * isolation, and putting them in the application's host container would perturb
 * what every other chapter sees.
 *
 * Registration ORDER is observable and therefore part of the contract: a
 * collection yields its elements in registration order, and so does a keyed
 * plural scan.
 *
 * @param services The application's registration builder.
 */
export function addCheckoutServices<S extends string>(
  services: Manifest<S | 'singleton'>,
): Manifest<S | 'singleton'> {
  const t = CHECKOUT_TYPES;

  // The pinned spend limit `TotalWithinLimit` brands its parameter with.
  services = services.addValue(t.spendLimit, 250_000);

  // THREE registrations under ONE Type. Nothing about the individual calls says
  // "collection" — a collection is simply what you get when you ask for the
  // array wrapper over a Type that several registrations share.
  services = services.addClass(t.validator, TotalWithinLimit, [[t.spendLimit]], 'singleton');
  services = services.addClass(t.validator, AmountIsPositive, [[]], 'singleton');
  // The gateway base type, registered as an ordinary value so the classes that
  // probe by key can be handed it.
  services = services.addValue(GATEWAY_WITNESS_TYPE, GATEWAY_TYPE);

  services = services.addClass(
    t.validator,
    MethodIsConfigured,
    [[t.resolver, GATEWAY_WITNESS_TYPE]],
    'singleton',
  );

  // THREE registrations under one base, each with its own KEY (argument 5). The
  // effective Types are `IPaymentGateway#card`, `#wallet` and `#invoice`; the
  // bare base is left deliberately unregistered, so an unkeyed resolve of
  // `IPaymentGateway` correctly fails rather than silently picking a winner.
  services = services.addClass(t.gateway, CardGateway, [[]], 'singleton', 'card');
  services = services.addClass(t.gateway, WalletGateway, [[]], 'singleton', 'wallet');
  services = services.addClass(t.gateway, InvoiceGateway, [[]], 'singleton', 'invoice');

  // The factory target only has to BE registered — `addClass` here, but a factory
  // or a value registration would serve just as well, since the callable runs the
  // registration's producer rather than `new`-ing the target itself.
  // `…:CheckoutOrder` stays unregistered on purpose: it is the caller-supplied
  // half of the partition.
  services = services.addClass(t.numbering, ReceiptNumbering, [[]], 'singleton');
  services = services.addClass(t.receipt, Receipt, [[t.order, t.numbering]], 'singleton');

  services = services.addClass(t.audit, AuditTrail, [[]], 'singleton');

  // Registered under the PROMISE Type — `resolveAsync` is the only door in.
  services = services.addFactory(t.ratesPromise, fetchExchangeRates, [[]], 'singleton');

  services = services.addClass(
    t.router,
    PaymentRouter,
    // provider slot · witness slot · CALLABLE slot. `Type.func(result, ...args)`
    // says "inject a callable producing `result`, whose own arguments are
    // `args`"; every other slot in the target's signature is resolved from the
    // container instead.
    [[t.resolver, GATEWAY_WITNESS_TYPE, Type.func(t.receipt, t.order)]],
    'singleton',
  );

  return services;
}
