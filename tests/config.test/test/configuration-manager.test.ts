// ConfigurationManager -- the mutable, build-as-you-add configuration object.
// Verifies that it IS its own root (build() returns itself), that add() exposes
// values immediately with no separate build phase, last-source-wins on read,
// the stable reload token that survives a rebuild triggered by a later add(),
// and write-through via set(). Black-box through @rhombus-std/config.

import { ConfigurationManager, MemoryConfigurationSource } from "@rhombus-std/config";
import { ChangeToken } from "@rhombus-std/primitives";
import { describe, expect, test } from "bun:test";

/** A MemoryConfigurationSource seeded with `data`. */
function source(data: Record<string, string>): MemoryConfigurationSource {
  return new MemoryConfigurationSource({ initialData: data });
}

describe("ConfigurationManager", () => {
  test("build() returns the manager itself -- it IS the live root", () => {
    const manager = new ConfigurationManager();
    expect(manager.build()).toBe(manager);
  });

  test("starts with one seeded memory source, so set() succeeds before any add()", () => {
    // The constructor seeds an empty MemoryConfigurationSource via the normal
    // add() path (mirroring the reference constructor) -- without it, set()
    // throws "no configuration sources are registered".
    const manager = new ConfigurationManager();
    expect(manager.sources.length).toBe(1);

    manager.set("a", "b");
    expect(manager.get("a")).toBe("b");
  });

  test("add(source) exposes the new values immediately, with no separate build phase", () => {
    const manager = new ConfigurationManager();
    manager.add(source({ "Server:Port": "8080" }));

    expect(manager.get("Server:Port")).toBe("8080");
  });

  test("last-source-wins on read across two sources", () => {
    const manager = new ConfigurationManager();
    manager.add(source({ "Server:Port": "8080", "Server:Host": "localhost" }));
    manager.add(source({ "Server:Port": "9090" }));

    // The later source overrides Port; Host, defined only earlier, still resolves.
    expect(manager.get("Server:Port")).toBe("9090");
    expect(manager.get("Server:Host")).toBe("localhost");
  });

  test("set() survives a later add() -- existing providers are never rebuilt/reloaded", () => {
    // Regression (#80): add() must append only the new provider, not rebuild
    // the whole list. A rebuild would construct fresh provider instances and
    // silently discard the set() below, since set() state lives in the provider.
    const manager = new ConfigurationManager();
    manager.add(source({ "A": "1" }));
    manager.set("A", "mutated");

    manager.add(source({ "B": "2" }));

    expect(manager.get("A")).toBe("mutated");
    expect(manager.get("B")).toBe("2");
  });

  test("a reload callback registered BEFORE a later add() still fires (stable token across adds)", () => {
    const manager = new ConfigurationManager();
    manager.add(source({ "A": "1" }));

    let fired = 0;
    // onChange re-subscribes to whatever getReloadToken() currently returns; the
    // manager's token is stable across rebuilds, so the add() below is observed.
    using _registration = ChangeToken.onChange(() => manager.getReloadToken(), () => {
      fired++;
    });

    manager.add(source({ "B": "2" }));
    expect(fired).toBe(1);
  });

  test("set() writes through to the current providers", () => {
    const manager = new ConfigurationManager();
    manager.add(source({ "Server:Port": "8080" }));

    manager.set("Server:Port", "9090");
    expect(manager.get("Server:Port")).toBe("9090");
  });
});

describe("ConfigurationManager provider augmentations", () => {
  test("addInMemoryCollection installs on ConfigurationManager, not just ConfigurationBuilder", () => {
    const manager = new ConfigurationManager().addInMemoryCollection({ "Server:Port": "8080" });
    expect(manager.get("Server:Port")).toBe("8080");
  });

  test("addConfiguration installs on ConfigurationManager, not just ConfigurationBuilder", () => {
    const chained = new ConfigurationManager().addInMemoryCollection({ "Server:Port": "8080" });
    const manager = new ConfigurationManager().addConfiguration(chained);
    expect(manager.get("Server:Port")).toBe("8080");
  });
});
