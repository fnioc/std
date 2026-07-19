// The shared contract surface both example libraries produce against and both
// example apps consume. PURE TYPES — no runtime code, so every `import type` of
// these interfaces erases and neither the built libs nor the tsc-typechecked apps carry
// a runtime dependency on this package.
//
// This is the "cross-lib contract flow" the interop matrix turns on: the
// with-transformer lib and app derive tokens from these package-public types
// (`@rhombus-std/examples.contracts:IGreeting`, …); the without-transformer lib
// and app hand-write those SAME token strings. Both dialects register `IGreeting`
// implementations against the one derived token, so an app resolving the
// `IGreeting` collection aggregates a greeting from EACH library. The token a
// manual author writes is exactly the one the transformer derives — that
// agreement is what makes the two dialects interoperate. The manual side keeps
// its token constants local (they are runtime values; this package stays
// type-only) — see each without-transformer package's `tokens.ts`.

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
 * `isService` / `tryResolve` (#23/#25) and finds it present when that library
 * was wired in, absent otherwise, without a throw.
 */
export interface IHealthCheck {
  check(): string;
}

/**
 * A startup banner fetched asynchronously — registered ONLY as
 * `Promise<IBanner>`, never bare. An app reaches it with `resolveAsync<IBanner>`
 * (#45), which awaits the honest `Promise<T>` fallback before delivering it.
 */
export interface IBanner {
  readonly text: string;
}

/**
 * The report the with-transformer library assembles from the whole container:
 * the aggregated greetings (#48), the live server options (#6/#40), the greeting
 * policy (#34), and whether a health check is present (#23/#25). Its factory
 * pulls every input through an injected `IResolver` (#49), resolving each
 * TOKENLESSLY — which is why that library must ship its build (the raw source's
 * un-lowered `resolve<T>()` calls would throw).
 */
export interface IServerReport {
  readonly lines: readonly string[];
}
