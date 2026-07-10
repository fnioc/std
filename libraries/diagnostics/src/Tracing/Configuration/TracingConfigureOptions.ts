// TracingConfigureOptions -- ported from MED.Tracing's internal
// `TracingConfigureOptions`. The tracing analog of MetricsConfigureOptions: reads
// the tracing enablement schema from an IConfiguration and appends the matching
// TracingRules.
//
// Schema (case-insensitive section keys): `EnabledTracing` (both scopes),
// `EnabledGlobalTracing`, `EnabledLocalTracing`, plus the listener-specific
// `{ListenerName}:{Enabled...Tracing}:...`. Within a scope section, each child is
// either a bool leaf (`{SourceName} = true`) or an object of per-operation bool
// leaves (`{SourceName}:{OperationName} = true`). `Default` is the match-all
// synonym. Non-bool values are skipped.

import type { IConfiguration, IConfigurationSection } from "@rhombus-std/config";
import {
  ACTIVITY_SOURCE_SCOPES_ALL,
  ActivitySourceScopes,
  TracingOptions,
  TracingRule,
} from "@rhombus-std/diagnostics.core";
import type { ConfigureOptions } from "@rhombus-std/options";

import {
  DEFAULT_KEY,
  equalsIgnoreCase,
  flattenLeaves,
  hasChildren,
  parseBool,
  sectionExists,
} from "../../config-rule-parsing";

const ENABLED_TRACING_KEY = "EnabledTracing";
const ENABLED_GLOBAL_TRACING_KEY = "EnabledGlobalTracing";
const ENABLED_LOCAL_TRACING_KEY = "EnabledLocalTracing";

/** Appends per-operation rules from an object of `{OperationName} = bool` leaves. */
function loadActivityRules(
  options: TracingOptions,
  sourceSection: IConfigurationSection,
  scopes: ActivitySourceScopes,
  listenerName: string | undefined,
): void {
  for (const [relativePath, rawValue] of flattenLeaves(sourceSection)) {
    const enabled = parseBool(rawValue);
    if (enabled === undefined) {
      continue;
    }
    const operationName = equalsIgnoreCase(DEFAULT_KEY, relativePath) ? undefined : relativePath;
    options.rules.push(new TracingRule(sourceSection.key, operationName, listenerName, scopes, enabled));
  }
}

/** Appends per-source rules (bool leaf) or recurses into per-operation rules (object). */
function loadActivitySourceRules(
  options: TracingOptions,
  scopeSection: IConfigurationSection,
  scopes: ActivitySourceScopes,
  listenerName: string | undefined,
): void {
  for (const sourceSection of scopeSection.getChildren()) {
    if (hasChildren(sourceSection)) {
      loadActivityRules(options, sourceSection, scopes, listenerName);
      continue;
    }
    const enabled = parseBool(sourceSection.value);
    if (enabled === undefined) {
      continue;
    }
    const sourceName = equalsIgnoreCase(DEFAULT_KEY, sourceSection.key) ? undefined : sourceSection.key;
    options.rules.push(new TracingRule(sourceName, undefined, listenerName, scopes, enabled));
  }
}

/**
 * A {@link ConfigureOptions} step that binds the tracing enablement schema of an
 * {@link IConfiguration} into a {@link TracingOptions}. Mirrors MED.Tracing's
 * `TracingConfigureOptions`.
 */
export class TracingConfigureOptions implements ConfigureOptions<TracingOptions> {
  readonly #configuration: IConfiguration;

  /** @param configuration The configuration section to read tracing rules from. */
  public constructor(configuration: IConfiguration) {
    this.#configuration = configuration;
  }

  /** Reads the schema and appends the matching {@link TracingRule}s to `options`. */
  public configure(options: TracingOptions): void {
    for (const section of this.#configuration.getChildren()) {
      if (equalsIgnoreCase(section.key, ENABLED_TRACING_KEY)) {
        loadActivitySourceRules(options, section, ACTIVITY_SOURCE_SCOPES_ALL, undefined);
      } else if (equalsIgnoreCase(section.key, ENABLED_GLOBAL_TRACING_KEY)) {
        loadActivitySourceRules(options, section, ActivitySourceScopes.Global, undefined);
      } else if (equalsIgnoreCase(section.key, ENABLED_LOCAL_TRACING_KEY)) {
        loadActivitySourceRules(options, section, ActivitySourceScopes.Local, undefined);
      } else {
        const listenerName = section.key;
        const all = section.getSection(ENABLED_TRACING_KEY);
        if (sectionExists(all)) {
          loadActivitySourceRules(options, all, ACTIVITY_SOURCE_SCOPES_ALL, listenerName);
        }
        const global = section.getSection(ENABLED_GLOBAL_TRACING_KEY);
        if (sectionExists(global)) {
          loadActivitySourceRules(options, global, ActivitySourceScopes.Global, listenerName);
        }
        const local = section.getSection(ENABLED_LOCAL_TRACING_KEY);
        if (sectionExists(local)) {
          loadActivitySourceRules(options, local, ActivitySourceScopes.Local, listenerName);
        }
      }
    }
  }
}
