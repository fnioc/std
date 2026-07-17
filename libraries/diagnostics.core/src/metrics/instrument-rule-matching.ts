// Most-specific-InstrumentRule resolution -- ported from MED.Metrics's
// `ListenerSubscription.{GetMostSpecificRule,RuleMatches,IsMoreSpecific}`.
//
// In the reference these are statics (internal-for-testing) on the metrics
// listener runtime's per-listener subscription: whenever an instrument is
// published or the bound `MetricsOptions` reload, the subscription walks the
// rule list and enables the instrument iff the single most-specific matching
// rule says enable. This repo has no meter/instrument listener RUNTIME (see the
// package header), so the resolution algorithm itself is promoted to the
// consumable surface: pure functions over a `MetricsOptions.rules` list and a
// plain-data description of the instrument being resolved. Any consumer that
// binds a `MetricsOptions` decides "is instrument X enabled for listener L?"
// with `getMostSpecificInstrumentRule(options.rules, query)?.enable ?? false`
// (no matching rule means DISABLED, exactly as in the reference).
//
// Matching semantics (every name comparison is case-insensitive, mirroring the
// reference's ordinal-ignore-case):
//   - listenerName / instrumentName: exact match; unset/empty matches anything.
//   - meterName: PREFIX match (`"a.b"` matches meter `"a.b.c"`), optionally
//     with a single `*` wildcard splitting the pattern into a prefix and a
//     suffix (`"a.*.c"`); unset/empty matches anything. More than one `*`
//     throws -- lazily, at match time, mirroring the reference's deliberate
//     asymmetry with `TracingRule`, which validates its pattern eagerly in the
//     constructor. (The same prefix+suffix logic as the reference logging
//     stack's category-name matching, quirks included: an overlapping
//     prefix/suffix pair still matches.)
//   - scopes: the rule's {@link MeterScope} flags must include the queried
//     instrument's scope (local = created via a DI meter factory).
// Specificity (see {@link isMoreSpecificInstrumentRule}): a listener-named rule
// beats a meter-named one beats an instrument-named one beats a narrower scope;
// a longer meter name beats a shorter one; on a full tie the LAST rule in the
// list wins, so later-appended rules override earlier ones.

import type { InstrumentRule } from './InstrumentRule';
import { MeterScope } from './MeterScope';

/**
 * A plain-data description of the instrument (and resolving listener) an
 * {@link InstrumentRule} list is resolved against -- the pure stand-in for the
 * reference runtime's `Instrument` + listener-name + meter-factory triple.
 */
export interface InstrumentRuleQuery {
  /** The owning meter's name (e.g. `"MyCompany.Orders"`). */
  readonly meterName: string;
  /** The instrument's name (e.g. `"orders-created"`). */
  readonly instrumentName: string;
  /**
   * The name of the listener resolving the rules. Omit for a listener-agnostic
   * query: rules carrying a listener name then never match.
   */
  readonly listenerName?: string;
  /**
   * `true` if the meter was created locally (via a DI meter factory);
   * `false` for a global meter (created via a meter constructor).
   */
  readonly isLocalScope: boolean;
}

/** Case-insensitive equality -- the reference's ordinal-ignore-case string comparison. */
function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Whether `rule` applies to the instrument described by `query`. The port of
 * `ListenerSubscription.RuleMatches`. Unset/empty rule fields match anything;
 * see the module header for the full semantics.
 *
 * @throws {@link Error} if `rule.meterName` contains more than one `*` wildcard
 * (validated lazily here, mirroring the reference).
 */
