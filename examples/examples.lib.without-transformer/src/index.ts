// @rhombus-std/examples.lib.without-transformer — a dependency library authored
// in the MANUAL di dialect (explicit tokens + plain-data signatures, no
// transformer). It gets a real build for consistency and genuine consumption,
// but ordinary source-libs conditions are fine: nothing here needs lowering, so
// the raw source is already runnable.
//
// THE POINT OF THIS PACKAGE is that it depends on `@rhombus-std/di.core` and
// NOT on `@rhombus-std/di`. Everything a library legitimately does — declaring
// dependencies, contributing registrations, offering a `configure(builder)` API,
// reading a manifest as data, reasoning about tokens, catching container errors —
// is reachable from the abstractions package alone. The engine is the
// application's choice, so the application makes it: each export below either
// registers INTO a manifest it was handed, or takes what it needs (a provider, a
// way to build one) as an ordinary parameter.
//
// Nothing here constructs a manifest, calls `build()`, or decides that there
// should be a container. Where a demonstration needed one of those it lives in
// the example apps instead — and the seam it left behind is named at the point
// it moved.
//
// What library code here DOES do with a container, it does only to something it
// was handed. `MethodIsConfigured` and `PaymentRouter` take an
// `IServiceProvider` because the key they look up does not exist until an order
// arrives, and each says so at its own definition; `LocatorGreetingWorkshop`
// takes one for no such reason and is labelled the discouraged shape wherever it
// appears. The line is not "never touch a provider" — it is "never REACH for
// one": every provider that reaches this package arrived as a parameter somebody
// else filled.

// ── the library's front door ─────────────────────────────────────────────────

export { addWithoutTransformerExamples } from './add-without-transformer-examples.js';
export { CasualGreeting } from './casual-greeting.js';
export { HealthCheck } from './health-check.js';
export { GREETING_TYPE, HEALTH_CHECK_TYPE } from './types.js';

// ── the di feature tour ──────────────────────────────────────────────────────

// The checkout registrations BOTH example apps resolve against. The
// implementations and their `add*` function live here, in one place, so the two
// apps' resolution demonstrations differ only in how they ASK — which is what
// makes them diffable line for line.
export { addCheckoutServices, AmountIsPositive, AuditTrail, CardGateway, CHECKOUT_TYPES, fetchExchangeRates,
  InvoiceGateway, MethodIsConfigured, PaymentRouter, Receipt, ReceiptNumbering, TotalWithinLimit,
  WalletGateway } from './resolution-checkout-services.js';

// The library-author infrastructure surface: the manifest-slot
// configure-callback seam, the AD-HOC FACTORY PARAMETER that is why a library
// never needs the provider, and the discouraged locator twin it is compared
// against.
export { addGreetingWorkshop, GREETING_WORKSHOP_TYPE, GreetingCard, GreetingWorkshop, GreetingWorkshopBuilder,
  LOCATOR_GREETING_WORKSHOP_TYPE, LocatorGreetingWorkshop, PlainStationery,
  WorkshopGreeting } from './infrastructure-greeting-workshop.js';
export type { ICardRecipient, ICardStationery, IGreetingWorkshopBuilder } from './infrastructure-greeting-workshop.js';

// The DIALECT-INDEPENDENT chapter: an error class has no type-driven form to
// have a twin of, so both example apps run this one rather than a
// with-transformer mirror, and their header lines say so.

// The error taxonomy, CLASSIFIED. Every class the container can throw is a
// di.core export, so the whole branch table fits here — `diagnose` reads any of
// them, `describeDiError` answers the cheaper "is this ours at all". What a
// library cannot do is PROVOKE them, since that takes a built container, so each
// app stages them and calls back in through `stagedFailure`. The manifest's own
// argument checking throws from the registration call and needs nothing built,
// so that one staging lives here — marking where the taxonomy stops.
export { demonstrateRegistrationErrors, describeDiError, diagnose, stagedFailure } from './errors-demo.js';
