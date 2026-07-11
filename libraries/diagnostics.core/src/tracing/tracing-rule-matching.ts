// Most-specific-TracingRule resolution -- ported from MED.Tracing's
// `DefaultActivitySourceFactory.{GetMostSpecificRule,RuleMatches,IsMoreSpecific,Matches}`.
//
// In the reference these are private statics of the tracing runtime's
// activity-source factory: each listener registration resolves, per activity
// source (and per operation name, when operation-name rules exist), the single
// most-specific matching rule and listens iff it says enable. This repo has no
// Activity/ActivitySource RUNTIME (see the package header), so the resolution
// algorithm itself is promoted to the consumable surface: pure functions over a
// `TracingOptions.rules` list and a plain-data description of the source being
// resolved. Any consumer that binds a `TracingOptions` decides "is source X
// (operation Y) enabled for listener L?" with
// `getMostSpecificTracingRule(options.rules, query)?.enable ?? false` (no
// matching rule means DISABLED, exactly as in the reference).
//
// Matching semantics (every name comparison is case-insensitive, mirroring the
// reference's ordinal-ignore-case):
//   - listenerName / operationName: exact match; unset/empty matches anything.
//     An operation-named rule additionally never matches a query WITHOUT an
//     operation name -- omitting `query.operationName` resolves the
//     source-level default, exactly as the reference's factory does when it
//     computes a source's default enablement.
//   - sourceName: PREFIX match (`"a.b"` matches source `"a.b.c"`), optionally
//     with a single `*` wildcard splitting the pattern into a prefix and a
//     suffix (`"a.*.c"`); unset/empty matches anything. `TracingRule`'s
//     constructor validates the at-most-one-`*` invariant eagerly, so no
//     re-check happens here (the reference's deliberate asymmetry with the
//     metrics rule's lazy match-time validation).
//   - scopes: the rule's {@link ActivitySourceScopes} flags must include the
//     queried source's scope (local = created via a DI activity-source factory).
// Specificity (see {@link isMoreSpecificTracingRule}): a listener-named rule
// beats a source-named one beats an operation-named one beats a narrower
// scope; a longer source name beats a shorter one; on a full tie the LAST rule
// in the list wins, so later-appended rules override earlier ones.
//
// The reference statics thread a `considerOperationName` flag; every call site
// passes `true` (`false` would make operation-named rules match any operation),
// so the flag is not ported -- the always-taken branch is inlined. Flagged as a
// deliberate surface simplification.

import { ActivitySourceScopes } from './activity-source-scopes';
import type { TracingRule } from './TracingRule';

/**
 * A plain-data description of the activity source (and resolving listener) a
 * {@link TracingRule} list is resolved against -- the pure stand-in for the
 * reference runtime's source-name + operation-name + listener-name + scope
 * tuple.
 */
export interface TracingRuleQuery {
  /** The activity-source name being resolved (e.g. `"MyCompany.Orders"`). */
  readonly sourceName: string;
  /**
   * The activity operation name to resolve for. Omit to resolve the
   * SOURCE-LEVEL default: rules carrying an operation name then never match.
   */
  readonly operationName?: string;
  /**
   * The name of the listener resolving the rules. Omit for a listener-agnostic
   * query: rules carrying a listener name then never match.
   */
  readonly listenerName?: string;
  /**
   * `true` if the source was created locally (via a DI activity-source
   * factory); `false` for a global source (created via a source constructor).
   */
  readonly isLocalScope: boolean;
}

/** Case-insensitive equality -- the reference's ordinal-ignore-case string comparison. */
function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Whether the source-name `pattern` covers `name` -- the port of
 * `DefaultActivitySourceFactory.Matches`: unset/empty matches anything;
 * otherwise a case-insensitive prefix match, with a single `*` wildcard
 * splitting the pattern into a prefix and a suffix. `TracingRule`'s
 * constructor validates that at most one `*` is present, so no re-check
 * happens here; a second `*` reaching this code would be treated as a literal
 * character inside the suffix, mirroring the reference.
 */
function sourceNameMatches(pattern: string | undefined, name: string): boolean {
  if (!pattern) {
    return true;
  }

  const wildcardIndex = pattern.indexOf('*');
  const prefix = wildcardIndex < 0 ? pattern : pattern.slice(0, wildcardIndex);
  const suffix = wildcardIndex < 0 ? '' : pattern.slice(wildcardIndex + 1);
  const actual = name.toLowerCase();
  return actual.startsWith(prefix.toLowerCase()) && actual.endsWith(suffix.toLowerCase());
}

