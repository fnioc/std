// The contract surface for the RESOLUTION demonstration — a small checkout
// pipeline that exercises every way a consumer can ask the container for
// something: required and non-throwing lookups, registration probes, collections,
// keys, factories, async, and the provider itself.
//
// These types live in the shared contracts package for the same reason the
// greeting contracts do: the transformer derives a `Type` from a type's
// PACKAGE-PUBLIC path, so a contract exported from here derives
// `Type.named('IPaymentGateway', '@rhombus-std/examples.contracts')` — a Type
// the manual dialect can compose verbatim. Declaring them inside an application
// instead would derive an app-private Type, and the two dialects could no
// longer be compared line for line.
//
// PURE TYPES — no runtime code, so every `import type` of these erases.

/**
 * The order being checked out — a plain DATA shape, not a service, hence no `I`
 * prefix. It is deliberately NEVER registered in the container: it is the
 * caller-supplied argument of a PARAMETERIZED factory (`(order) => IReceipt`),
 * which is the whole point of that form — the container fills what it knows and
 * the caller fills what only the call site knows.
 */
export interface CheckoutOrder {
  readonly reference: string;
  readonly amountMinor: number;
  /**
   * The payment method the buyer chose. It doubles as the resolution KEY: each
   * gateway registers under `…:IPaymentGateway#<method>`, so choosing a gateway
   * is a keyed lookup rather than a switch statement the library has to own.
   */
  readonly method: string;
}

/**
 * One check in the validation pipeline. MANY implementations register under this
 * ONE Type, which is what makes it a COLLECTION: an app resolving
 * `IOrderValidator[]` gets every registration in registration order. This is the
 * shape to reach for whenever "there can be more than one and they all run" —
 * validators, handlers, middleware, plugins.
 */
export interface IOrderValidator {
  /** Stable identifier used in the report, so the output is order-independent to read. */
  readonly name: string;
  /** `"ok"`, or a human-readable reason the order was rejected. */
  check(order: CheckoutOrder): string;
}

/**
 * A payment backend. Several are registered at once, each under its own KEY, and
 * exactly one is selected per order. A key is not a second resolution system —
 * it is a `#<key>` suffix on the ordinary Type, so `IPaymentGateway#card` is
 * just another Type the exact lookup finds.
 */
export interface IPaymentGateway {
  readonly label: string;
  charge(order: CheckoutOrder): string;
}

/** The document minted for a completed checkout. */
export interface IReceipt {
  readonly text: string;
}

/** A shared, monotonically increasing receipt number — one instance per container. */
export interface IReceiptNumbering {
  next(): number;
}

/**
 * An OPTIONAL cross-cutting service. It happens to be registered here, but the
 * point of the type is that consumers must not ASSUME it: they reach it with
 * `tryResolve` / `isService` so the same code runs in a deployment that never
 * wired an audit sink.
 */
export interface IAuditTrail {
  readonly entries: readonly string[];
  record(entry: string): void;
}

/**
 * The service that is deliberately NEVER registered. It exists so the examples
 * can show what a MISS looks like on each verb — `resolve` throws,
 * `tryResolve` returns `undefined`, `isService` answers `false` — without having
 * to invent a fake Type nobody would ever write.
 */
export interface IFraudScreen {
  screen(order: CheckoutOrder): string;
}

/**
 * Rates fetched once at startup. Registered ONLY as `Promise<IExchangeRates>`,
 * never bare, so the sole way to reach it is `resolveAsync`, which awaits the
 * honest `Promise<T>` registration before handing back the value.
 */
export interface IExchangeRates {
  readonly asOf: string;
  rate(currency: string): number;
}

/**
 * The service that picks a gateway per order. It is the one place in this
 * example where injecting the container itself is the RIGHT answer: which
 * gateway to use is not known until an order arrives, so the choice cannot be
 * expressed as a constructor dependency.
 */
export interface IPaymentRouter {
  checkout(order: CheckoutOrder): string;
}
