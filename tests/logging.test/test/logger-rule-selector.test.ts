// LoggerRuleSelector — the most-specific-rule-wins selection (white-box via the
// internal subpath; the type is internal in the reference too).

import { LoggerFilterOptions, LoggerFilterRule } from '@rhombus-std/logging';
import { LogLevel } from '@rhombus-std/logging.core';
import { LoggerRuleSelector } from '@rhombus-std/logging/private/LoggerRuleSelector';
import { describe, expect, test } from 'bun:test';

function optionsWith(rules: LoggerFilterRule[], minLevel: LogLevel = LogLevel.Information): LoggerFilterOptions {
  const options = new LoggerFilterOptions();
  options.minLevel = minLevel;
  options.rules.push(...rules);
  return options;
}

describe('LoggerRuleSelector.select', () => {
  test('no rules → the global minLevel and no filter', () => {
    const result = LoggerRuleSelector.select(optionsWith([], LogLevel.Warning), 'P', 'Cat');
    expect(result.minLevel).toBe(LogLevel.Warning);
    expect(result.filter).toBeUndefined();
  });

  test('a category-prefix rule supplies its level', () => {
    const rule = new LoggerFilterRule(undefined, 'App', LogLevel.Error, undefined);
    const result = LoggerRuleSelector.select(optionsWith([rule]), 'P', 'App.Svc');
    expect(result.minLevel).toBe(LogLevel.Error);
  });

  test('the longest matching category wins', () => {
    const short = new LoggerFilterRule(undefined, 'App', LogLevel.Warning, undefined);
    const long = new LoggerFilterRule(undefined, 'App.Db', LogLevel.Trace, undefined);
    const result = LoggerRuleSelector.select(optionsWith([short, long]), 'P', 'App.Db.Query');
    expect(result.minLevel).toBe(LogLevel.Trace);
  });

  test('a provider-specific rule is preferred over a provider-agnostic one', () => {
    const generic = new LoggerFilterRule(undefined, 'App', LogLevel.Warning, undefined);
    const specific = new LoggerFilterRule('MyProvider', 'App', LogLevel.Trace, undefined);
    const result = LoggerRuleSelector.select(optionsWith([generic, specific]), 'MyProvider', 'App.X');
    expect(result.minLevel).toBe(LogLevel.Trace);
  });

  test('a rule naming another provider does not match', () => {
    const other = new LoggerFilterRule('OtherProvider', 'App', LogLevel.Trace, undefined);
    const result = LoggerRuleSelector.select(optionsWith([other], LogLevel.Warning), 'MyProvider', 'App.X');
    expect(result.minLevel).toBe(LogLevel.Warning);
  });

  test('a wildcard category matches on prefix and suffix', () => {
    const rule = new LoggerFilterRule(undefined, 'App.*.Db', LogLevel.Trace, undefined);
    const hit = LoggerRuleSelector.select(optionsWith([rule], LogLevel.Warning), 'P', 'App.Orders.Db');
    const miss = LoggerRuleSelector.select(optionsWith([rule], LogLevel.Warning), 'P', 'App.Orders.Web');
    expect(hit.minLevel).toBe(LogLevel.Trace);
    expect(miss.minLevel).toBe(LogLevel.Warning);
  });

  test('the last of equally-specific rules wins', () => {
    const a = new LoggerFilterRule(undefined, 'App', LogLevel.Warning, undefined);
    const b = new LoggerFilterRule(undefined, 'App', LogLevel.Error, undefined);
    const result = LoggerRuleSelector.select(optionsWith([a, b]), 'P', 'App.X');
    expect(result.minLevel).toBe(LogLevel.Error);
  });

  test("a rule's filter delegate is carried through", () => {
    const filter = (): boolean => true;
    const rule = new LoggerFilterRule(undefined, 'App', LogLevel.Trace, filter);
    const result = LoggerRuleSelector.select(optionsWith([rule]), 'P', 'App.X');
    expect(result.filter).toBe(filter);
  });
});