/**
 * Whether `rule` applies to the activity source (and operation) described by
 * `query`. The port of `DefaultActivitySourceFactory.RuleMatches`. Unset/empty
 * rule fields match anything; see the module header for the full semantics.
 */
export function tracingRuleMatches(rule: TracingRule, query: TracingRuleQuery): boolean {
  // Listener name: exact match or empty.
  if (rule.listenerName) {
    if (query.listenerName === undefined || !equalsIgnoreCase(rule.listenerName, query.listenerName)) {
      return false;
    }
  }

  // Scopes: the rule must cover the source's scope.
  const requiredScope = query.isLocalScope ? ActivitySourceScopes.Local : ActivitySourceScopes.Global;
  if ((rule.scopes & requiredScope) === 0) {
    return false;
  }

  // Source name: prefix match, with an optional single-`*` prefix+suffix split.
  if (!sourceNameMatches(rule.sourceName, query.sourceName)) {
    return false;
  }

  // Operation name: exact match or empty; an operation-named rule never
  // matches a source-level (operation-less) query.
  if (rule.operationName) {
    if (query.operationName === undefined || !equalsIgnoreCase(rule.operationName, query.operationName)) {
      return false;
    }
  }

  return true;
}

/**
 * Whether `rule` is at least as specific as the current `best` candidate. The
 * port of `DefaultActivitySourceFactory.IsMoreSpecific`. Both rules must
 * already MATCH the same {@link TracingRuleQuery} (or be blank in the differing
 * fields) -- this only orders candidates, it does not re-check matching.
 * `isLocalScope` is the queried source's scope: within it, the narrower scope
 * flag set is the more specific. Returns `true` on a full tie, so a fold over
 * a rule list keeps the LAST of equally specific rules.
 */
export function isMoreSpecificTracingRule(
  rule: TracingRule,
  best: TracingRule | undefined,
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

  // Source name.
  if (rule.sourceName) {
    if (!best.sourceName) {
      return true;
    }
    // Longer is more specific.
    if (rule.sourceName.length !== best.sourceName.length) {
      return rule.sourceName.length > best.sourceName.length;
    }
  } else if (best.sourceName) {
    return false;
  }

  // Operation name.
  if (rule.operationName && !best.operationName) {
    return true;
  } else if (!rule.operationName && best.operationName) {
    return false;
  }

  // Scope.
  if (isLocalScope) {
    // Already matched as local: Local-only is more specific than Local+Global.
    if ((rule.scopes & ActivitySourceScopes.Global) === 0 && (best.scopes & ActivitySourceScopes.Global) !== 0) {
      return true;
    } else if ((rule.scopes & ActivitySourceScopes.Global) !== 0 && (best.scopes & ActivitySourceScopes.Global) === 0) {
      return false;
    }
  } else {
    // Already matched as global: Global-only is more specific than Local+Global.
    if ((rule.scopes & ActivitySourceScopes.Local) === 0 && (best.scopes & ActivitySourceScopes.Local) !== 0) {
      return true;
    } else if ((rule.scopes & ActivitySourceScopes.Local) !== 0 && (best.scopes & ActivitySourceScopes.Local) === 0) {
      return false;
    }
  }

  // All things being equal, take the last one.
  return true;
}

/**
 * Resolves the single winning {@link TracingRule} for the activity source (and
 * operation) described by `query` -- the port of
 * `DefaultActivitySourceFactory.GetMostSpecificRule` and THE selection
 * primitive over a {@link TracingOptions.rules} list. Returns `undefined` when
 * no rule matches; the source/operation is then disabled, so the enablement
 * decision is `getMostSpecificTracingRule(...)?.enable ?? false`.
 */
export function getMostSpecificTracingRule(
  rules: readonly TracingRule[],
  query: TracingRuleQuery,
): TracingRule | undefined {
  let best: TracingRule | undefined;
  for (const rule of rules) {
    if (tracingRuleMatches(rule, query) && isMoreSpecificTracingRule(rule, best, query.isLocalScope)) {
      best = rule;
    }
  }
  return best;
}
