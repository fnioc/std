// LoggerRuleSelector — the most-specific-rule-wins filter selection, ported
// from ME.Logging's `LoggerRuleSelector`. Given the accumulated
// `LoggerFilterOptions` and one provider/category pair, it picks the single
// governing rule and yields its `(minLevel, filter)`.
//
// Rule selection (verbatim from the reference):
//   1. Prefer rules naming the current provider; else rules with no provider.
//   2. Prefer the longest matching category prefix.
//   3. With none matching by category, fall back to rules with no category.
//   4. One applicable rule → use it; several → use the last.
//   5. No applicable rule → the options' global `minLevel`, no filter.
//
// Provider ALIAS matching (the reference's `ProviderAliasUtilities.GetAlias`)
// has no analog yet in this port — the provider-alias attribute lands with
// logging.core's ProviderAliasAttribute work. Until an alias source exists here,
// only the provider TYPE name is matched; a rule keyed by an alias simply does
// not match. Wiring the alias in is a documented residual.

import type { LogLevel } from '@rhombus-std/logging.core';
import type { LoggerFilterOptions, LoggerFilterRule } from './logger-filter-options';
import type { LoggerFilterDelegate } from './logger-information';

/** The selected filter for one provider/category: the effective min level and optional delegate. */
export interface SelectedRule {
  minLevel: LogLevel | undefined;
  filter: LoggerFilterDelegate | undefined;
}

/**
 * Selects the governing rule for `providerType` + `category` from `options`,
 * returning its `minLevel`/`filter` (or the global `minLevel` and no filter
 * when nothing matches).
 */
export function select(
  options: LoggerFilterOptions,
  providerType: string,
  category: string,
): SelectedRule {
  let current: LoggerFilterRule | undefined;
  for (const rule of options.rules) {
    if (isBetter(rule, current, providerType, category)) {
      current = rule;
    }
  }

  if (current !== undefined) {
    return { minLevel: current.logLevel, filter: current.filter };
  }
  return { minLevel: options.minLevel, filter: undefined };
}

const WILDCARD_CHAR = '*';

/** Whether `rule` is a strictly better match than `current` for `logger`/`category`. */
function isBetter(
  rule: LoggerFilterRule,
  current: LoggerFilterRule | undefined,
  logger: string,
  category: string,
): boolean {
  // Skip rules with an inapplicable provider or category.
  if (rule.providerName !== undefined && rule.providerName !== logger) {
    return false;
  }

  const categoryName = rule.categoryName;
  if (categoryName !== undefined) {
    const wildcardIndex = categoryName.indexOf(WILDCARD_CHAR);
    if (wildcardIndex !== -1 && categoryName.indexOf(WILDCARD_CHAR, wildcardIndex + 1) !== -1) {
      throw new Error('Only one wildcard character is allowed in category name.');
    }

    const prefix = wildcardIndex === -1 ? categoryName : categoryName.slice(0, wildcardIndex);
    const suffix = wildcardIndex === -1 ? '' : categoryName.slice(wildcardIndex + 1);

    if (!startsWithIgnoreCase(category, prefix) || !endsWithIgnoreCase(category, suffix)) {
      return false;
    }
  }

  if (current?.providerName !== undefined) {
    if (rule.providerName === undefined) {
      return false;
    }
  } else {
    // Skip the category check when moving from no provider to a provider.
    if (rule.providerName !== undefined) {
      return true;
    }
  }

  if (current?.categoryName !== undefined) {
    if (rule.categoryName === undefined) {
      return false;
    }
    if (current.categoryName.length > rule.categoryName.length) {
      return false;
    }
  }

  return true;
}

function startsWithIgnoreCase(value: string, prefix: string): boolean {
  return value.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase();
}

function endsWithIgnoreCase(value: string, suffix: string): boolean {
  if (suffix.length === 0) {
    return true;
  }
  return value.slice(value.length - suffix.length).toLowerCase() === suffix.toLowerCase();
}

/** The `LoggerRuleSelector` static surface (the reference names it thus). */
export const LoggerRuleSelector = { select };
