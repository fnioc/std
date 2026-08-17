// The `configure` half of the pipeline authoring surface on di.core's
// registration builder: a config section to bind (which also wires a
// change-token source), a bare code delegate, or the DI-injected form. Its
// siblings are in ./ServiceManifest-Options-augmentations -- two sets rather
// than one because the registry's bag is a flat name namespace, so a receiver
// cannot take two contributions of one name from a single registration.

import type { IConfig } from '@rhombus-std/config.core';
import type { Manifest } from '@rhombus-std/di.core';
import type { IConfigureOptions } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import { ConfigChangeTokenSource } from './ConfigChangeTokenSource.js';
import { ConfigConfigureOptions } from './ConfigConfigureOptions.js';
import type { DepTokens } from './dep-tokens.js';
import { changeTokenSourceType, configureStepType } from './option-types.js';

// `Scopes` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    /**
     * Registers a configuration `section` to bind against the options type
     * `type` — the BARE `T`, as every pipeline verb takes: adds a config-bind
     * configure step and a change-token source wired to the section's reload
     * token, which is what makes the resulting `IOptions<T>` reload-capable.
     * Requires a prior {@link addOptions} for the same `type`.
     */
    configure(type: Type, section: IConfig): Manifest<Scopes>;
    /**
     * Registers a code configure step for `type`: `configureOptions`
     * runs against the value as one configure source among several (no config
     * section, so no change-token source). Distinguished from the
     * config-section overload of {@link configure} by its function argument.
     */
    configure(type: Type, configureOptions: Func<[any], void>): Manifest<Scopes>;
    /**
     * The DI-injected configure step: resolves each token in `depTokens` from
     * the provider at materialization time and passes the instances to
     * `configureOptions` after the options value. A typed caller writes each
     * token as `typefor<Dep>()`.
     */
    configure<Deps extends readonly unknown[]>(type: Type, depTokens: DepTokens<Deps>, configureOptions: (options: any, ...deps: Deps) => void): Manifest<Scopes>;
  }
}

export namespace ServiceManifestOptionsConfigAugmentations {
  export function configure(this: Manifest<string>, type: Type, section: IConfig): Manifest<string>;
  export function configure(this: Manifest<string>, type: Type, configureOptions: Func<[any], void>): Manifest<string>;
  export function configure<Deps extends readonly unknown[]>(this: Manifest<string>, type: Type, depTokens: DepTokens<Deps>, configureOptions: (options: any, ...deps: Deps) => void): Manifest<string>;
  export function configure<Deps extends readonly unknown[]>(this: Manifest<string>, type: Type, source: IConfig | Func<[any], void> | DepTokens<Deps>,
    configureWithDeps?: (options: any, ...deps: Deps) => void): Manifest<string> {
    // DI-injected form: `source` is the dep-token tuple and
    // `configureWithDeps` the callback. Registers a factory for the configure
    // slot whose injected params are the resolved deps; it produces an
    // IConfigureOptions that forwards them after the options value. The deps
    // resolve once, when the assembly reads the slot.
    if (Array.isArray(source)) {
      const callback = configureWithDeps as (options: any, ...deps: Deps) => void;

      return this.add(configureStepType(type), (...deps: Deps): IConfigureOptions<any> => ({ configure(options: any): void {
        callback(options, ...deps);
      } }), Type.func(configureStepType(type), [[...source]]));
    }
    // A bare delegate is a pure code configure step: registers only the
    // configure slot, no change-token source. The registry's flat bag
    // namespace forbids a second `configure` member on the type, so the
    // config-section member absorbs the delegate by arg type — the same
    // disambiguation `addOptions` uses.
    const configSource = source as IConfig | Func<[any], void>;
    if (typeof configSource === 'function') {
      return this.add(configureStepType(type), { configure: configSource });
    }
    let m: Manifest<string> = this.add(configureStepType(type), new ConfigConfigureOptions(configSource));
    m = m.add(changeTokenSourceType(type), new ConfigChangeTokenSource(configSource));
    return m;
  }
}

registerAugmentations<Manifest<any>>(ServiceManifestOptionsConfigAugmentations);
