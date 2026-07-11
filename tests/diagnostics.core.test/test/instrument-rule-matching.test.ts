// The most-specific-InstrumentRule resolvers (instrument-rule-matching.ts) --
// black-box over the public diagnostics.core surface. The match/specificity
// tables are ported from the reference listener runtime's rule tests
// (ListenerSubscriptionTests: RuleMatchesTest / RuleMatchesNegativeTest /
// MultipleWildcardsThrows / IsMoreSpecificTestData / EqualMatchRulesTakeLast),
// with scope cases and end-to-end getMostSpecificInstrumentRule resolutions
// added on top.

import {
  getMostSpecificInstrumentRule,
  InstrumentRule,
  instrumentRuleMatches,
  type InstrumentRuleQuery,
  isMoreSpecificInstrumentRule,
  METER_SCOPE_ALL,
  MeterScope,
} from "@rhombus-std/diagnostics.core";
import { describe, expect, test } from "bun:test";

/** Shorthand rule ctor: names + scopes, `enable` defaulting to true. */
function rule(
  meterName: string | undefined,
  instrumentName: string | undefined,
  listenerName: string | undefined,
  scopes: MeterScope = MeterScope.Global,
  enable = true,
): InstrumentRule {
  return new InstrumentRule(meterName, instrumentName, listenerName, scopes, enable);
}

// The reference test instrument: a GLOBAL meter "Long.Silly.Meter.Name" with an
// instrument "InstrumentName", resolved by listener "ListenerName".
const query: InstrumentRuleQuery = {
  meterName: "Long.Silly.Meter.Name",
  instrumentName: "InstrumentName",
  listenerName: "ListenerName",
  isLocalScope: false,
};

describe("instrumentRuleMatches", () => {
  // (meterName, instrumentName, listenerName) triples that match `query`.
  const matching: [string | undefined, string | undefined, string | undefined][] = [
    [undefined, undefined, undefined],
    ["", "", ""],
    ["*", "", ""],
    ["lonG", "", ""],
    ["lonG.", "", ""],
    ["lonG*", "", ""],
    ["lonG.*", "", ""],
    ["lonG.sil", "", ""],
    ["lonG.sil*", "", ""],
    ["lonG.sillY.meteR", "", ""],
    ["lonG.sillY.meteR*", "", ""],
    ["lonG.sillY.meteR.*", "", ""],
    ["*namE", "", ""],
    ["*.namE", "", ""],
    ["*.sillY.meteR.Name", "", ""],
    ["long*Name", "", ""],
    // Overlapping prefix/suffix shouldn't match, but does -- the reference
    // keeps the quirk for compatibility with its logging category matching.
    ["lonG.sillY.meter*MeteR.namE", "", ""],
    ["lonG.sillY.meteR.namE", "", ""],
    ["", "instrumenTnamE", ""],
    ["lonG.sillY.meteR.namE", "instrumenTnamE", ""],
    ["", "", "listeneRnamE"],
    ["lonG.sillY.meteR.namE", "", "listeneRnamE"],
    ["lonG.sillY.meteR.namE", "instrumenTnamE", "listeneRnamE"],
  ];

  for (const [meterName, instrumentName, listenerName] of matching) {
    test(`matches (${meterName ?? "undefined"}, ${instrumentName ?? "undefined"}, ${listenerName ?? "undefined"})`, () => {
      expect(instrumentRuleMatches(rule(meterName, instrumentName, listenerName), query)).toBe(true);
    });
  }

  // Triples that do NOT match `query`.
  const nonMatching: [string, string, string][] = [
    ["", "*", ""], // instrument names have no wildcard support -- exact only
    ["", "", "*"], // listener names have no wildcard support -- exact only
    ["sillY.meteR.namE", "", ""], // suffix without a wildcard is not a prefix
    [".*", "", ""],
    ["*.", "", ""],
    ["lonG.sillY.meteR.namE.*", "", ""],
    ["namE", "", ""],
    ["wrongMeter", "", ""],
    ["wrongMeter", "InstrumentName", ""],
    ["wrongMeter", "", "ListenerName"],
    ["", "wrongInstrument", ""],
    ["", "", "wrongListener"],
  ];

  for (const [meterName, instrumentName, listenerName] of nonMatching) {
    test(`rejects (${meterName}, ${instrumentName}, ${listenerName})`, () => {
      expect(instrumentRuleMatches(rule(meterName, instrumentName, listenerName), query)).toBe(false);
    });
  }

  test("throws on more than one wildcard -- lazily, at match time", () => {
    const twoWildcards = rule("*.*", undefined, undefined);
    expect(() => {
      instrumentRuleMatches(twoWildcards, query);
    }).toThrow("Only one '*' wildcard");
  });

  test("a listener-named rule never matches a listener-agnostic query", () => {
    const named = rule(undefined, undefined, "SomeListener");
    expect(instrumentRuleMatches(named, { ...query, listenerName: undefined })).toBe(false);
  });

  describe("scopes", () => {
    const local: InstrumentRuleQuery = { ...query, isLocalScope: true };

    test("a Global-only rule matches only a global instrument", () => {
      const globalOnly = rule(undefined, undefined, undefined, MeterScope.Global);
      expect(instrumentRuleMatches(globalOnly, query)).toBe(true);
      expect(instrumentRuleMatches(globalOnly, local)).toBe(false);
    });

    test("a Local-only rule matches only a local instrument", () => {
      const localOnly = rule(undefined, undefined, undefined, MeterScope.Local);
      expect(instrumentRuleMatches(localOnly, query)).toBe(false);
      expect(instrumentRuleMatches(localOnly, local)).toBe(true);
    });

    test("METER_SCOPE_ALL matches both scopes", () => {
      const both = rule(undefined, undefined, undefined, METER_SCOPE_ALL);
      expect(instrumentRuleMatches(both, query)).toBe(true);
      expect(instrumentRuleMatches(both, local)).toBe(true);
    });
  });
});

