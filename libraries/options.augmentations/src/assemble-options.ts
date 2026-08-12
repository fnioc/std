import { type IConfigureOptions, type IOptions, type IPostConfigureOptions, type IValidateOptions, Options,
  OptionsFactory } from '@rhombus-std/options';
import { type IServiceProvider, Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

import { CompositeChangeToken } from './CompositeChangeToken.js';
import type { IOptionsChangeTokenSource } from './IOptionsChangeTokenSource.js';
import { changeTokenSourceType, collectionType, configureStepType, postConfigureStepType,
  validateStepType } from './option-types.js';

/**
 * Assembles the `IOptions<T>` for `optionsType` from the pipeline steps
 * registered against its derived slots. `resolver` is the live provider view
 * (injected as the factory's `IServiceProvider` parameter); `makeBase` produces the
 * base instance every pipeline run starts from.
 */
export function assembleOptions<T>(resolver: IServiceProvider, optionsType: Type | string,
  makeBase: Func<[], T>): IOptions<T> {
  const type = typeof optionsType === 'string' ? Type.from(optionsType) : optionsType;
  const configures: ReadonlyArray<IConfigureOptions<T>> = resolver.getService(
    collectionType(configureStepType(type)),
  );
  const postConfigures: ReadonlyArray<IPostConfigureOptions<T>> = resolver.getService(
    collectionType(postConfigureStepType(type)),
  );
  const validates: ReadonlyArray<IValidateOptions<T>> = resolver.getService(
    collectionType(validateStepType(type)),
  );
  const sources: ReadonlyArray<IOptionsChangeTokenSource> = resolver.getService(
    collectionType(changeTokenSourceType(type)),
  );

  const build = (): T => new OptionsFactory<T>(makeBase, configures, postConfigures, validates).create();

  if (!sources.length) {
    return Options.of(build());
  }

  return Options.watch(build, () => new CompositeChangeToken(sources.map((source) => source.getChangeToken())));
}