export function instrumentRuleMatches(rule: InstrumentRule, query: InstrumentRuleQuery): boolean {
  // Listener name: exact match or empty.
  if (rule.listenerName) {
    if (query.listenerName === undefined || !equalsIgnoreCase(rule.listenerName, query.listenerName)) {
      return false;
    }
  }

  // Instrument name: exact match or empty.
  if (rule.instrumentName && !equalsIgnoreCase(rule.instrumentName, query.instrumentName)) {
    return false;
  }

  // Scopes: the rule must cover the instrument's scope.
  const scopeCovered = query.isLocalScope
    ? (rule.scopes & MeterScope.Local) !== 0
    : (rule.scopes & MeterScope.Global) !== 0;
  if (!scopeCovered) {
    return false;
  }

  // Meter name: prefix match, with an optional single-`*` prefix+suffix split.
  const meterName = rule.meterName;
  if (meterName !== undefined) {
    const wildcardIndex = meterName.indexOf('*');
    if (wildcardIndex >= 0 && meterName.indexOf('*', wildcardIndex + 1) >= 0) {
      throw new Error("Only one '*' wildcard is allowed in a meter name pattern.");
    }

    const prefix = wildcardIndex < 0 ? meterName : meterName.slice(0, wildcardIndex);
    const suffix = wildcardIndex < 0 ? '' : meterName.slice(wildcardIndex + 1);
    const actual = query.meterName.toLowerCase();
    if (!actual.startsWith(prefix.toLowerCase()) || !actual.endsWith(suffix.toLowerCase())) {
      return false;
    }
  }

  return true;
}

/**
 * Whether `rule` is at least as specific as the current `best` candidate. The
 * port of `ListenerSubscription.IsMoreSpecific`. Both rules must already MATCH
 * the same {@link InstrumentRuleQuery} (or be blank in the differing fields) --
 * this only orders candidates, it does not re-check matching. `isLocalScope`
 * is the queried instrument's scope: within it, the narrower scope flag set is
 * the more specific. Returns `true` on a full tie, so a fold over a rule list
 * keeps the LAST of equally specific rules.
 */
export function isMoreSpecificInstrumentRule(
  rule: InstrumentRule,
  best: InstrumentRule | undefined,
  isLocalScope: boolean,
): boolean {
  if (best === undefined) {
    return true;
  }

  // Listener name.
  if (rule.listenerName && !best.listenerName) {
    return true;
  } else if (!rule.listenerName && best.listenerName) {
    return false;
  }

  // Meter name.
  if (rule.meterName) {
    if (!best.meterName) {
      return true;
    }
    // Longer is more specific.
    if (rule.meterName.length !== best.meterName.length) {
      return rule.meterName.length > best.meterName.length;
    }
  } else if (best.meterName) {
    return false;
  }

  // Instrument name.
  if (rule.instrumentName && !best.instrumentName) {
    return true;
  } else if (!rule.instrumentName && best.instrumentName) {
    return false;
  }

  // Scope.
  if (isLocalScope) {
    // Already matched as local: Local-only is more specific than Local+Global.
    if ((rule.scopes & MeterScope.Global) === 0 && (best.scopes & MeterScope.Global) !== 0) {
      return true;
    } else if ((rule.scopes & MeterScope.Global) !== 0 && (best.scopes & MeterScope.Global) === 0) {
      return false;
    }
  } else {
    // Already matched as global: Global-only is more specific than Local+Global.
    if ((rule.scopes & MeterScope.Local) === 0 && (best.scopes & MeterScope.Local) !== 0) {
      return true;
    } else if ((rule.scopes & MeterScope.Local) !== 0 && (best.scopes & MeterScope.Local) === 0) {
      return false;
    }
  }

  // All things being equal, take the last one.
  return true;
}

/**
 * Resolves the single winning {@link InstrumentRule} for the instrument
 * described by `query` -- the port of `ListenerSubscription.GetMostSpecificRule`
 * and THE selection primitive over a {@link MetricsOptions.rules} list. Returns
 * `undefined` when no rule matches; the instrument is then disabled, so the
 * enablement decision is `getMostSpecificInstrumentRule(...)?.enable ?? false`.
 */
export function getMostSpecificInstrumentRule(
  rules: readonly InstrumentRule[],
  query: InstrumentRuleQuery,
): InstrumentRule | undefined {
  let best: InstrumentRule | undefined;
  for (const rule of rules) {
    if (instrumentRuleMatches(rule, query) && isMoreSpecificInstrumentRule(rule, best, query.isLocalScope)) {
      best = rule;
    }
  }
  return best;
}
