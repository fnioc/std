// assembleOptions -- the factory `addOptions` registers, run at resolve time.
//
// Mirrors what MEO's `AddOptions()` wiring produces: an `Options<T>` assembled
// from ALL the pipeline steps accumulated for its token. Every slot travels
// through the container as a collection (#48), so the assembly resolves the
// `Array<slot>` wrappers -- picking up every `configure`/post-configure/validate
// step and change-token source registered for T, in registration order -- then
// runs the OptionsFactory pipeline (§4.5).
//
// When any change-token source is present the delivered `Options<T>` is
// REACTIVE (`Options.watch`): `value` re-runs the pipeline on every read, and
// `subscribe` fires on every composed reload. With no source it is a static
// snapshot (`Options.of`).

import type { Resolver, Token } from "@rhombus-std/di.core";
import {
  type ConfigureOptions,
  Options,
  OptionsFactory,
  type PostConfigureOptions,
  type ValidateOptions,
} from "@rhombus-std/options";
import type { Func } from "@rhombus-toolkit/func";

import { CompositeChangeToken } from "./CompositeChangeToken.js";
import {
  changeTokenSourceToken,
  collectionToken,
  configureStepToken,
  postConfigureStepToken,
  validateStepToken,
} from "./option-tokens.js";
import type { OptionsChangeTokenSource } from "./OptionsChangeTokenSource.js";

/**
 * Assembles the `Options<T>` for `optionsToken` from the pipeline steps
 * registered against its derived slots. `resolver` is the live provider view
 * (injected as the factory's `Resolver` parameter); `makeBase` produces the
 * base instance every pipeline run starts from.
 */
export function assembleOptions<T>(
  resolver: Resolver,
  optionsToken: Token,
  makeBase: Func<[], T>,
): Options<T> {
  const configures = resolver.resolve<readonly ConfigureOptions<T>[]>(
    collectionToken(configureStepToken(optionsToken)),
  );
  const postConfigures = resolver.resolve<readonly PostConfigureOptions<T>[]>(
    collectionToken(postConfigureStepToken(optionsToken)),
  );
  const validates = resolver.resolve<readonly ValidateOptions<T>[]>(
    collectionToken(validateStepToken(optionsToken)),
  );
  const sources = resolver.resolve<readonly OptionsChangeTokenSource[]>(
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
