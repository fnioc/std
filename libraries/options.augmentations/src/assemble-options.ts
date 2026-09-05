import { type IServiceProvider } from '@rhombus-std/di.core';
import { type IConfigureOptions, type IOptions, type IPostConfigureOptions, type IValidateOptions, Options, OptionsFactory } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/types';

import { CompositeChangeToken } from './CompositeChangeToken.js';
import type { IOptionsChangeTokenSource } from './IOptionsChangeTokenSource.js';
import { changeTokenSourceType, configureStepType, postConfigureStepType, validateStepType } from './option-types.js';

/**
 * Assembles the `IOptions<T>` for the options type `optionsType` from the
 * pipeline steps registered against its derived slots. `resolver` is the live
 * provider view; `makeBase` produces the base instance every pipeline run
 * starts from.
 *
 * @remarks
 * `optionsType` is the BARE `T` — the type that closed the open `IOptions<$T>`
 * registration, delivered to it through a bare-hole signature slot. Reload
 * follows from that: the change-token sources found here are the ones
 * registered for this same type, so each fire re-runs this type's pipeline.
 */
export function assembleOptions<T>(resolver: IServiceProvider, optionsType: Type, makeBase: Func<[], T>): IOptions<T> {
  const configures: ReadonlyArray<IConfigureOptions<T>> = resolver.resolve(
    Type.array(configureStepType(optionsType)),
  );
  const postConfigures: ReadonlyArray<IPostConfigureOptions<T>> = resolver.resolve(
    Type.array(postConfigureStepType(optionsType)),
  );
  const validates: ReadonlyArray<IValidateOptions<T>> = resolver.resolve(
    Type.array(validateStepType(optionsType)),
  );
  const sources: ReadonlyArray<IOptionsChangeTokenSource> = resolver.resolve(
    Type.array(changeTokenSourceType(optionsType)),
  );

  const build = (): T => new OptionsFactory<T>(makeBase, configures, postConfigures, validates).create();

  if (!sources.length) {
    return Options.of(build());
  }

  return Options.watch(build, () => new CompositeChangeToken(sources.map((source) => source.getChangeToken())));
}
