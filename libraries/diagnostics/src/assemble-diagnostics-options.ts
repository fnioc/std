import type { IResolver, Token } from '@rhombus-std/di2.core';
import { collectionToken } from '@rhombus-std/diagnostics.core';
import { type IConfigureOptions, type IOptions, Options } from '@rhombus-std/options';
import type { IOptionsChangeTokenSource } from '@rhombus-std/options.augmentations';
import type { Func } from '@rhombus-toolkit/func';

import { CompositeChangeToken } from './CompositeChangeToken';

/**
 * Assembles the `IOptions<T>` for a diagnostics options type: resolves every
 * `IConfigureOptions<T>` step and `IOptionsChangeTokenSource` registered at
 * `configureToken`/`sourceToken`, builds `T` by running the steps over a fresh
 * base, and returns a reactive `IOptions<T>` that re-runs the build whenever a
 * source reports a change — or a static snapshot if no source is registered.
 *
 * @param resolver The live provider view (injected as the factory's `IResolver`).
 * @param configureToken The collection slot holding the `IConfigureOptions<T>` steps.
 * @param sourceToken The collection slot holding the change-token sources.
 * @param makeBase Produces the base instance each build starts from.
 */
export function assembleDiagnosticsOptions<T>(resolver: IResolver, configureToken: Token, sourceToken: Token,
  makeBase: Func<[], T>): IOptions<T> {
  const steps = resolver.resolve<ReadonlyArray<IConfigureOptions<T>>>(collectionToken(configureToken));
  const sources = resolver.resolve<readonly IOptionsChangeTokenSource[]>(collectionToken(sourceToken));

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
