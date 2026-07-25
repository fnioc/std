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
// Everything here is authored in the manual dialect — explicit string tokens and
// plain-data dependency signatures, no transformer. The tokens are spelled
// exactly as `@rhombus-std/di.extras` derives them for the package-public
// `@rhombus-std/examples.contracts` types, which is what lets the tokenless app
// resolve the very same registrations without writing a token anywhere.

import type { Inject, IResolver, IServiceManifest, Typeof } from '@rhombus-std/di';
import type { CheckoutOrder, IAuditTrail, IExchangeRates, IOrderValidator, IPaymentGateway, IPaymentRouter, IReceipt,
  IReceiptNumbering } from '@rhombus-std/examples.contracts';

// ── tokens ───────────────────────────────────────────────────────────────────

/**
 * The token strings this library registers under, hand-written in the derived
 * grammar (`<import-specifier>:<exported-name>`, with `Wrapper<…>` for a generic
 * and `#<key>` for a keyed registration). Exported so the without-transformer app
 * can resolve against the very same strings; the with-transformer app never names
 * them, because the transformer derives these exact bytes from the contract types.
 */
export const CHECKOUT_TOKENS = {
  /** One element token; THREE registrations land on it (see `validators`). */
  validator: '@rhombus-std/examples.contracts:IOrderValidator',
  /** The COLLECTION request over that element token — `IOrderValidator[]` derives this. */
  validators: 'Array<@rhombus-std/examples.contracts:IOrderValidator>',
  /** The keyed BASE. Nothing registers here bare; every gateway adds a `#<method>` suffix. */
  gateway: '@rhombus-std/examples.contracts:IPaymentGateway',
  receipt: '@rhombus-std/examples.contracts:IReceipt',
  numbering: '@rhombus-std/examples.contracts:IReceiptNumbering',
  /** Caller-supplied at factory-call time — deliberately never registered. */
  order: '@rhombus-std/examples.contracts:CheckoutOrder',
  audit: '@rhombus-std/examples.contracts:IAuditTrail',
  /** Registered ONLY in its promise wrapper, so `resolveAsync` is the only way in. */
  ratesPromise: 'Promise<@rhombus-std/examples.contracts:IExchangeRates>',
  /** The bare rates token a caller ASKS for; the promise registration satisfies it. */
  rates: '@rhombus-std/examples.contracts:IExchangeRates',
  /** Never registered by anyone — the deliberate miss the demos probe for. */
  fraudScreen: '@rhombus-std/examples.contracts:IFraudScreen',
  router: '@rhombus-std/examples.contracts:IPaymentRouter',
  /**
   * The spend ceiling, pinned to a token of our own choosing rather than the
   * useless `number` the type alone would derive. `TotalWithinLimit`'s
   * constructor brands its parameter `Inject<number, …>` with this same string —
   * that brand is how a with-transformer author gets the identical slot without
   * hand-writing the signature.
   */
  spendLimit: '@rhombus-std/examples.contracts:CheckoutSpendLimitMinor',
  /**
   * di's INTRINSIC provider token, hand-written. This library depends on di's
   * TYPES only, so it never imports the `RESOLVER_TOKEN` runtime constant; the
   * string is the token the transformer derives for `IResolver`, and the engine
   * recognises it without any registration existing for it.
   */
  resolver: '@rhombus-std/di.core:IResolver',
} as const;

/** The separator between a base token and a resolution key — `base#key`. */
const KEY_SEPARATOR = '#';

// ── validators (three registrations, ONE token — the collection) ─────────────

/**
 * Rejects an order above the configured ceiling.
 *
 * The constructor parameter is branded `Inject<number, "…:CheckoutSpendLimitMinor">`.
 * A bare `number` would derive the token `"number"` — every numeric dependency in
 * the process would collide on it — so `Inject` PINS the token the parameter
 * resolves against, overriding what the type alone would produce. Without a
 * transformer the brand is documentation: the signature below states the same
 * token by hand. With one, `signatureof(TotalWithinLimit)` reads the brand and
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
 * right call here for a specific reason: the question being asked ("is a gateway
 * registered under the key THIS order names?") cannot be answered until the order
 * arrives, so there is no constructor parameter that could express it. Note what
 * it does NOT do: it never resolves a gateway, only probes for one, so it cannot
 * accidentally become a service locator for the rest of the checkout.
 *
 * The gateway BASE token arrives as a `Typeof<IPaymentGateway>` parameter — a
 * brand that means "inject the TOKEN STRING of this type, not an instance of it".
 * A manual author supplies it as a literal slot (`{ value: … }`, below); a
 * with-transformer author gets the same literal derived from the type argument.
 */
export class MethodIsConfigured implements IOrderValidator {
  public readonly name = 'method-is-configured';
  readonly #resolver: IResolver;
  readonly #gatewayToken: Typeof<IPaymentGateway>;

  public constructor(resolver: IResolver, gatewayToken: Typeof<IPaymentGateway>) {
    this.#resolver = resolver;
    this.#gatewayToken = gatewayToken;
  }

  public check(order: CheckoutOrder): string {
    // `isService` takes ONE token and no key, so a keyed probe composes the whole
    // `base#key` string up front. It never constructs anything — a registered
    // service whose own dependencies are missing still answers `true`.
    if (this.#resolver.isService(this.#gatewayToken + KEY_SEPARATOR + order.method)) {
      return 'ok';
    }
    return `no gateway for "${order.method}"`;
  }
}

