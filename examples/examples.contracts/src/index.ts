// The shared contract surface both example libraries produce against and both
// example apps consume. PURE TYPES — no runtime code, so every `import type` of
// these interfaces erases and neither the built libs nor the tsc-typechecked apps carry
// a runtime dependency on this package.
//
// This is the "cross-lib contract flow" the interop matrix turns on: the
// with-transformer lib and app derive `Type`s from these package-public types
// (`@rhombus-std/examples.contracts:IGreeting`, …); the without-transformer lib
// and app compose those SAME Types by hand. Both dialects register `IGreeting`
// implementations against the one derived Type — INTERNED, so both sides land
// on the identical object — so an app resolving the `IGreeting` collection
// aggregates a greeting from EACH library. The manual side keeps its Type
// constants local (they are runtime values; this package stays type-only) —
// see each without-transformer package's `types.ts`.

/**
 * A greeting strategy. BOTH libraries register an implementation against this
 * one contract, so an app resolving the `IGreeting` collection aggregates a
 * greeting from each library (collection resolution, #48). `source` names which
 * library produced it, so the aggregate is observable.
 */
export interface IGreeting {
  greet(name: string): string;
  readonly source: string;
}

/**
 * The application's server options — the type the config sources bind into,
 * post-configure coerces, and validate guards. Delivered as a reactive
 * `IOptions<ServerOptions>` that re-runs the pipeline on every config reload.
 * PascalCase members mirror the PascalCase configuration keys they bind from.
 */
export interface ServerOptions {
  Host: string;
  Port: number;
  MaxConnections: number;
}

/**
 * A config-INDEPENDENT policy value delivered through the explicit-wrap
 * `addOptions<T>()` verb (#34): a pre-built default is registered and wrapped as
 * a static `IOptions<GreetingPolicy>` — the MEO-faithful config-free options
 * shape. The greeting report reads it to punctuate each greeting.
 */
export interface GreetingPolicy {
  excitement: string;
}

/**
 * An optional health probe. Only the without-transformer library registers one;
 * the with-transformer library does not — so an app probes for it with
 * `resolve`, whose miss is `undefined`, and finds it present when that library
 * was wired in, absent otherwise, without a throw.
 */
export interface IHealthCheck {
  check(): string;
}

/**
 * A startup banner fetched asynchronously — registered ONLY as
 * `Promise<IBanner>`, never bare. The registration IS the promise, so an app
 * awaits what `resolve` hands back for that token before using it.
 */
export interface IBanner {
  readonly text: string;
}

/**
 * The report the with-transformer library assembles: the aggregated greetings
 * (#48), the live server options (#6/#40), the greeting policy (#34), and
 * whether a health check is present (#23/#25).
 *
 * Every one of those arrives as a FACTORY PARAMETER — a collection, two
 * `IOptions<T>` wrappers and an optional union — so the factory's dependencies
 * are exactly what its signature says and it never asks the container a
 * question. Deriving those four slots from the parameter types is the densest
 * piece of boilerplate the sugar removes anywhere in these examples; that
 * derivation is also why the library must ship its BUILD rather than its source,
 * since the un-lowered registration call has no signatures in it yet.
 */
export interface IServerReport {
  readonly lines: readonly string[];
}

// ── the di feature tour's contracts ──────────────────────────────────────────
//
// The types above belong to the interop scenario the two apps boot through the
// Generic Host. The two modules below belong to the guided di tour those apps
// run afterwards, and they are re-exported HERE rather than declared inside an
// app for one load-bearing reason: a transformer derives a `Type` from a type's
// PACKAGE-PUBLIC path, so `IRepository<User>` reached through this barrel derives
// `@rhombus-std/examples.contracts:IRepository<@rhombus-std/examples.contracts:User>`
// — the exact Type the without-transformer app composes by hand. Declared inside
// an app they would derive an app-private Type instead, the two dialects would
// stop meeting on one interned object, and the pair could no longer be diffed
// line for line.

// The checkout pipeline the RESOLUTION demonstration is built on.
export type { CheckoutOrder, IAuditTrail, IExchangeRates, IFraudScreen, IOrderValidator, IPaymentGateway, IPaymentRouter, IReceipt, IReceiptNumbering } from './resolution-contracts.js';

// The three-deep entity/table/repository chain the OPEN-GENERICS demonstration
// closes one hole at a time.
export type { AuditEvent, Entity, IJoin, IRepository, ITable, Order, Seed, User } from './open-generics-contracts.js';
