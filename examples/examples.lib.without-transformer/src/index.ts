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

// The three DIALECT-INDEPENDENT chapters. None of them has a type-driven form to
// have a twin of — an error class, a token string and a manifest's own data
// structure are all the same in either dialect — so both example apps run these
// rather than a with-transformer mirror, and their header lines say so.

// Every failure the container can raise, provoked on purpose and turned into an
// operator-facing line.
export { demonstrateErrors, diagnose } from './errors-demo.js';

// The token/slot ABI, exercised as a container-diagnostics tool would: classify,
// parse, walk, rewrite, match, rank, and close a template.
export { classify, closeAgainst, demonstrateTokenAbi, describeRegistrations, describeSlot, describeTree, explainMatch,
  isResolvableSlot, PackageCollector, PackageRenamer, rankBySpecificity, slotRoundTrips } from './token-abi-demo.js';

// The manifest as a value: the augmentation receiver, the standalone call
// surface, the intrinsic primitives, and a test host built on all three.
export { addShopServices, asSingleton, auditToken, authoringMintsIn, buildProvider, demonstrateManifestSurface,
  describeSeal, forTests, inScope, isRegistrationBuilder, missingFrom, repointFirstSlot, requireCheckout,
  withoutToken } from './manifest-surface-demo.js';
export type { AuthoringSurface, IChainFaces, LegacyScope, NormalisedProducer,
  Registerable } from './manifest-surface-demo.js';
