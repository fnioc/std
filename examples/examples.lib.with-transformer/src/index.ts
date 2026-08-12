// @rhombus-std/examples.lib.with-transformer — a dependency library authored in
// the tokenless di dialect and shipped as its BUILD.
//
// It depends on `@rhombus-std/di.core` (the abstractions) and NOT on
// `@rhombus-std/di` (the resolution engine), which is the rule every library in
// this repo holds to: a library contributes REGISTRATIONS and receives its
// dependencies as constructor and factory PARAMETERS. It never constructs a
// manifest, never calls `build()`, never opens a scope and never resolves. The
// applications in `examples/examples.app.*` do all of that, because they are the
// only things that know what is being composed.
//
// Its exports resolve to `dist` under every condition (bun/types included): the
// transformer must run to lower the tokenless registration and resolve calls, so
// raw source is meaningless downstream and a source-libs entry would silently
// bypass the lowering. Consumers get lowered JS + a clean d.ts and never need the
// transformer themselves. `@rhombus-std/di.extras` is a devDependency here for
// exactly that reason: it is the AUTHORING surface, not a runtime dependency, and
// it peers on di.core rather than on the engine.
//
// The mirror of this package is `@rhombus-std/examples.lib.without-transformer`:
// the same shapes, the same output, hand-written tokens and slot arrays. The two
// are behaviourally equivalent by design — that is the no-transformer-first rule
// made checkable, since both example apps register both libraries and byte-diff
// their stdout against a checked-in `expected.txt`.

// ── the library's front door ─────────────────────────────────────────────────

// ONE function that takes the application's manifest and hands it back with this
// library's services registered. Everything an app needs to consume this package
// is this call plus, for a manual-dialect app, the token strings below.
export { addWithTransformerExamples } from './add-with-transformer-examples.js';
export { EXAMPLE_TOKENS } from './tokens.js';

// ── the services it registers ────────────────────────────────────────────────

// Exported so the mirror package's tests and the apps can name the types; an app
// does not need them to WIRE the library up — `addWithTransformerExamples` does
// that — only to talk about what came out.
export { fetchBanner } from './fetch-banner.js';
export { FormalGreeting } from './formal-greeting.js';
export { makeServerReport } from './server-report.js';

// ── the di feature tour ──────────────────────────────────────────────────────

// The library-author infrastructure surface (the manifest slot, the
// caller/container partition of an ad-hoc factory slot), demonstrated from
// inside a library because that is where those pieces are actually reached for.
// The mirror of `@rhombus-std/examples.lib.without-transformer`'s
// demonstration: same scenario, same lines, tokenless dialect.
//
// The chapter's container-building half lives in each app's own
// `src/infrastructure-demo.ts`; what this package exports is the pieces it
// registers.
export { addGreetingWorkshop, GreetingCard, GreetingWorkshop, GreetingWorkshopBuilder, LocatorGreetingWorkshop,
  PlainStationery, WorkshopGreeting } from './infrastructure-greeting-workshop.js';
export type { ICardRecipient, ICardStationery, IGreetingWorkshopBuilder } from './infrastructure-greeting-workshop.js';
