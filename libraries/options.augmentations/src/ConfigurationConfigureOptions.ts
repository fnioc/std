// ConfigurationConfigureOptions -- ported from MEO's
// NamedConfigureFromConfigurationOptions<TOptions>. A configure step
// (docs/decisions.md §4.5) that binds a configuration section into the options
// value: the config-bind-as-a-configure-step wiring §4.5 assigns to #40.
//
// MEO's step calls `ConfigurationBinder.Bind(config, options)`, a reflective
// property populate. TS has no reflective binder, so the bind is STRUCTURAL:
// the section's key/value subtree is deep-merged onto the value. All config
// leaves are strings (config carries no type information), so richer coercion
// is a schema/data-annotations concern deferred to a later satellite (§4.4).

import type { IConfiguration, IConfigurationSection } from "@rhombus-std/config.core";
import type { ConfigureOptions } from "@rhombus-std/options";

/**
 * Deep-merges a configuration node's key/value subtree onto `target`, mutating
 * it in place. A child WITH children recurses into a nested object (created on
 * first use); a leaf child assigns its string value. Deep (not a top-level
 * `Object.assign`) so two configure steps binding overlapping sections compose
 * rather than clobber each other's nested keys.
 */
function bindSection(config: IConfiguration, target: Record<string, unknown>): void {
  for (const child of config.getChildren()) {
    const section: IConfigurationSection = child;
    const grandchildren = [...section.getChildren()];
    if (grandchildren.length) {
      const existing = target[section.key];
      const nested = (typeof existing === "object" && existing !== null)
        ? existing as Record<string, unknown>
        : {};
      target[section.key] = nested;
      bindSection(section, nested);
    } else if (section.value !== undefined) {
      target[section.key] = section.value;
    }
  }
}

/**
 * A {@link ConfigureOptions} step that binds an {@link IConfiguration} section
 * into the options value. Mirrors MEO's
 * `NamedConfigureFromConfigurationOptions<TOptions>` -- registered as one
 * configure source among several (code defaults, overrides, config bind), it is
 * a pipeline participant, not a replacement for the pipeline (§4.5).
 */
export class ConfigurationConfigureOptions<T> implements ConfigureOptions<T> {
  readonly #config: IConfiguration;

  /**
   * @param config The configuration section bound into the value on every
   * {@link configure}.
   */
  public constructor(config: IConfiguration) {
    this.#config = config;
  }

  /** Binds the configuration section into `options`, mutating it in place. */
  public configure(options: T): void {
    bindSection(this.#config, options as Record<string, unknown>);
  }
}
