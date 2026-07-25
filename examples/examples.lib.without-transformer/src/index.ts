// @rhombus-std/examples.lib.without-transformer — a dependency library authored
// in the MANUAL di dialect (explicit tokens + plain-data signatures, no
// transformer). It gets a real build for consistency and genuine consumption,
// but ordinary source-libs conditions are fine: nothing here needs lowering, so
// the raw source is already runnable.

// ── the interop scenario's building blocks ───────────────────────────────────

export { addCasualServices } from './add-casual-services.js';
export { CasualGreeting } from './casual-greeting.js';
export { HealthCheck } from './health-check.js';
export { GREETING_TOKEN, HEALTH_CHECK_TOKEN } from './tokens.js';

// ── the di feature tour ──────────────────────────────────────────────────────

// The checkout container BOTH example apps resolve against. The implementations
// and their registrations live here, in one place, so the two apps' resolution
// demonstrations differ only in how they ASK — which is what makes them
// diffable line for line.
export { addCheckoutServices, AmountIsPositive, AuditTrail, CardGateway, CHECKOUT_TOKENS, fetchExchangeRates,
  InvoiceGateway, MethodIsConfigured, PaymentRouter, Receipt, ReceiptNumbering, TotalWithinLimit,
  WalletGateway } from './resolution-checkout-services.js';

// The library-author infrastructure surface (`IServiceManifestHolder`,
// `resolveFactory`'s caller/container partition, `IServiceProviderFactory`,
// `EmptyServiceProvider`), demonstrated from inside a library because that is
// where those pieces are actually reached for.
export { demonstrateInfrastructure } from './infrastructure-demo.js';
export { addGreetingWorkshop, GREETING_WORKSHOP_TOKEN, GreetingCard, GreetingWorkshop, GreetingWorkshopBuilder,
  ManifestServiceProviderFactory, newWorkshopManifest, PlainStationery,
  WorkshopGreeting } from './infrastructure-greeting-workshop.js';
export type { ICardRecipient, ICardStationery, IGreetingWorkshopBuilder } from './infrastructure-greeting-workshop.js';
