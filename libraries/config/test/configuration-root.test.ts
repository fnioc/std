// ConfigurationRoot -- the provider-list engine. Every assertion here targets
// behavior the pre-rewrite single-Map ConfigurationRoot could NOT exhibit:
// reverse-order (last-registered-wins) LAZY read resolution across a provider
// list, set() fanning out to EVERY provider, getSection always returning a
// (possibly empty) section, and getChildren dedup + numeric ordering at the
// root.

import { ConfigurationBuilder, type IConfigurationProvider, type IConfigurationRoot } from "@rhombus-std/config";
import { describe, expect, test } from "bun:test";
import { rootOf } from "./support";

/** Builds a root over N in-memory providers, one per data record (registration order). */
function rootOfLayers(...layers: Record<string, string>[]): IConfigurationRoot {
  let builder = new ConfigurationBuilder();
  for (const layer of layers) {
    builder = builder.addInMemoryCollection(layer);
  }
  return builder.build() as unknown as IConfigurationRoot;
}

describe("ConfigurationRoot.get (reverse-order precedence)", () => {
  test("the LAST-registered provider to define a key wins", () => {
    // Two providers both define Server:Port. get() iterates providers in
    // reverse, so the later registration (9090) wins over the earlier (8080).
    const root = rootOfLayers({ "Server:Port": "8080" }, { "Server:Port": "9090" });

    expect(root.get("Server:Port")).toBe("9090");
  });

  test("a key defined only by an earlier provider still resolves (no eager overwrite)", () => {
    const root = rootOfLayers(
      { "Server:Host": "localhost", "Server:Port": "8080" },
      { "Server:Port": "9090" },
    );

    // Host lives only in the first provider; reverse iteration falls through
    // the second provider's miss and finds it. Precedence is resolved lazily
    // per lookup, not by pre-merging into one map.
    expect(root.get("Server:Host")).toBe("localhost");
    expect(root.get("Server:Port")).toBe("9090");
  });

  test("returns undefined when no provider has the key", () => {
    const root = rootOf({ "Server:Port": "8080" });
    expect(root.get("Server:Missing")).toBeUndefined();
  });

  test("a section prefix is not itself a gettable leaf key", () => {
    const root = rootOf({ "Database:Primary:Host": "db.internal" });
    expect(root.get("Database:Primary")).toBeUndefined();
  });
});

describe("ConfigurationRoot.set (writes to every provider)", () => {
  test("set() fans the write out to ALL providers, not just one", () => {
    const root = rootOfLayers({ "A": "1" }, { "B": "2" });

    root.set("Shared:Key", "value");

    const providers = [...root.providers] as IConfigurationProvider[];
    expect(providers.length).toBe(2);
    for (const provider of providers) {
      expect(provider.tryGet("Shared:Key")).toEqual([true, "value"]);
    }
  });

  test("throws when there are no providers -- nowhere to store the value", () => {
    const root = new ConfigurationBuilder().build();
    expect(() => root.set("Any:Key", "value")).toThrow();
  });
});

describe("ConfigurationRoot.getSection (always returns, never null)", () => {
  test("returns a usable section even for a path no provider defines", () => {
    const root = rootOf({ "Server:Port": "8080" });

    const missing = root.getSection("Nope");
    expect(missing.value).toBeUndefined();
    expect([...missing.getChildren()]).toEqual([]);
    expect(missing.get("Anything")).toBeUndefined();
  });
});

describe("ConfigurationRoot.getChildren (root-level dedup + ordering)", () => {
  test("dedups a section key that appears across multiple providers (ordinal-ignore-case)", () => {
    const root = rootOfLayers(
      { "Server:Port": "8080" },
      { "server:host": "localhost" },
    );

    // Both providers contribute a top-level "Server"/"server" key; the root
    // dedups them ordinal-ignore-case into a single child section.
    const children = [...root.getChildren()];
    expect(children.length).toBe(1);
    expect(children[0]!.key.toLowerCase()).toBe("server");
  });

  test("orders numeric child keys naturally (0,1,2,...,9,10), not lexicographically", () => {
    const root = rootOf({
      "items:0": "a",
      "items:1": "b",
      "items:2": "c",
      "items:10": "d",
    });

    const indices = [...root.getSection("items").getChildren()].map((section) => section.key);
    expect(indices).toEqual(["0", "1", "2", "10"]);
  });
});
