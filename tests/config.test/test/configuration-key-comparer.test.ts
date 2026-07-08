// compareConfigurationKeys -- the segment-by-segment, numeric-aware ordering
// that gives config keys (especially array indices) a natural sort. This
// behavior is NEW relative to the pre-rewrite single-Map ConfigurationRoot,
// which had no comparer at all and enumerated keys in insertion order.

import { compareConfigurationKeys } from "@rhombus-std/config";
import { describe, expect, test } from "bun:test";

const cmp = compareConfigurationKeys;
const sign = (n: number): number => (n < 0 ? -1 : n > 0 ? 1 : 0);

describe("compareConfigurationKeys", () => {
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

describe("compareConfigurationKeys delimiter-run collapsing (MEC parity)", () => {
  // MEC's span-walk (SkipAheadOnDelimiter) collapses runs of ':' rather than
  // producing empty segments the way a naive split(':') would -- so these keys
  // compare EQUAL, where the old split-based comparer ordered them apart.
  test("a doubled delimiter collapses -- \"a::b\" ties \"a:b\"", () => {
    expect(sign(cmp("a::b", "a:b"))).toBe(0);
  });

  test("a trailing delimiter is ignored -- \"a:\" ties \"a\"", () => {
    expect(sign(cmp("a:", "a"))).toBe(0);
  });

  test("a leading delimiter is ignored -- \":a\" ties \"a\"", () => {
    expect(sign(cmp(":a", "a"))).toBe(0);
  });

  test("leading, doubled, and trailing runs all collapse together", () => {
    expect(sign(cmp(":a::b:", "a:b"))).toBe(0);
  });

  test("segments still compare across collapsed runs -- numeric ordering survives", () => {
    // "a::10" collapses to segments [a, 10]; ordering vs [a, 2] stays numeric.
    expect(sign(cmp("a::10", "a:2"))).toBe(1);
  });

  test("a collapsed key still sorts as the shorter prefix", () => {
    expect(sign(cmp("Server:", "Server:Port"))).toBe(-1);
  });
});
