// @rhombus-std/examples.lib.with-transformer — a dependency library authored in
// the tokenless di dialect and shipped as its BUILD. Its exports resolve to
// `dist` under every condition (bun/types included): the transformer must run to
// lower the tokenless `resolve<T>()` / `tryResolve<T>()` / `isService<T>()` calls
// in `makeServerReport`, so raw source is meaningless downstream and a
// source-libs entry would silently bypass the lowering. Consumers get lowered JS
// + a clean d.ts and never need the transformer.
//
// The library exports its impl classes and its report factory; a consuming app
// performs the container REGISTRATION (di.extras lowers registration calls
// only at a module's top level, which is the application's composition root, not
// a library function body). This is the interop matrix's producer half: whatever
// dialect an app is authored in, it registers these building blocks and the
// lowered `makeServerReport` resolves them by the agreed tokens.

// ── the interop scenario's building blocks ───────────────────────────────────

export { fetchBanner } from './fetch-banner.js';
export { FormalGreeting } from './formal-greeting.js';
export { makeServerReport } from './server-report.js';

// ── the di feature tour ──────────────────────────────────────────────────────

// The library-author infrastructure surface (`IServiceManifestHolder`,
// `ActivatorUtilities`, `IServiceProviderFactory`, the error taxonomy),
// demonstrated from inside a library because that is where those pieces are
// actually reached for. The mirror of
// `@rhombus-std/examples.lib.without-transformer`'s demonstration: same
// scenario, same lines, tokenless dialect.
export { demonstrateInfrastructure } from './infrastructure-demo.js';
export { addGreetingWorkshop, GreetingCard, GreetingWorkshop, GreetingWorkshopBuilder, ManifestServiceProviderFactory,
  newWorkshopManifest, PlainStationery, WorkshopGreeting } from './infrastructure-greeting-workshop.js';
export type { ICardRecipient, ICardStationery, IGreetingWorkshopBuilder } from './infrastructure-greeting-workshop.js';