// ── gateways (three registrations, ONE token, three KEYS) ───────────────────

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
 * token, so a synchronous `resolve` for the bare rates type misses and only
 * `resolveAsync` — which is allowed to satisfy `T` from a `Promise<T>`
 * registration — delivers it.
 */
export async function fetchExchangeRates(): Promise<IExchangeRates> {
  await Promise.resolve(); // stand-in for a real network round-trip
  return {
    asOf: '2026-01-01',
    rate: (currency: string): number => (currency === 'GBP' ? 1 : 0.85),
  };
}

// ── the router (provider injection + factory injection) ─────────────────────

/**
 * Picks a gateway per order and mints a receipt for it.
 *
 * Two dependencies here are worth reading closely:
 *
 *   - `resolver` — the live container. Injecting it is USUALLY the wrong move: it
 *     turns a class's real dependencies invisible, defers every wiring mistake to
 *     runtime, and makes tests set up a container instead of passing fakes. It is
 *     right here for the same reason as in `MethodIsConfigured`: the gateway is
 *     chosen by a KEY that only exists once an order is in hand. The honest test
 *     for "is this legitimate?" is whether the dependency could have been a
 *     constructor parameter. Here it could not.
 *
 *   - `mintReceipt` — a dependency that is itself a FACTORY. A parameter typed as
 *     a function is not resolved as an instance; the container injects a callable
 *     that builds one on demand. Because this factory declares a parameter, it is
 *     PARAMETERIZED: `order` comes from the caller, `numbering` from the
 *     container, and a fresh receipt is built per call (a cached receipt would be
 *     wrong — the arguments differ every time).
 *
 * Note the parameter is spelled as a bare arrow type. That is deliberate and
 * load-bearing: the transformer recognises a factory slot from the SYNTACTIC
 * function-type node, so an alias such as `Func<[CheckoutOrder], IReceipt>` would
 * be derived as an ordinary token instead.
 */
export class PaymentRouter implements IPaymentRouter {
  readonly #resolver: IResolver;
  readonly #gatewayToken: Typeof<IPaymentGateway>;
  readonly #mintReceipt: (order: CheckoutOrder) => IReceipt;

  public constructor(
    resolver: IResolver,
    gatewayToken: Typeof<IPaymentGateway>,
    mintReceipt: (order: CheckoutOrder) => IReceipt,
  ) {
    this.#resolver = resolver;
    this.#gatewayToken = gatewayToken;
    this.#mintReceipt = mintReceipt;
  }

  public checkout(order: CheckoutOrder): string {
    // The KEYED SINGULAR form: base token plus a tail key, which the engine
    // composes into `base#key` before the ordinary exact lookup. `resolve` (not
    // `tryResolve`) because by this point a validator has already confirmed the
    // method — a miss now is a wiring bug and should be loud.
    const gateway = this.#resolver.resolve<IPaymentGateway>(this.#gatewayToken, order.method);
    return `${gateway.charge(order)} → ${this.#mintReceipt(order).text}`;
  }

  public configuredMethods(): readonly string[] {
    // The KEYED PLURAL form: a regex over the KEY PORTION of one fixed base
    // token. `/.+/` means "every non-empty key" — it cannot wander into a
    // different type, and it excludes any bare (unkeyed) registration. Zero
    // matches would be `[]`, never a throw.
    return this.#resolver.resolve<IPaymentGateway>(this.#gatewayToken, /.+/).map((gateway) => gateway.label);
  }
}

// ── registration ────────────────────────────────────────────────────────────

/**
 * Registers the whole checkout container into `services`, returning the manifest
 * with those registrations added. The manifest is IMMUTABLE, so the caller must
 * thread the result back in (`services = addCheckoutServices(services)`); the
 * passed-in manifest is left untouched.
 *
 * Registration ORDER is observable and therefore part of the contract: a
 * collection yields its elements in registration order, and so does a keyed
 * plural scan.
 *
 * @param services The application's registration builder.
 */
export function addCheckoutServices<S extends string>(
  services: IServiceManifest<S | 'singleton'>,
): IServiceManifest<S | 'singleton'> {
  const t = CHECKOUT_TOKENS;

  // The pinned spend limit `TotalWithinLimit` brands its parameter with.
  services = services.addValue(t.spendLimit, 250_000);

  // THREE registrations under ONE token. Nothing about the individual calls says
  // "collection" — a collection is simply what you get when you ask for the
  // array wrapper over a token that several registrations share.
  services = services.addClass(t.validator, TotalWithinLimit, [[t.spendLimit]], 'singleton');
  services = services.addClass(t.validator, AmountIsPositive, [[]], 'singleton');
  services = services.addClass(
    t.validator,
    MethodIsConfigured,
    // The provider slot is an ordinary token; the literal slot `{ value: … }`
    // supplies the gateway base token verbatim, with no container lookup.
    [[t.resolver, { value: t.gateway }]],
    'singleton',
  );

  // THREE registrations under one base, each with its own KEY (argument 5). The
  // effective tokens are `…:IPaymentGateway#card`, `#wallet` and `#invoice`; the
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

  // Registered under the PROMISE token — `resolveAsync` is the only door in.
  services = services.addFactory(t.ratesPromise, fetchExchangeRates, [[]], 'singleton');

  services = services.addClass(
    t.router,
    PaymentRouter,
    // provider slot · literal token slot · FACTORY slot. `{ type, params }` is the
    // plain-data form of "inject a callable producing `type`, whose own arguments
    // are `params`"; everything not named in `params` is resolved from the
    // container instead.
    [[t.resolver, { value: t.gateway }, { type: t.receipt, params: [t.order] }]],
    'singleton',
  );

  return services;
}
