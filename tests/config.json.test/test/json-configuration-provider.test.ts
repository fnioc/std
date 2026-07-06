// Behavior tests for JsonConfigurationProvider/Source -- reads a JSON file
// from disk and flattens it into the case-insensitive key/value store shared
// by every ConfigurationProvider. Migrated from the pre-monorepo
// `test/sources/json-file.test.ts` against the old
// `JsonFileSource`/`ConfigSource` shapes; same fixtures, same assertions --
// exercised here through the ConfigurationBuilder -> JsonConfigurationSource
// -> ConfigurationRoot path.

import { ConfigurationBuilder } from "@rhombus-std/config";
import { JsonConfigurationSource } from "@rhombus-std/config.json/internal/json-configuration-source";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Side-effect import: installs `addJsonFile` onto ConfigurationBuilder.
import "@rhombus-std/config.json/internal/index";

const FIXTURES = "test/fixtures/json-file";

describe("JsonConfigurationProvider", () => {
  test("flattens nested objects into colon-delimited keys", () => {
    const root = new ConfigurationBuilder()
      .add(new JsonConfigurationSource(`${FIXTURES}/nested.json`))
      .build();

    expect(root.get("Server:Host")).toBe("localhost");
    expect(root.get("TopLevel")).toBe("value");
  });

  test("string-converts scalar leaves (numbers and booleans)", () => {
    const root = new ConfigurationBuilder()
      .add(new JsonConfigurationSource(`${FIXTURES}/nested.json`))
      .build();

    expect(root.get("Server:Port")).toBe("8080");
    expect(root.get("Server:UseTls")).toBe("true");
  });

  test("index-flattens arrays as Key:0, Key:1, ...", () => {
    const root = new ConfigurationBuilder()
      .add(new JsonConfigurationSource(`${FIXTURES}/nested.json`))
      .build();

    expect(root.get("Server:Tags:0")).toBe("a");
    expect(root.get("Server:Tags:1")).toBe("b");
  });

  test("skips keys whose value is null", () => {
    const root = new ConfigurationBuilder()
      .add(new JsonConfigurationSource(`${FIXTURES}/nested.json`))
      .build();

    expect(root.get("Server:Nullable")).toBeUndefined();
    expect([...root.getSection("Server").getChildren()].some((c) => c.key === "Nullable"))
      .toBe(false);
  });

  test("recurses into arrays of objects", () => {
    const root = new ConfigurationBuilder()
      .add(new JsonConfigurationSource(`${FIXTURES}/array-of-objects.json`))
      .build();

    expect(root.get("Items:0:Name")).toBe("first");
    expect(root.get("Items:0:Count")).toBe("1");
    expect(root.get("Items:1:Name")).toBe("second");
    expect(root.get("Items:1:Count")).toBe("2");
  });

  test("resolves a relative path against process.cwd()", () => {
    expect(() =>
      new ConfigurationBuilder()
        .add(new JsonConfigurationSource(`${FIXTURES}/nested.json`))
        .build()
    ).not.toThrow();
  });

  test("throws when the file does not exist and optional is not set", () => {
    expect(() =>
      new ConfigurationBuilder()
        .add(new JsonConfigurationSource(`${FIXTURES}/does-not-exist.json`))
        .build()
    ).toThrow();
  });

  test("returns an empty provider when the file is missing and optional is true", () => {
    const root = new ConfigurationBuilder()
      .add(new JsonConfigurationSource(`${FIXTURES}/does-not-exist.json`, { optional: true }))
      .build();

    expect([...root.getChildren()]).toEqual([]);
  });

  test("throws on malformed JSON even when optional is true", () => {
    expect(() =>
      new ConfigurationBuilder()
        .add(new JsonConfigurationSource(`${FIXTURES}/invalid.json`, { optional: true }))
        .build()
    ).toThrow();
  });

  test("addJsonFile augmentation registers a JsonConfigurationSource on the builder", () => {
    const root = new ConfigurationBuilder()
      .addJsonFile(`${FIXTURES}/nested.json`)
      .build();

    expect(root.get("Server:Host")).toBe("localhost");
  });

  test("addJsonFile honors the optional flag for a missing file", () => {
    const root = new ConfigurationBuilder()
      .addJsonFile(`${FIXTURES}/does-not-exist.json`, { optional: true })
      .build();

    expect([...root.getChildren()]).toEqual([]);
  });

  test("throws when the JSON root is a scalar", () => {
    expect(() =>
      new ConfigurationBuilder()
        .add(new JsonConfigurationSource(`${FIXTURES}/scalar.json`))
        .build()
    ).toThrow(/root must be an object or array/);
  });

  test("throws when the JSON root is null", () => {
    expect(() =>
      new ConfigurationBuilder()
        .add(new JsonConfigurationSource(`${FIXTURES}/null-root.json`))
        .build()
    ).toThrow(/root must be an object or array/);
  });
});

describe("JsonConfigurationProvider reload + error hardening (#17)", () => {
  let dir: string;

  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reload after a key is removed from the file drops the stale key", () => {
    dir = mkdtempSync(join(tmpdir(), "rhombus-config-json-"));
    const file = join(dir, "app.json");
    writeFileSync(file, JSON.stringify({ Keep: "1", Drop: "2" }));

    const source = new JsonConfigurationSource(file);
    const provider = source.build({} as never);
    provider.load();
    expect(provider.tryGet("Keep")).toEqual([true, "1"]);
    expect(provider.tryGet("Drop")).toEqual([true, "2"]);

    writeFileSync(file, JSON.stringify({ Keep: "1" }));
    provider.load();

    expect(provider.tryGet("Keep")).toEqual([true, "1"]);
    // Without data.clear() on load, the removed key would linger.
    expect(provider.tryGet("Drop")).toEqual([false]);
  });

  test("malformed JSON error message includes the resolved path", () => {
    dir = mkdtempSync(join(tmpdir(), "rhombus-config-json-"));
    const file = join(dir, "bad.json");
    writeFileSync(file, "{ not valid json");

    const provider = new JsonConfigurationSource(file).build({} as never);
    expect(() => provider.load()).toThrow(new RegExp(file.replace(/[.\\]/g, "\\$&")));
  });
});
