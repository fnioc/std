import { type IServiceProvider } from '@rhombus-std/di.core';
import { collectionType } from '@rhombus-std/diagnostics.core';
import { type IConfigureOptions, type IOptions, Options } from '@rhombus-std/options';
import type { IOptionsChangeTokenSource } from '@rhombus-std/options.augmentations';
import { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

import { CompositeChangeToken } from './CompositeChangeToken';

/**
 * Assembles the `IOptions<T>` for a diagnostics options type: resolves every
 * `IConfigureOptions<T>` step and `IOptionsChangeTokenSource` registered at
 * `configureType`/`sourceType`, builds `T` by running the steps over a fresh
 * base, and returns a reactive `IOptions<T>` that re-runs the build whenever a
 * source reports a change — or a static snapshot if no source is registered.
 *
 * @param resolver The live provider view (injected as the factory's `IServiceProvider`).
 * @param configureType The collection slot holding the `IConfigureOptions<T>` steps.
 * @param sourceType The collection slot holding the change-token sources.
 * @param makeBase Produces the base instance each build starts from.
 */
export function assembleDiagnosticsOptions<T>(resolver: IServiceProvider, configureType: Type, sourceType: Type, makeBase: Func<[], T>): IOptions<T> {
  const steps: ReadonlyArray<IConfigureOptions<T>> = resolver.resolve(
    collectionType(configureType),
  );
  const sources: readonly IOptionsChangeTokenSource[] = resolver.resolve(
    collectionType(sourceType),
  );

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
