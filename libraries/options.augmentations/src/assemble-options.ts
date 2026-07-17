// assembleOptions -- the factory `addOptions` registers, run at resolve time.
//
// Mirrors what MEO's `AddOptions()` wiring produces: an `IOptions<T>` assembled
// from ALL the pipeline steps accumulated for its token. Every slot travels
// through the container as a collection (#48), so the assembly resolves the
// `Array<slot>` wrappers -- picking up every `configure`/post-configure/validate
// step and change-token source registered for T, in registration order -- then
// runs the OptionsFactory pipeline (§4.5).
//
// When any change-token source is present the delivered `IOptions<T>` is
// REACTIVE (`Options.watch`): `value` re-runs the pipeline on every read, and
// `subscribe` fires on every composed reload. With no source it is a static
// snapshot (`Options.of`).

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
export function assembleOptions<T>(
  resolver: IResolver,
  optionsToken: Token,
  makeBase: Func<[], T>,
): IOptions<T> {
  const configures = resolver.resolve<readonly IConfigureOptions<T>[]>(
    collectionToken(configureStepToken(optionsToken)),
  );
  const postConfigures = resolver.resolve<readonly IPostConfigureOptions<T>[]>(
    collectionToken(postConfigureStepToken(optionsToken)),
  );
  const validates = resolver.resolve<readonly IValidateOptions<T>[]>(
    collectionToken(validateStepToken(optionsToken)),
  );
  const sources = resolver.resolve<readonly IOptionsChangeTokenSource[]>(
    collectionToken(changeTokenSourceToken(optionsToken)),
  );

  const build = (): T => new OptionsFactory<T>(makeBase, configures, postConfigures, validates).create();

  if (!sources.length) {
    return Options.of(build());
  }

  return Options.watch(
    build,
    () => new CompositeChangeToken(sources.map((source) => source.getChangeToken())),
  );
}
