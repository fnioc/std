// The most-specific-TracingRule resolvers (tracing-rule-matching.ts) --
// black-box over the public diagnostics.core surface. The scenarios are ported
// from the reference tracing runtime's factory tests
// (DefaultActivitySourceFactoryTests: most-specific-across-prefix, wildcard
// prefix+suffix, operation-name enable/disable, scope filtering), re-expressed
// against the pure resolver since the rule resolution is exactly what those
// tests exercised through StartActivity.

import {
  ACTIVITY_SOURCE_SCOPES_ALL,
  ActivitySourceScopes,
  getMostSpecificTracingRule,
  isMoreSpecificTracingRule,
  TracingRule,
  tracingRuleMatches,
  type TracingRuleQuery,
} from "@rhombus-std/diagnostics.core";
import { describe, expect, test } from "bun:test";

/** Shorthand rule ctor: names + scopes, `enable` defaulting to true. */
function rule(
  sourceName: string | undefined,
  operationName?: string,
  listenerName?: string,
  scopes: ActivitySourceScopes = ACTIVITY_SOURCE_SCOPES_ALL,
  enable = true,
): TracingRule {
  return new TracingRule(sourceName, operationName, listenerName, scopes, enable);
}

/** `enable` shorthand mirroring `enableTracing(...)`'s rule. */
function enable(sourceName?: string, operationName?: string, listenerName?: string): TracingRule {
  return rule(sourceName, operationName, listenerName, ACTIVITY_SOURCE_SCOPES_ALL, true);
}

/** `disable` shorthand mirroring `disableTracing(...)`'s rule. */
function disable(sourceName?: string, operationName?: string, listenerName?: string): TracingRule {
  return rule(sourceName, operationName, listenerName, ACTIVITY_SOURCE_SCOPES_ALL, false);
}

/** The reference default-disabled decision: winning rule's enable, or false. */
function isEnabled(rules: readonly TracingRule[], query: TracingRuleQuery): boolean {
  return getMostSpecificTracingRule(rules, query)?.enable ?? false;
}

describe("tracingRuleMatches", () => {
  const query: TracingRuleQuery = {
    sourceName: "MyCompany.Service",
    operationName: "Op1",
    listenerName: "L1",
    isLocalScope: true,
  };

  test("unset fields match anything", () => {
    expect(tracingRuleMatches(rule(undefined), query)).toBe(true);
    expect(tracingRuleMatches(rule(""), query)).toBe(true);
  });

  test("source name is a case-insensitive prefix match", () => {
    expect(tracingRuleMatches(rule("mycompany"), query)).toBe(true);
    expect(tracingRuleMatches(rule("MyCompany.Service"), query)).toBe(true);
    expect(tracingRuleMatches(rule("Service"), query)).toBe(false); // suffix alone is not a prefix
    expect(tracingRuleMatches(rule("MyCompany.Service.Deeper"), query)).toBe(false);
  });

  test("a single `*` wildcard splits the pattern into prefix and suffix", () => {
    expect(tracingRuleMatches(rule("*"), query)).toBe(true);
    expect(tracingRuleMatches(rule("MyCompany.*"), query)).toBe(true);
    expect(tracingRuleMatches(rule("*.Service"), query)).toBe(true);
    expect(tracingRuleMatches(rule("My*Service"), query)).toBe(true);
    expect(tracingRuleMatches(rule("*.Internal"), query)).toBe(false);
    expect(tracingRuleMatches(rule("Other.*"), query)).toBe(false);
  });

  test("operation name is an exact case-insensitive match", () => {
    expect(tracingRuleMatches(rule("MyCompany", "Op1"), query)).toBe(true);
    expect(tracingRuleMatches(rule("MyCompany", "op1"), query)).toBe(true);
    expect(tracingRuleMatches(rule("MyCompany", "Op2"), query)).toBe(false);
  });

  test("an operation-named rule never matches a source-level (operation-less) query", () => {
    const sourceLevel: TracingRuleQuery = { ...query, operationName: undefined };
    expect(tracingRuleMatches(rule("MyCompany", "Op1"), sourceLevel)).toBe(false);
    expect(tracingRuleMatches(rule("MyCompany"), sourceLevel)).toBe(true);
  });

  test("listener name is an exact case-insensitive match; a named rule never matches an agnostic query", () => {
    expect(tracingRuleMatches(rule(undefined, undefined, "l1"), query)).toBe(true);
    expect(tracingRuleMatches(rule(undefined, undefined, "L2"), query)).toBe(false);
    expect(tracingRuleMatches(rule(undefined, undefined, "L1"), { ...query, listenerName: undefined })).toBe(false);
  });

  describe("scopes", () => {
    const local = query;
    const global: TracingRuleQuery = { ...query, isLocalScope: false };

    test("a Local-only rule does not match a global (standalone) source", () => {
      const localOnly = rule("MyCompany", undefined, undefined, ActivitySourceScopes.Local);
      expect(tracingRuleMatches(localOnly, local)).toBe(true);
      expect(tracingRuleMatches(localOnly, global)).toBe(false);
    });

    test("a Global-only rule does not match a local (factory-created) source", () => {
      const globalOnly = rule("MyCompany", undefined, undefined, ActivitySourceScopes.Global);
      expect(tracingRuleMatches(globalOnly, local)).toBe(false);
      expect(tracingRuleMatches(globalOnly, global)).toBe(true);
    });

    test("ACTIVITY_SOURCE_SCOPES_ALL matches both", () => {
      const both = rule("MyCompany");
      expect(tracingRuleMatches(both, local)).toBe(true);
      expect(tracingRuleMatches(both, global)).toBe(true);
    });
  });
});

