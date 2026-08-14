// The `configure` half of the pipeline authoring surface on di.core's
// registration builder: a config section to bind (which also wires a
// change-token source), a bare code delegate, or the DI-injected form. Its
// siblings are in ./ServiceManifest-Options-augmentations -- two sets rather
// than one because the registry's bag is a flat name namespace, so a receiver
// cannot take two contributions of one name from a single registration.

import type { IConfig } from '@rhombus-std/config.core';
import type { Manifest } from '@rhombus-std/di.core';
import type { IConfigureOptions } from '@rhombus-std/options';
import { type Flatten, registerAugmentations, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import { ConfigChangeTokenSource } from './ConfigChangeTokenSource.js';
import { ConfigConfigureOptions } from './ConfigConfigureOptions.js';
import type { DepTokens } from './dep-tokens.js';
import { changeTokenSourceType, configureStepType } from './option-types.js';

export namespace ServiceManifestOptionsConfigAugmentations {
  /**
   * Registers a configuration `section` to bind against the options type
   * `tType` — the BARE `T`, as every pipeline verb takes: adds a config-bind
   * configure step and a change-token source wired to the section's reload
   * token, which is what makes the resulting `IOptions<T>` reload-capable.
   * Requires a prior {@link addOptions} for the same `tType`.
   */
  export function configure(this: Manifest<string>, tType: Type | string, section: IConfig): Manifest<string>;
  /**
   * Registers a code configure step for `tType`: `configureOptions`
   * runs against the value as one configure source among several (no config
   * section, so no change-token source). Distinguished from the
   * config-section overload of {@link configure} by its function argument.
   */
  export function configure<T>(this: Manifest<string>, tType: Type | string,
    configureOptions: Func<[T], void>): Manifest<string>;
  /**
   * The DI-injected configure step: resolves each token in `depTokens` from
   * the provider at materialization time and passes the instances to
   * `configureOptions` after the options value. A typed caller writes each
   * token as `typefor<Dep>()`.
   */
  export function configure<T, Deps extends readonly unknown[]>(this: Manifest<string>, tType: Type | string,
    depTokens: DepTokens<Deps>, configureOptions: (options: T, ...deps: Deps) => void): Manifest<string>;
  export function configure<T, Deps extends readonly unknown[]>(this: Manifest<string>, tType: Type | string,
    source: IConfig | Func<[T], void> | DepTokens<Deps>,
    configureWithDeps?: (options: T, ...deps: Deps) => void): Manifest<string> {
    const type = typeof tType === 'string' ? Type.from(tType) : tType;
    // DI-injected form: `source` is the dep-token tuple and
    // `configureWithDeps` the callback. Registers a factory for the configure
    // slot whose injected params are the resolved deps; it produces an
    // IConfigureOptions that forwards them after the options value. The deps
    // resolve once, when the assembly reads the slot.
    if (Array.isArray(source)) {
      const callback = configureWithDeps as (options: T, ...deps: Deps) => void;
      const depTypes = (source as readonly (Type | string)[]).map(dep =>
        typeof dep === 'string' ? Type.from(dep) : dep
      );
      return this.addFactory(configureStepType(type),
        (...deps: Deps): IConfigureOptions<T> => ({ configure(options: T): void {
          callback(options, ...deps);
        } }), Type.func(configureStepType(type), [[...depTypes]]));
    }
    // A bare delegate is a pure code configure step: registers only the
    // configure slot, no change-token source. The registry's flat bag
    // namespace forbids a second `configure` member on the type, so the
    // config-section member absorbs the delegate by arg type — the same
    // disambiguation `addOptions` uses.
    const configSource = source as IConfig | Func<[T], void>;
    if (typeof configSource === 'function') {
      return this.addValue(configureStepType(type), { configure: configSource });
    }
    let m: Manifest<string> = this.addValue(configureStepType(type), new ConfigConfigureOptions(configSource));
    m = m.addValue(changeTokenSourceType(type), new ConfigChangeTokenSource(configSource));
    return m;
  }
}

// `Provider` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters), even though the members do not name it.
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string = any> extends Flatten<typeof ServiceManifestOptionsConfigAugmentations> {}
}

registerAugmentations(typefor<Manifest>(), ServiceManifestOptionsConfigAugmentations);
