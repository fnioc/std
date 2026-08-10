// The `configure` half of the pipeline authoring surface on di.core's
// registration builder: a config section to bind (which also wires a
// change-token source), a bare code delegate, or the DI-injected form. Its
// siblings are in ./ServiceManifest-Options-augmentations -- two sets rather
// than one because the registry's bag is a flat name namespace, so a receiver
// cannot take two contributions of one name from a single registration.

import type { IConfig } from '@rhombus-std/config.core';
import { DefaultManifest, type Manifest, type Token } from '@rhombus-std/di2.core';
import type { IConfigureOptions } from '@rhombus-std/options';
import { type AugmentationSet2, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import { ConfigChangeTokenSource } from './ConfigChangeTokenSource.js';
import { ConfigConfigureOptions } from './ConfigConfigureOptions.js';
import type { DepTokens } from './dep-tokens.js';
import { changeTokenSourceToken, configureStepToken } from './option-tokens.js';

type IServiceManifestOptionsConfigAugmentations<Scopes extends string> = {
  /**
   * Registers a configuration `section` to bind against the options
   * identified by `token`: adds a config-bind configure step and a
   * change-token source wired to the section's reload token. Requires a prior
   * {@link addOptions} for the same `token`.
   */
  configure(token: Token, section: IConfig): Manifest<Scopes>; /**
   * Registers a code configure step for `token`: `configureOptions` runs
   * against the value as one configure source among several (no config
   * section, so no change-token source). Distinguished from the
   * config-section overload of {@link configure} by its function argument.
   */
  configure<T>(token: Token, configureOptions: Func<[T], void>): Manifest<Scopes>; /**
   * The DI-injected configure step: resolves each token in `depTokens` from
   * the provider at materialization time and passes the instances to
   * `configureOptions` after the options value. A typed caller writes each
   * token as `tokenfor<Dep>()`.
   */
  configure<T, Deps extends readonly unknown[]>(token: Token, depTokens: DepTokens<Deps>,
    configureOptions: (options: T, ...deps: Deps) => void): Manifest<Scopes>;
};

// `Provider` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters), even though the members do not name it.
declare module '@rhombus-std/di2.core' {
  interface Manifest<Scopes extends string = 'singleton', Provider = unknown>
    extends IServiceManifestOptionsConfigAugmentations<Scopes> {}
}

export const ServiceManifestOptionsConfigAugmentations: AugmentationSet2<DefaultManifest<string>,
  IServiceManifestOptionsConfigAugmentations<string>> = {
    configure<T, Deps extends readonly unknown[]>(manifest: DefaultManifest<string>, token: Token,
      source: IConfig | Func<[T], void> | DepTokens<Deps>,
      configureWithDeps?: (options: T, ...deps: Deps) => void): Manifest<string> {
      // DI-injected form: `source` is the dep-token tuple and
      // `configureWithDeps` the callback. Registers a factory for the configure
      // slot whose injected params are the resolved deps; it produces an
      // IConfigureOptions that forwards them after the options value. The deps
      // resolve once, when the assembly reads the slot.
      if (Array.isArray(source)) {
        const callback = configureWithDeps as (options: T, ...deps: Deps) => void;
        return manifest.addFactory(configureStepToken(token),
          (...deps: Deps): IConfigureOptions<T> => ({ configure(options: T): void {
            callback(options, ...deps);
          } }), [source as readonly Token[]]);
      }
      // A bare delegate is a pure code configure step: registers only the
      // configure slot, no change-token source. The registry's flat bag
      // namespace forbids a second `configure` member on the token, so the
      // config-section member absorbs the delegate by arg type — the same
      // disambiguation `addOptions` uses.
      const configSource = source as IConfig | Func<[T], void>;
      if (typeof configSource === 'function') {
        return manifest.addValue(configureStepToken(token), { configure: configSource });
      }
      let m: Manifest<string> = manifest.addValue(configureStepToken(token), new ConfigConfigureOptions(configSource));
      m = m.addValue(changeTokenSourceToken(token), new ConfigChangeTokenSource(configSource));
      return m;
    },
  };

registerAugmentations(tokenfor<Manifest>(), ServiceManifestOptionsConfigAugmentations);