describe("isMoreSpecificTracingRule", () => {
  test("anything beats undefined", () => {
    expect(isMoreSpecificTracingRule(rule(undefined), undefined, false)).toBe(true);
  });

  test("a listener-named rule beats any unnamed-listener rule", () => {
    const listenerNamed = rule(undefined, undefined, "L1");
    const sourceAndOp = rule("MySource", "Op1");
    expect(isMoreSpecificTracingRule(listenerNamed, sourceAndOp, false)).toBe(true);
    expect(isMoreSpecificTracingRule(sourceAndOp, listenerNamed, false)).toBe(false);
  });

  test("a source-named rule beats a source-less one; longer source names beat shorter", () => {
    expect(isMoreSpecificTracingRule(rule("MySource"), rule(undefined), false)).toBe(true);
    expect(isMoreSpecificTracingRule(rule(undefined), rule("MySource"), false)).toBe(false);
    expect(isMoreSpecificTracingRule(rule("MySource.Sub"), rule("MySource"), false)).toBe(true);
    expect(isMoreSpecificTracingRule(rule("MySource"), rule("MySource.Sub"), false)).toBe(false);
  });

  test("an operation-named rule beats an operation-less one (same source specificity)", () => {
    expect(isMoreSpecificTracingRule(rule("MySource", "Op1"), rule("MySource"), false)).toBe(true);
    expect(isMoreSpecificTracingRule(rule("MySource"), rule("MySource", "Op1"), false)).toBe(false);
  });

  test("a narrower scope set is more specific within the matched scope", () => {
    const localOnly = rule(undefined, undefined, undefined, ActivitySourceScopes.Local);
    const globalOnly = rule(undefined, undefined, undefined, ActivitySourceScopes.Global);
    const both = rule(undefined, undefined, undefined, ACTIVITY_SOURCE_SCOPES_ALL);

    expect(isMoreSpecificTracingRule(localOnly, both, true)).toBe(true);
    expect(isMoreSpecificTracingRule(both, localOnly, true)).toBe(false);
    expect(isMoreSpecificTracingRule(globalOnly, both, false)).toBe(true);
    expect(isMoreSpecificTracingRule(both, globalOnly, false)).toBe(false);
  });

  test("equally specific rules tie in BOTH directions, so the last one folds in", () => {
    const a = enable("MySource");
    const b = disable("MySource");
    expect(isMoreSpecificTracingRule(a, b, false)).toBe(true);
    expect(isMoreSpecificTracingRule(b, a, false)).toBe(true);
  });
});

