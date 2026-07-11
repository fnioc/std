// FormattedLogValues — the structured `IReadOnlyList<KeyValuePair>` shape:
// `[holeName, value]` pairs parsed from the template, followed by the
// `["{OriginalFormat}", template]` pseudo-entry. Black-box via the public
// logging.core surface.

import { FormattedLogValues } from "@rhombus-std/logging.core";
import { describe, expect, test } from "bun:test";

describe("FormattedLogValues structured enumeration", () => {
  test("yields a [name, value] pair per hole, then {OriginalFormat}", () => {
    const template = "User {User} logged in from {Address}";
    const values = new FormattedLogValues(template, ["ada", "10.0.0.1"]);

    expect(values.count).toBe(3);
    expect(values.get(0)).toEqual(["User", "ada"]);
    expect(values.get(1)).toEqual(["Address", "10.0.0.1"]);
    expect(values.get(2)).toEqual(["{OriginalFormat}", template]);
    expect([...values]).toEqual([
      ["User", "ada"],
      ["Address", "10.0.0.1"],
      ["{OriginalFormat}", template],
    ]);
  });

  test("renders the message via toString, independent of the structured view", () => {
    const values = new FormattedLogValues("User {User} logged in from {Address}", ["ada", "10.0.0.1"]);
    expect(values.toString()).toBe("User ada logged in from 10.0.0.1");
    expect(String(values)).toBe("User ada logged in from 10.0.0.1");
  });

  test("with no values collapses to the lone {OriginalFormat} entry", () => {
    const values = new FormattedLogValues("nothing to bind here", []);
    expect(values.count).toBe(1);
    expect(values.get(0)).toEqual(["{OriginalFormat}", "nothing to bind here"]);
    expect([...values]).toEqual([["{OriginalFormat}", "nothing to bind here"]]);
    expect(values.toString()).toBe("nothing to bind here");
  });

  test("a hole name stops at its alignment or format specifier", () => {
    expect(new FormattedLogValues("{Count,5}", [3]).get(0)).toEqual(["Count", 3]);
    expect(new FormattedLogValues("{Price:C}", [10]).get(0)).toEqual(["Price", 10]);
  });

  test("escaped braces are not holes", () => {
    const values = new FormattedLogValues("{{literal}} {Real}", ["x"]);
    expect(values.count).toBe(2);
    expect(values.get(0)).toEqual(["Real", "x"]);
    expect(values.toString()).toBe("{literal} x");
  });

  test("indexing out of range throws", () => {
    const values = new FormattedLogValues("{A}", [1]);
    expect(() => values.get(2)).toThrow(RangeError);
    expect(() => values.get(-1)).toThrow(RangeError);
  });

  test("is a structural IReadOnlyList<KeyValuePair>: every item is a [string, unknown] two-tuple", () => {
    // This is exactly what a structured sink's `state as IReadOnlyList<...>`
    // probe requires (an iterable of two-tuples keyed by a string).
    const values = new FormattedLogValues("{A} {B}", [1, true]);
    for (const item of values) {
      expect(Array.isArray(item)).toBe(true);
      expect(item.length).toBe(2);
      expect(typeof item[0]).toBe("string");
    }
  });
});