describe("isMoreSpecificInstrumentRule", () => {
  // [rule, best, isLocalScope] rows where `rule` beats `best` -- and, when
  // `best` is present, the reverse comparison loses. Ported verbatim from the
  // reference IsMoreSpecificTestData.
  const moreSpecific: [InstrumentRule, InstrumentRule | undefined, boolean][] = [
    // Anything is better than undefined.
    [rule(undefined, undefined, undefined), undefined, false],

    // Any field is better than empty.
    [rule("meterName", undefined, undefined), rule(undefined, undefined, undefined), false],
    [rule(undefined, "instrumentName", undefined), rule(undefined, undefined, undefined), false],
    [rule(undefined, undefined, "listenerName"), rule(undefined, undefined, undefined), false],

    // Listener > Meter > Instrument.
    [rule(undefined, undefined, "listenerName"), rule("meterName", undefined, undefined), false],
    [rule(undefined, "instrumentName", "listenerName"), rule("meterName", undefined, undefined), false],
    [rule(undefined, undefined, "listenerName"), rule(undefined, "instrumentName", undefined), false],
    [rule("meterName", undefined, undefined), rule(undefined, "instrumentName", undefined), false],

    // Multiple fields are better than one.
    [rule("meterName", "instrumentName", undefined), rule("meterName", undefined, undefined), false],
    [rule("meterName", undefined, "listenerName"), rule("meterName", undefined, undefined), false],
    [rule("meterName", "instrumentName", "listenerName"), rule("meterName", undefined, undefined), false],
    [rule("meterName", "instrumentName", undefined), rule(undefined, "instrumentName", undefined), false],
    [rule("meterName", undefined, "listenerName"), rule(undefined, "instrumentName", undefined), false],
    [rule("meterName", "instrumentName", "listenerName"), rule(undefined, "instrumentName", undefined), false],

    // Except Listener wins regardless.
    [rule(undefined, undefined, "listenerName"), rule("meterName", "instrumentName", undefined), false],
    [rule("meterName", undefined, "listenerName"), rule(undefined, undefined, "listenerName"), false],
    [rule("meterName", "instrumentName", "listenerName"), rule(undefined, undefined, "listenerName"), false],

    // Longer meter name is better.
    [rule("meterName", undefined, undefined), rule("*", undefined, undefined), false],
    [rule("meterName.*", undefined, undefined), rule("meterName", undefined, undefined), false],
    [rule("meter.Name", undefined, undefined), rule("meter", undefined, undefined), false],
    [rule("meter.Name", undefined, undefined), rule("meter.*", undefined, undefined), false],

    // Scopes: Local > Global+Local (as local), Global > Global+Local (as global).
    [
      rule(undefined, undefined, undefined, MeterScope.Local),
      rule(undefined, undefined, undefined, METER_SCOPE_ALL),
      true,
    ],
    [
      rule(undefined, undefined, undefined, MeterScope.Global),
      rule(undefined, undefined, undefined, METER_SCOPE_ALL),
      false,
    ],
  ];

  for (const [candidate, best, isLocalScope] of moreSpecific) {
    const describeRule = (r: InstrumentRule | undefined): string => {
      return r === undefined
        ? "undefined"
        : `(${r.meterName ?? "-"}, ${r.instrumentName ?? "-"}, ${r.listenerName ?? "-"}, ${r.scopes})`;
    };
    test(`${describeRule(candidate)} beats ${describeRule(best)} (local=${isLocalScope})`, () => {
      expect(isMoreSpecificInstrumentRule(candidate, best, isLocalScope)).toBe(true);
      if (best !== undefined) {
        expect(isMoreSpecificInstrumentRule(best, candidate, isLocalScope)).toBe(false);
      }
    });
  }

  test("equally specific rules tie in BOTH directions, so the last one folds in", () => {
    const emptyTrue = rule(undefined, undefined, undefined, MeterScope.Global, true);
    const emptyFalse = rule(undefined, undefined, undefined, MeterScope.Global, false);
    expect(isMoreSpecificInstrumentRule(emptyFalse, emptyTrue, false)).toBe(true);
    expect(isMoreSpecificInstrumentRule(emptyTrue, emptyFalse, false)).toBe(true);
  });
});

