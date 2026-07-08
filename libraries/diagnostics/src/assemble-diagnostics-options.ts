// assembleDiagnosticsOptions -- the factory addMetrics/addTracing register at the
// resolvable options token, run at resolve time. The diagnostics analog of
// @rhombus-std/options.augmentations's assembleOptions, specialized to the
// metrics/tracing pipeline (only configure steps + change-token sources -- there
// are no post-configure/validate steps in the diagnostics options model).
//
// It resolves every `ConfigureOptions<T>` step and every OptionsChangeTokenSource
// registered for the family (as di collections), builds `T` by running the steps
// over a fresh base, and delivers a reactive `Options<T>` (Options.watch) when any
// change-token source is present -- so a config reload re-runs the parse -- or a
// static snapshot (Options.of) otherwise.

import type { Resolver, Token } from "@rhombus-std/di.core";
import { collectionToken } from "@rhombus-std/diagnostics.core";
import { Options } from "@rhombus-std/options";
import type { ConfigureOptions } from "@rhombus-std/options";
import type { OptionsChangeTokenSource } from "@rhombus-std/options.augmentations";

import { CompositeChangeToken } from "./composite-change-token";

/**
 * Assembles the `Options<T>` for a diagnostics options type from the configure
 * steps and change-token sources registered at `configureToken` / `sourceToken`.
 *
 * @param resolver The live provider view (injected as the factory's `Resolver`).
 * @param configureToken The collection slot holding the `ConfigureOptions<T>` steps.
 * @param sourceToken The collection slot holding the change-token sources.
 * @param makeBase Produces the base instance each build starts from.
 */
export function assembleDiagnosticsOptions<T>(
  resolver: Resolver,
  configureToken: Token,
  sourceToken: Token,
  makeBase: () => T,
): Options<T> {
  const steps = resolver.resolve<readonly ConfigureOptions<T>[]>(collectionToken(configureToken));
  const sources = resolver.resolve<readonly OptionsChangeTokenSource[]>(collectionToken(sourceToken));

  const build = (): T => {
    const options = makeBase();
    for (const step of steps) {
      step.configure(options);
    }
    return options;
  };

  if (!sources.length) {
    return Options.of(build());
  }

  return Options.watch(build, () => {
    const tokens = sources.map((source) => source.getChangeToken());
    if (tokens.length === 1) {
      return tokens[0]!;
    }
    return new CompositeChangeToken(tokens);
  });
}
