// MetricsConfigureOptions -- ported from MED.Metrics's internal
// `MetricsConfigureOptions`. A ConfigureOptions<MetricsOptions> step that reads
// the metrics enablement schema from an IConfiguration and appends the matching
// InstrumentRules.
//
// Schema (case-insensitive section keys): `EnabledMetrics` (both scopes),
// `EnabledGlobalMetrics`, `EnabledLocalMetrics`, plus a listener-specific form
// `{ListenerName}:{Enabled...Metrics}:...`. Within a scope section, each child is
// either a bool leaf (`{MeterName} = true`, enabling all its instruments) or an
// object of per-instrument bool leaves (`{MeterName}:{InstrumentName} = true`).
// `Default` at either level is the match-all synonym (a `null` meter/instrument
// name). Non-bool values are skipped.

import type { IConfiguration, IConfigurationSection } from '@rhombus-std/config';
import { InstrumentRule, METER_SCOPE_ALL, MeterScope, MetricsOptions } from '@rhombus-std/diagnostics.core';
import type { ConfigureOptions } from '@rhombus-std/options';

import { DEFAULT_KEY, equalsIgnoreCase, flattenLeaves, hasChildren, parseBool,
  sectionExists } from '../../config-rule-parsing';

const ENABLED_METRICS_KEY = 'EnabledMetrics';
const ENABLED_GLOBAL_METRICS_KEY = 'EnabledGlobalMetrics';
const ENABLED_LOCAL_METRICS_KEY = 'EnabledLocalMetrics';

/** Appends per-instrument rules from an object of `{InstrumentName} = bool` leaves. */
function loadInstrumentRules(
  options: MetricsOptions,
  meterSection: IConfigurationSection,
  scopes: MeterScope,
  listenerName: string | undefined,
): void {
  for (const [relativePath, rawValue] of flattenLeaves(meterSection)) {
    const enabled = parseBool(rawValue);
    if (enabled === undefined) {
      continue;
    }
    const instrumentName = equalsIgnoreCase(DEFAULT_KEY, relativePath) ? undefined : relativePath;
    options.rules.push(new InstrumentRule(meterSection.key, instrumentName, listenerName, scopes, enabled));
  }
}

/** Appends per-meter rules (bool leaf) or recurses into per-instrument rules (object). */
function loadMeterRules(
  options: MetricsOptions,
  scopeSection: IConfigurationSection,
  scopes: MeterScope,
  listenerName: string | undefined,
): void {
  for (const meterSection of scopeSection.getChildren()) {
    if (hasChildren(meterSection)) {
      loadInstrumentRules(options, meterSection, scopes, listenerName);
      continue;
    }
    const enabled = parseBool(meterSection.value);
    if (enabled === undefined) {
      continue;
    }
    const meterName = equalsIgnoreCase(DEFAULT_KEY, meterSection.key) ? undefined : meterSection.key;
    options.rules.push(new InstrumentRule(meterName, undefined, listenerName, scopes, enabled));
  }
}

/**
 * A {@link ConfigureOptions} step that binds the metrics enablement schema of an
 * {@link IConfiguration} into a {@link MetricsOptions}. Mirrors MED.Metrics's
 * `MetricsConfigureOptions`.
 */
export class MetricsConfigureOptions implements ConfigureOptions<MetricsOptions> {
  readonly #configuration: IConfiguration;

  /** @param configuration The configuration section to read metrics rules from. */
  public constructor(configuration: IConfiguration) {
    this.#configuration = configuration;
  }

  /** Reads the schema and appends the matching {@link InstrumentRule}s to `options`. */
  public configure(options: MetricsOptions): void {
    for (const section of this.#configuration.getChildren()) {
      if (equalsIgnoreCase(section.key, ENABLED_METRICS_KEY)) {
        loadMeterRules(options, section, METER_SCOPE_ALL, undefined);
      } else if (equalsIgnoreCase(section.key, ENABLED_GLOBAL_METRICS_KEY)) {
        loadMeterRules(options, section, MeterScope.Global, undefined);
      } else if (equalsIgnoreCase(section.key, ENABLED_LOCAL_METRICS_KEY)) {
        loadMeterRules(options, section, MeterScope.Local, undefined);
      } else {
        // A listener-specific block: {ListenerName}:{Enabled...Metrics}:...
        const listenerName = section.key;
        const all = section.getSection(ENABLED_METRICS_KEY);
        if (sectionExists(all)) {
          loadMeterRules(options, all, METER_SCOPE_ALL, listenerName);
        }
        const global = section.getSection(ENABLED_GLOBAL_METRICS_KEY);
        if (sectionExists(global)) {
          loadMeterRules(options, global, MeterScope.Global, listenerName);
        }
        const local = section.getSection(ENABLED_LOCAL_METRICS_KEY);
        if (sectionExists(local)) {
          loadMeterRules(options, local, MeterScope.Local, listenerName);
        }
      }
    }
  }
}