describe("getMostSpecificInstrumentRule", () => {
  test("no rules resolves to undefined -- the instrument is disabled by default", () => {
    expect(getMostSpecificInstrumentRule([], query)).toBeUndefined();
  });

  test("non-matching rules resolve to undefined", () => {
    const rules = [rule("Other.Meter", undefined, undefined), rule(undefined, "other-instrument", undefined)];
    expect(getMostSpecificInstrumentRule(rules, query)).toBeUndefined();
  });

  test("most specific rule wins across meter prefixes -- disable narrows enable", () => {
    const enableAll = new InstrumentRule("MyCompany", undefined, undefined, METER_SCOPE_ALL, true);
    const disableService = new InstrumentRule("MyCompany.Service", undefined, undefined, METER_SCOPE_ALL, false);
    const rules = [enableAll, disableService];

    const broad: InstrumentRuleQuery = { meterName: "MyCompany.Other", instrumentName: "hits", isLocalScope: false };
    const narrow: InstrumentRuleQuery = {
      meterName: "MyCompany.Service",
      instrumentName: "hits",
      isLocalScope: false,
    };

    expect(getMostSpecificInstrumentRule(rules, broad)).toBe(enableAll);
    expect(getMostSpecificInstrumentRule(rules, narrow)).toBe(disableService);
  });

  test("a listener-named rule beats a meter-named one", () => {
    const meterNamed = new InstrumentRule("MyCompany.Service", undefined, undefined, METER_SCOPE_ALL, true);
    const listenerNamed = new InstrumentRule(undefined, undefined, "ListenerName", METER_SCOPE_ALL, false);
    const winner = getMostSpecificInstrumentRule([meterNamed, listenerNamed], {
      meterName: "MyCompany.Service",
      instrumentName: "hits",
      listenerName: "ListenerName",
      isLocalScope: false,
    });
    expect(winner).toBe(listenerNamed);
  });

  test("on a full tie the LAST rule wins -- later-appended rules override", () => {
    const first = new InstrumentRule(undefined, undefined, undefined, METER_SCOPE_ALL, true);
    const last = new InstrumentRule(undefined, undefined, undefined, METER_SCOPE_ALL, false);
    expect(getMostSpecificInstrumentRule([first, last], query)).toBe(last);
    expect(getMostSpecificInstrumentRule([last, first], query)).toBe(first);
  });

  test("the enablement decision is `?.enable ?? false`", () => {
    const rules = [new InstrumentRule("MyCompany", undefined, undefined, METER_SCOPE_ALL, true)];
    const covered: InstrumentRuleQuery = { meterName: "MyCompany.X", instrumentName: "hits", isLocalScope: true };
    const uncovered: InstrumentRuleQuery = { meterName: "Elsewhere", instrumentName: "hits", isLocalScope: true };

    expect(getMostSpecificInstrumentRule(rules, covered)?.enable ?? false).toBe(true);
    expect(getMostSpecificInstrumentRule(rules, uncovered)?.enable ?? false).toBe(false);
  });
});
