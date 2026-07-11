// Shared helpers for parsing the metrics/tracing rule configuration schema out of
// an IConfiguration. The metrics and tracing binders (MetricsConfigureOptions /
// TracingConfigureOptions) share the exact same shape -- section keys naming a
// scope, then per-meter/per-source bool leaves or nested per-instrument/
// per-operation bool leaves, with "Default" as the match-all synonym -- so the
// tree-walking primitives live here once.

import type { IConfiguration, IConfigurationSection } from '@rhombus-std/config';

/** The match-all key used at meter/instrument and source/operation levels. */
export const DEFAULT_KEY = 'Default';

/** Case-insensitive string equality (ordinal). */
export function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Parses a configuration leaf as a boolean, matching the reference's
 * `bool.TryParse`: case-insensitive `"true"`/`"false"` (surrounding whitespace
 * trimmed). Any other value -- including `undefined` -- yields `undefined`
 * ("not a bool"), so the caller skips it.
 */
export function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return undefined;
}

/** Whether `section` has at least one immediate child sub-section. */
export function hasChildren(section: IConfiguration): boolean {
  for (const _child of section.getChildren()) {
    return true;
  }
  return false;
}

/**
 * Whether `section` exists -- it has a value or at least one child. The
 * @rhombus-std config surface returns an empty section (never `null`) for an
 * absent key, so "exists" is this presence test rather than a null check.
 * Mirrors the reference `ConfigurationExtensions.Exists()`.
 */
export function sectionExists(section: IConfigurationSection): boolean {
  return section.value !== undefined || hasChildren(section);
}

/**
 * Yields every descendant leaf of `section` as `[relativePath, value]`, where
 * `relativePath` is the colon-joined key path below `section` and `value` is the
 * leaf's string value. Mirrors the reference `IConfigurationSection.AsEnumerable(makePathsRelative: true)`
 * restricted to leaves (the only entries the rule parser consumes).
 */
export function* flattenLeaves(section: IConfigurationSection): Generator<[string, string]> {
  for (const child of section.getChildren()) {
    if (hasChildren(child)) {
      for (const [path, value] of flattenLeaves(child)) {
        yield [`${child.key}:${path}`, value];
      }
    } else if (child.value !== undefined) {
      yield [child.key, child.value];
    }
  }
}
