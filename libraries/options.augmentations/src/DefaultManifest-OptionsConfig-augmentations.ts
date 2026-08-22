// The `configure` half of the pipeline authoring surface on di.core's
// registration builder: a config section to bind (which also wires a
// change-token source), a bare code delegate, or the DI-injected form. Its
// siblings are in ./DefaultManifest-Options-augmentations -- two sets rather
// than one because the registry's bag is a flat name namespace, so a receiver
// cannot take two contributions of one name from a single registration.

import type { IConfig } from '@rhombus-std/config.core';
import { ConstantType, type Manifest } from '@rhombus-std/di.core';
import type { IConfigureOptions } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import { ConfigChangeTokenSource } from './ConfigChangeTokenSource.js';
import { ConfigConfigureOptions } from './ConfigConfigureOptions.js';
import type { DepTypes } from './dep-types.js';
import { changeTokenSourceType, configureStepType } from './option-types.js';

// `Lifetime` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface Manifest<Lifetime> {
    /**
     * Registers a configuration `section` to bind against the options type
     * `optionsType` — the BARE `T`, as every pipeline verb takes: adds a
     * config-bind configure step and a change-token source wired to the
     * section's reload token, which is what makes the resulting `IOptions<T>`
     * reload-capable. Requires a prior {@link addOptions} for the same
     * `optionsType`.
     */
    configure(optionsType: Type, section: IConfig): Manifest<Lifetime>;
    /**
     * Registers a code configure step for `optionsType`: `configureOptions`
     * runs against the value as one configure source among several (no config
     * section, so no change-token source). Distinguished from the
     * config-section overload of {@link configure} by its function argument.
     */
    configure(optionsType: Type, configureOptions: Func<[any], void>): Manifest<Lifetime>;
    /**
     * The DI-injected configure step: resolves each type in `depTypes` from
     * the provider at materialization time and passes the instances to
     * `configureOptions` after the options value. A typed caller writes each
     * entry as `typefor<Dep>()`.
     */
    configure<Deps extends readonly unknown[]>(optionsType: Type, depTypes: DepTypes<Deps>, configureOptions: (options: any, ...deps: Deps) => void): Manifest<Lifetime>;
  }
}

export namespace ServiceManifestOptionsConfigAugmentations {
  export function configure(this: Manifest<unknown>, optionsType: Type, section: IConfig): Manifest<unknown>;
  export function configure(this: Manifest<unknown>, optionsType: Type, configureOptions: Func<[any], void>): Manifest<unknown>;
  export function configure<Deps extends readonly unknown[]>(this: Manifest<unknown>, optionsType: Type, depTypes: DepTypes<Deps>,
    configureOptions: (options: any, ...deps: Deps) => void): Manifest<unknown>;
  export function configure<Deps extends readonly unknown[]>(this: Manifest<unknown>, optionsType: Type, source: IConfig | Func<[any], void> | DepTypes<Deps>,
    configureWithDeps?: (options: any, ...deps: Deps) => void): Manifest<unknown> {
    // DI-injected form: `source` is the dep-type tuple and
    // `configureWithDeps` the callback. Registers a factory for the configure
    // slot whose injected params are the resolved deps; it produces an
    // IConfigureOptions that forwards them after the options value. The deps
    // resolve once, when the assembly reads the slot.
    if (Array.isArray(source)) {
      const callback = configureWithDeps as (options: any, ...deps: Deps) => void;

      const serviceType = configureStepType(optionsType);
      return this.add({
        serviceType,
        factory: (...deps: Deps): IConfigureOptions<any> => ({
          configure(options: any): void {
            callback(options, ...deps);
          },
        }),
        factoryType: Type.func(serviceType, [[...source]]),
      });
    }
    // A bare delegate is a pure code configure step: registers only the
    // configure slot, no change-token source. The registry's flat bag
    // namespace forbids a second `configure` member on the type, so the
    // config-section member absorbs the delegate by arg type — the same
    // disambiguation `addOptions` uses.
    const configSource = source as IConfig | Func<[any], void>;
    if (typeof configSource === 'function') {
      return this.add(configureStepType(optionsType), { configure: configSource }, ConstantType);
    }
    let m: Manifest<unknown> = this.add(configureStepType(optionsType), new ConfigConfigureOptions(configSource), ConstantType);
    m = m.add(changeTokenSourceType(optionsType), new ConfigChangeTokenSource(configSource), ConstantType);
    return m;
  }
}

registerAugmentations<Manifest<any>>(ServiceManifestOptionsConfigAugmentations);