describe("getMostSpecificTracingRule", () => {
  // Factory-created sources are LOCAL scope, as in the reference tests.
  function localQuery(sourceName: string, operationName?: string): TracingRuleQuery {
    return { sourceName, operationName, listenerName: "L1", isLocalScope: true };
  }

  test("an enabled rule allows the source's activities", () => {
    const rules = [enable("MySource")];
    expect(isEnabled(rules, localQuery("MySource", "Op1"))).toBe(true);
  });

  test("disabled by default: no matching rule resolves to undefined", () => {
    const rules = [enable("Other")];
    expect(getMostSpecificTracingRule(rules, localQuery("MySource", "Op1"))).toBeUndefined();
    expect(isEnabled(rules, localQuery("MySource", "Op1"))).toBe(false);
  });

  test("most specific rule wins across source prefixes", () => {
    const rules = [enable("MyCompany"), disable("MyCompany.Service")];
    expect(isEnabled(rules, localQuery("MyCompany.Other", "Op"))).toBe(true);
    expect(isEnabled(rules, localQuery("MyCompany.Service", "Op"))).toBe(false);
  });

  test("a wildcard source pattern matches prefix and suffix", () => {
    const rules = [enable("MyCompany.*.Public")];
    expect(isEnabled(rules, localQuery("MyCompany.Service.Public", "Op"))).toBe(true);
    expect(isEnabled(rules, localQuery("MyCompany.Service.Internal", "Op"))).toBe(false);
  });

  test("an operation-name rule disables one operation of an enabled source", () => {
    const rules = [enable("MySource"), disable("MySource", "Quiet")];
    expect(isEnabled(rules, localQuery("MySource", "Loud"))).toBe(true);
    expect(isEnabled(rules, localQuery("MySource", "Quiet"))).toBe(false);
    // The source-level default (no operation name) stays enabled.
    expect(isEnabled(rules, localQuery("MySource"))).toBe(true);
  });

  test("an operation-name rule enables one operation of an otherwise-disabled source", () => {
    const rules = [enable("MySource", "Loud")];
    expect(isEnabled(rules, localQuery("MySource", "Loud"))).toBe(true);
    expect(isEnabled(rules, localQuery("MySource", "Quiet"))).toBe(false);
    // The source-level default (no operation name) stays disabled.
    expect(isEnabled(rules, localQuery("MySource"))).toBe(false);
  });

  test("a Local-scope rule does not match a standalone (global) source", () => {
    const rules = [rule("MySource", undefined, undefined, ActivitySourceScopes.Local, true)];
    expect(isEnabled(rules, localQuery("MySource", "Op"))).toBe(true);
    expect(isEnabled(rules, { sourceName: "MySource", operationName: "Op", isLocalScope: false })).toBe(false);
  });

  test("a listener-named rule outranks a source-named one for its listener only", () => {
    const rules = [enable("MySource"), rule(undefined, undefined, "L1", ACTIVITY_SOURCE_SCOPES_ALL, false)];
    // For L1 the listener-named disable wins despite the source-named enable.
    expect(isEnabled(rules, localQuery("MySource", "Op"))).toBe(false);
    // For any other listener the listener-named rule doesn't match at all.
    expect(isEnabled(rules, { sourceName: "MySource", operationName: "Op", listenerName: "L2", isLocalScope: true }))
      .toBe(true);
  });

  test("on a full tie the LAST rule wins -- later-appended rules override", () => {
    const first = enable("MySource");
    const last = disable("MySource");
    expect(getMostSpecificTracingRule([first, last], localQuery("MySource", "Op"))).toBe(last);
    expect(getMostSpecificTracingRule([last, first], localQuery("MySource", "Op"))).toBe(first);
  });
});
