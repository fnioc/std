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
// was handed. Three functions in `./manifest-surface-demo.ts` take one narrow
// face of a provider apiece (`IServiceQuery`, `IRequiredResolver`,
// `IScopeFactory`) and one of them opens a per-request frame, because that is
// what those di.core interfaces exist for and library code is what asks for
// them. `LocatorGreetingWorkshop` takes the whole `IResolver` and is labelled
// the discouraged shape wherever it appears. The line is not "never touch a
// provider" — it is "never REACH for one": every provider that reaches this
// package arrived as a parameter somebody else filled.

// ── the library's front door ─────────────────────────────────────────────────

export { addWithoutTransformerExamples } from './add-without-transformer-examples.js';
export { CasualGreeting } from './casual-greeting.js';
export { HealthCheck } from './health-check.js';
export { GREETING_TOKEN, HEALTH_CHECK_TOKEN } from './tokens.js';

// ── the di feature tour ──────────────────────────────────────────────────────

// The checkout registrations BOTH example apps resolve against. The
// implementations and their `add*` function live here, in one place, so the two
// apps' resolution demonstrations differ only in how they ASK — which is what
// makes them diffable line for line.
export { addCheckoutServices, AmountIsPositive, AuditTrail, CardGateway, CHECKOUT_TOKENS, fetchExchangeRates,
  InvoiceGateway, MethodIsConfigured, PaymentRouter, Receipt, ReceiptNumbering, TotalWithinLimit,
  WalletGateway } from './resolution-checkout-services.js';

// The library-author infrastructure surface: the `IServiceManifestHolder`
// configure-callback seam, the AD-HOC FACTORY PARAMETER that is why a library
// never needs the provider, the discouraged locator twin it is compared against,
// and `EmptyServiceProvider` — the one provider a library can hold, because it
// holds nothing.
export { demonstrateNullProvider } from './infrastructure-demo.js';
export { addGreetingWorkshop, GREETING_WORKSHOP_TOKEN, GreetingCard, GreetingWorkshop, GreetingWorkshopBuilder,
  LOCATOR_GREETING_WORKSHOP_TOKEN, LocatorGreetingWorkshop, PlainStationery,
  WorkshopGreeting } from './infrastructure-greeting-workshop.js';
export type { ICardRecipient, ICardStationery, IGreetingWorkshopBuilder } from './infrastructure-greeting-workshop.js';

// The three DIALECT-INDEPENDENT chapters. None of them has a type-driven form to
// have a twin of — an error class, a token string and a manifest's own data
// structure are all the same in either dialect — so both example apps run these
// rather than a with-transformer mirror, and their header lines say so.

// The registration-time failures, provoked on purpose against a manifest this
// library was handed. The rest of the taxonomy belongs to the engine, so the
// apps stage it and prepend these lines to theirs.
export { demonstrateRegistrationErrors, diagnoseRegistration } from './registration-errors-demo.js';

// The token/slot ABI, exercised as a container-diagnostics tool would: classify,
// parse, walk, rewrite, match, rank, and close a template. The fixture it reports
// on is an `add*` contribution like any other; the tour itself only READS.
export { addReportingFixture, classify, closeAgainst, demonstrateTokenAbi, describeNode, describeRegistrations,
  describeSlot, describeTree, explainMatch, isResolvableSlot, PackageCollector, PackageRenamer, rankBySpecificity,
  slotRoundTrips } from './token-abi-demo.js';

// The manifest as a value: the augmentation receiver, the standalone call
// surface, the intrinsic primitives, and the manifest-to-manifest half of a test
// host. The tour takes a composed manifest, since a library cannot make one.
// `forTests` plus the three capability-narrowed helpers are the rest of that test
// host — the app builds a container and drives them, which is the only part a
// library could not write.
export { addShopServices, asSingleton, auditToken, authoringMintsIn, demonstrateManifestSurface, describeSeal, forTests,
  inScope, isRegistrationBuilder, missingFrom, repointFirstSlot, requireCheckout, SHOP_SELF_CHECK_TOKENS,
  withoutToken } from './manifest-surface-demo.js';
export type { AuthoringSurface, IChainFaces, LegacyScope, NormalisedProducer,
  Registerable } from './manifest-surface-demo.js';
