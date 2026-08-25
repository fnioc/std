// The `configure` step of the pipeline authoring surface: a config section to
// bind (which also wires a change-token source), a bare code delegate, or the
// DI-injected form. Each call returns its own self-contained manifest for the
// caller to merge in with `addMany`. Its siblings are
// ./Manifest-Options-augmentations (`addOptions` / `postConfigure` /
// `validate`) and ./validate-on-start-manifests.

import type { IConfig } from '@rhombus-std/config.core';
import { Manifest } from '@rhombus-std/di.core';
import type { IConfigureOptions } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

import { ConfigChangeTokenSource } from './ConfigChangeTokenSource.js';
import { ConfigConfigureOptions } from './ConfigConfigureOptions.js';
import type { DepTypes } from './dep-types.js';
import { changeTokenSourceType, configureStepType } from './option-types.js';

/**
 * A configuration `section` to bind against the options type `optionsType`,
 * as its own manifest — merge it into a container's registrations with
 * `addMany`. Adds a config-bind configure step and a change-token source
 * wired to the section's reload token, which is what makes the resulting
 * `IOptions<T>` reload-capable. Requires a prior `addOptions` for the same
 * `optionsType`.
 */
export function getConfigureManifest(optionsType: Type, section: IConfig): Manifest<unknown>;
/**
 * A code configure step for `optionsType`, as its own manifest:
 * `configureOptions` runs against the value as one configure source among
 * several (no config section, so no change-token source). Distinguished from
 * the config-section overload by its function argument.
 */
export function getConfigureManifest(optionsType: Type, configureOptions: Func<[any], void>): Manifest<unknown>;
/**
 * The DI-injected configure step: resolves each type in `depTypes` from the
 * provider at materialization time and passes the instances to
 * `configureOptions` after the options value. A typed caller writes each
 * entry as `typefor<Dep>()`.
 */
export function getConfigureManifest<Deps extends readonly unknown[]>(optionsType: Type, depTypes: DepTypes<Deps>, configureOptions: (options: any, ...deps: Deps) => void): Manifest<unknown>;
export function getConfigureManifest<Deps extends readonly unknown[]>(optionsType: Type, source: IConfig | Func<[any], void> | DepTypes<Deps>,
  configureWithDeps?: (options: any, ...deps: Deps) => void): Manifest<unknown> {
  // DI-injected form: `source` is the dep-type tuple and
  // `configureWithDeps` the callback. Registers a factory for the configure
  // slot whose injected params are the resolved deps; it produces an
  // IConfigureOptions that forwards them after the options value. The deps
  // resolve once, when the assembly reads the slot.
  if (Array.isArray(source)) {
    const callback = configureWithDeps as (options: any, ...deps: Deps) => void;

    const serviceType = configureStepType(optionsType);
    return Manifest.empty<unknown>().add({
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
  // configure slot, no change-token source. The config-section overload
  // absorbs the delegate by arg type — the same disambiguation `addOptions`
  // uses.
  const configSource = source as IConfig | Func<[any], void>;
  if (typeof configSource === 'function') {
    return Manifest.empty<unknown>().addValue(configureStepType(optionsType), { configure: configSource });
  }
  return Manifest.empty<unknown>()
    .addValue(configureStepType(optionsType), new ConfigConfigureOptions(configSource))
    .addValue(changeTokenSourceType(optionsType), new ConfigChangeTokenSource(configSource));
}
