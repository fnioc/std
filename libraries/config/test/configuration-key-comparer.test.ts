// ConfigurationKeyComparer -- the segment-by-segment, numeric-aware ordering
// that gives config keys (especially array indices) a natural sort. This
// behavior is NEW relative to the pre-rewrite single-Map ConfigurationRoot,
// which had no comparer at all and enumerated keys in insertion order.

import { ConfigurationKeyComparer } from "@rhombus-std/config";
import { describe, expect, test } from "bun:test";

const cmp = ConfigurationKeyComparer.compare;
const sign = (n: number): number => (n < 0 ? -1 : n > 0 ? 1 : 0);

describe("ConfigurationKeyComparer.compare", () => {
  test("both-integer segments compare NUMERICALLY, not lexicographically", () => {
    // The whole point: a lexicographic sort gives 0,1,10,2,...,9 -- numeric
    // ordering gives 0,1,2,...,9,10. This is what a purely string-keyed Map
    // (the old design) could never provide.
    const sorted = ["10", "2", "1", "0", "9"].sort(cmp);
    expect(sorted).toEqual(["0", "1", "2", "9", "10"]);
  });

  test("numeric ordering applies per-segment across a colon-delimited path", () => {
    const sorted = ["items:10", "items:2", "items:1"].sort(cmp);
    expect(sorted).toEqual(["items:1", "items:2", "items:10"]);
  });

  test("both-non-numeric segments compare ordinal-case-insensitively", () => {
    expect(sign(cmp("alpha", "BETA"))).toBe(-1);
    expect(sign(cmp("Alpha", "alpha"))).toBe(0);
  });

  test("mixed integer-vs-non-integer sorts the integer first", () => {
    const sorted = ["name", "0", "host", "1"].sort(cmp);
    expect(sorted).toEqual(["0", "1", "host", "name"]);
  });

  test("a shorter (prefix) key sorts before a longer one when shared segments tie", () => {
    expect(sign(cmp("Server", "Server:Port"))).toBe(-1);
    expect(sign(cmp("Server:Port", "Server"))).toBe(1);
  });
});
