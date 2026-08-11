import { type IConfigureOptions, type IOptions, type IPostConfigureOptions, type IValidateOptions, Options,
  OptionsFactory } from '@rhombus-std/options';
import { type IServiceProvider, Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

import { CompositeChangeToken } from './CompositeChangeToken.js';
import type { IOptionsChangeTokenSource } from './IOptionsChangeTokenSource.js';
import { changeTokenSourceToken, collectionToken, configureStepToken, postConfigureStepToken,
  validateStepToken } from './option-tokens.js';

/**
 * Assembles the `IOptions<T>` for `optionsToken` from the pipeline steps
 * registered against its derived slots. `resolver` is the live provider view
 * (injected as the factory's `IServiceProvider` parameter); `makeBase` produces the
 * base instance every pipeline run starts from.
 */
export function assembleOptions<T>(resolver: IServiceProvider, optionsToken: string,
  makeBase: Func<[], T>): IOptions<T> {
  const configures: ReadonlyArray<IConfigureOptions<T>> = resolver.getService(
    Type.from(collectionToken(configureStepToken(optionsToken))),
  );
  const postConfigures: ReadonlyArray<IPostConfigureOptions<T>> = resolver.getService(
    Type.from(collectionToken(postConfigureStepToken(optionsToken))),
  );
  const validates: ReadonlyArray<IValidateOptions<T>> = resolver.getService(
    Type.from(collectionToken(validateStepToken(optionsToken))),
  );
  const sources: ReadonlyArray<IOptionsChangeTokenSource> = resolver.getService(
    Type.from(collectionToken(changeTokenSourceToken(optionsToken))),
  );

  const build = (): T => new OptionsFactory<T>(makeBase, configures, postConfigures, validates).create();

  if (!sources.length) {
    return Options.of(build());
  }

  return Options.watch(build, () => new CompositeChangeToken(sources.map((source) => source.getChangeToken())));
}
