// On-demand read helpers on the Section tree: get<T>/getNum/getBool/toObject +
// the value/key/path root sentinels. These throw on a present-but-malformed
// leaf and name the full path in the message.

import type { IConfigurationRoot } from "@rhombus-std/config";
import { describe, expect, test } from "bun:test";
import { rootOf } from "./support";

describe("getNum", () => {
  test("absent returns the default (or undefined with no default)", () => {
    const root = rootOf({ "Server:Port": "8080" });
    expect(root.getNum("Server:Missing", 42)).toBe(42);
    expect(root.getNum("Server:Missing")).toBeUndefined();
  });

  test("present-and-valid returns the number", () => {
    const root = rootOf({ "Server:Port": "8080" });
    expect(root.getNum("Server:Port")).toBe(8080);
    expect(root.getSection("Server").getNum("Port")).toBe(8080);
  });

  test("present-but-invalid throws, naming the full path", () => {
    const root = rootOf({ "Server:Port": "abc" });
    expect(() => root.getNum("Server:Port")).toThrow(/Server:Port/);
    expect(() => root.getSection("Server").getNum("Port")).toThrow(/Server:Port/);
    expect(() => rootOf({ "X": "" }).getNum("X")).toThrow();
  });
});

describe("getBool", () => {
  test("liberal both directions", () => {
    const root = rootOf({ "A": "yes", "B": "off" });
    expect(root.getBool("A")).toBe(true);
    expect(root.getBool("B")).toBe(false);
  });

  test("absent returns default/undefined; present-unrecognized throws", () => {
    const root = rootOf({ "A": "maybe" });
    expect(root.getBool("Missing", true)).toBe(true);
    expect(root.getBool("Missing")).toBeUndefined();
    expect(() => root.getBool("A")).toThrow(/A/);
  });
});

describe("get<T>(path, factory)", () => {
  test("present applies the factory; absent is undefined; no-factory is the raw string", () => {
    const root = rootOf({ "Csv": "a,b,c" });
    expect(root.get("Csv", (v) => v.split(","))).toEqual(["a", "b", "c"]);
    expect(root.get("Missing", (v) => v.length)).toBeUndefined();
    expect(root.get("Csv")).toBe("a,b,c");
  });
});

describe("getSection", () => {
  test("chaining getSection('a').getSection('b') matches getSection('a:b')", () => {
    const root = rootOf({ "a:b:c": "v", "a:b": "leaf" });
    const chained = root.getSection("a").getSection("b");
    const direct = root.getSection("a:b");
    expect(chained.value).toBe(direct.value);
    expect([...chained.getChildren()].map((s) => s.key)).toEqual(
      [...direct.getChildren()].map((s) => s.key),
    );
  });

  test("a missing key yields an empty section, never null", () => {
    const missing = rootOf({ "X": "1" }).getSection("Nope");
    expect(missing.value).toBeUndefined();
    expect([...missing.getChildren()]).toEqual([]);
  });
});

describe("toObject", () => {
  test("nested tree serializes to a ConfigObject; a node with value AND children is a record (value dropped)", () => {
    const root = rootOf({
      "Server:Host": "h",
      "Server:Port": "8080",
      "Server": "has-value-too",
      "Flag": "on",
    });
    expect(root.toObject()).toEqual({
      Server: { Host: "h", Port: "8080" },
      Flag: "on",
    });
  });

  test("a section toObject() returns just its subtree", () => {
    const root = rootOf({ "Server:Host": "h", "Other:X": "1" });
    expect(root.getSection("Server").toObject()).toEqual({ Host: "h" });
  });
});

describe("root sentinels", () => {
  test("value is undefined; key and path are empty strings", () => {
    const root = rootOf({ "X": "1" }) as unknown as IConfigurationRoot & { key: string; path: string };
    expect(root.value).toBeUndefined();
    expect(root.key).toBe("");
    expect(root.path).toBe("");
  });
});
