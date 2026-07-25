import type { IResolver, Token } from '@rhombus-std/di.core';
import { type IConfigureOptions, type IOptions, type IPostConfigureOptions, type IValidateOptions, Options,
  OptionsFactory } from '@rhombus-std/options';
import type { Func } from '@rhombus-toolkit/func';

import { CompositeChangeToken } from './CompositeChangeToken.js';
import type { IOptionsChangeTokenSource } from './IOptionsChangeTokenSource.js';
import { changeTokenSourceToken, collectionToken, configureStepToken, postConfigureStepToken,
  validateStepToken } from './option-tokens.js';

/**
 * Assembles the `IOptions<T>` for `optionsToken` from the pipeline steps
 * registered against its derived slots. `resolver` is the live provider view
 * (injected as the factory's `IResolver` parameter); `makeBase` produces the
 * base instance every pipeline run starts from.
 */
export function assembleOptions<T>(resolver: IResolver, optionsToken: Token, makeBase: Func<[], T>): IOptions<T> {
  const configures = resolver.resolve<ReadonlyArray<IConfigureOptions<T>>>(
    collectionToken(configureStepToken(optionsToken)),
  );
  const postConfigures = resolver.resolve<ReadonlyArray<IPostConfigureOptions<T>>>(
    collectionToken(postConfigureStepToken(optionsToken)),
  );
  const validates = resolver.resolve<ReadonlyArray<IValidateOptions<T>>>(
    collectionToken(validateStepToken(optionsToken)),
  );
  const sources = resolver.resolve<readonly IOptionsChangeTokenSource[]>(
    collectionToken(changeTokenSourceToken(optionsToken)),
  );

  const build = (): T => new OptionsFactory<T>(makeBase, configures, postConfigures, validates).create();

  if (!sources.length) {
    return Options.of(build());
  }

  return Options.watch(build, () => new CompositeChangeToken(sources.map((source) => source.getChangeToken())));
}
