// The library's report factory — and the clearest illustration in the package of
// what "a library never needs the provider" buys.
//
// It used to take the live `IResolver` and pull four things out of it. Every one
// of those was a dependency the factory HAD but did not DECLARE: the signature
// said "hand me the container", and the body then helped itself. Now each input
// is an ordinary parameter the container fills, so the factory's dependencies are
// exactly what its signature says — which is what makes it callable from a test
// with four plain arguments, checkable by an eager whole-graph validation, and
// unable to grow a hidden dependency without editing the line a reader looks at
// first.
//
// What each parameter is here to teach:
//
//   - `greetings: IGreeting[]` — COLLECTION injection (#48). The token derives as
//     `Array<…:IGreeting>` and the container aggregates EVERY registration of
//     `IGreeting`, so this one parameter picks up a greeting from BOTH example
//     libraries. A collection slot is always satisfiable; with nothing registered
//     it is simply empty.
//   - `server: IOptions<ServerOptions>` — the live, reload-reactive options view
//     (#6/#40). Injecting the `IOptions<T>` WRAPPER rather than a `ServerOptions`
//     is what keeps it live: `.value` re-runs the pipeline on every read, so a
//     config reload is visible to a singleton built long before it.
//   - `policy: IOptions<GreetingPolicy>` — the config-free static wrap (#34), the
//     same wrapper type arrived at the other way.
//   - `health?: IHealthCheck` — the OPTIONAL dependency (#25). An optional
//     parameter lowers to a union slot — `{ union: ["…:IHealthCheck", { value:
//     undefined }] }` — so the container tries the registration first and falls
//     back to `undefined` when nothing is registered. That is the declared
//     equivalent of `tryResolve(…)`, and it is the better half of the trade:
//     absence becomes visible in the signature instead of buried in the body.
//
// The transformer still earns its keep here, but in the REGISTRATION rather than
// the body: deriving those four tokens — one closed generic, one collection
// wrapper, one optional union — from the parameter types is precisely the
// boilerplate the sugar exists to remove. See `./add-with-transformer-examples.ts`.

import type { GreetingPolicy, IGreeting, IHealthCheck, IServerReport,
  ServerOptions } from '@rhombus-std/examples.contracts';
import type { IOptions } from '@rhombus-std/options';

/**
 * Assembles an {@link IServerReport} from what it was handed. Every input arrives
 * as a parameter, so the report reflects whatever both libraries contributed
 * without this function ever asking the container a question.
 *
 * @param greetings Every registered `IGreeting`, aggregated across both libraries.
 * @param server The live server options view; `.value` re-reads on each access.
 * @param policy The static greeting-policy wrap.
 * @param health The optional health probe — present only when a library that
 *   registers one was wired in.
 */
export function makeServerReport(greetings: IGreeting[], server: IOptions<ServerOptions>,
  policy: IOptions<GreetingPolicy>, health?: IHealthCheck): IServerReport {
  const options = server.value;
  const excitement = policy.value.excitement;

  const lines: string[] = [];
  lines.push(`greetings aggregated from both libraries (${greetings.length}):`);
  for (const greeting of greetings) {
    lines.push(`  ${greeting.source}: ${greeting.greet('Ada')}${excitement}`);
  }
  lines.push(
    `server options (live): Host=${options.Host} Port=${options.Port} MaxConnections=${options.MaxConnections}`,
  );
  lines.push(`greeting policy excitement (static wrap): ${JSON.stringify(excitement)}`);
  // `health !== undefined` IS the probe. The union slot already answered "is one
  // registered?" — by injecting it or by injecting `undefined` — so there is
  // nothing left to ask the container.
  lines.push(`health check present: ${health !== undefined} (${health ? health.check() : 'n/a'})`);

  return { lines };
}
