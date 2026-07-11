// The library's tokenless core — and the reason its build is its only
// consumable form. `makeServerReport` is a factory injected with the live
// `Resolver` (#49) that assembles a report by resolving every input TOKENLESSLY:
// the `IGreeting` collection (#48), the live `Options<ServerOptions>` (#6/#40),
// the static `Options<GreetingPolicy>` (#34), and an optional `IHealthCheck`
// probed with `tryResolve`/`isService` (#25/#23). The `@rhombus-std/di.transformer`
// lowers each `resolve<T>()` / `tryResolve<T>()` / `isService<T>()` to its string
// token during the build; the raw source would call them with no token and throw
// — so a source-libs entry that skipped the build would silently break.
//
// Every token this factory resolves is derived from `@rhombus-std/examples.contracts`'
// public types, so a consuming app (either dialect) that registers those
// contracts — tokenlessly or by the same hand-written token strings — satisfies
// exactly these lookups. That agreement is the interop matrix in one function.

import type { Resolver } from '@rhombus-std/di';
import type { GreetingPolicy, IGreeting, IHealthCheck, IServerReport,
  ServerOptions } from '@rhombus-std/examples.contracts';
import type { Options } from '@rhombus-std/options';

/**
 * Assembles an {@link IServerReport} from the whole container. `resolver` is the
 * injected live provider view; the app registers this factory and the report
 * reflects whatever both libraries contributed.
 *
 * @param resolver The live provider view (the intrinsic `Resolver` token).
 */
export function makeServerReport(resolver: Resolver): IServerReport {
  // Collection resolution (#48): every registered IGreeting, from BOTH libraries.
  const greetings = resolver.resolve<IGreeting[]>();
  // The live, reload-reactive options (#6/#40) and the static policy wrap (#34).
  const server = resolver.resolve<Options<ServerOptions>>().value;
  const policy = resolver.resolve<Options<GreetingPolicy>>().value;
  // Registration probes (#23/#25): present only when the without-transformer
  // library was wired in — no throw either way.
  const hasHealth = resolver.isService<IHealthCheck>();
  const health = resolver.tryResolve<IHealthCheck>();

  const lines: string[] = [];
  lines.push(`greetings aggregated from both libraries (${greetings.length}):`);
  for (const greeting of greetings) {
    lines.push(`  ${greeting.source}: ${greeting.greet('Ada')}${policy.excitement}`);
  }
  lines.push(
    `server options (live): Host=${server.Host} Port=${server.Port} MaxConnections=${server.MaxConnections}`,
  );
  lines.push(`greeting policy excitement (static wrap): ${JSON.stringify(policy.excitement)}`);
  lines.push(`health check present: ${hasHealth} (${health ? health.check() : 'n/a'})`);

  return { lines };
}
