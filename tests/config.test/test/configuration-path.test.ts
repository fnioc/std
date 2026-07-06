// configPath.combine -- must NOT treat a single string argument as an iterable
// of characters (#13): `combine("Host")` exploded to "H:o:s:t" (and 1-char
// strings infinite-recursed) before the isIterable fix excluded strings.

import { configPath } from "@rhombus-std/config";
import { describe, expect, test } from "bun:test";

describe("configPath.combine", () => {
  test("a single string argument is returned verbatim, not split per character", () => {
    expect(configPath.combine("Host")).toBe("Host");
  });

  test("a single 1-char string does not infinite-recurse", () => {
    expect(configPath.combine("H")).toBe("H");
  });

  test("multiple string segments join with the delimiter", () => {
    expect(configPath.combine("a", "b")).toBe("a:b");
  });

  test("an iterable of segments still joins", () => {
    expect(configPath.combine(["a", "b"])).toBe("a:b");
  });
});
