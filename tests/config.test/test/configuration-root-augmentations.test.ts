// getDebugView over IConfigurationRoot (a member of ConfigurationRootExtensions):
// the indented tree rendering, the intermediate (no-value) node line, and the
// processValue override. Black-box through the public @rhombus-std/config
// surface via the standalone member form.

import {
  ConfigurationBuilder,
  type ConfigurationDebugViewContext,
  ConfigurationRootExtensions,
  type IConfigurationRoot,
} from "@rhombus-std/config";
import { describe, expect, test } from "bun:test";
import { rootOf } from "./support";

const { getDebugView } = ConfigurationRootExtensions;

describe("getDebugView", () => {
  function tree(): IConfigurationRoot {
    return rootOf({
      "Server:Host": "localhost",
      "Server:Port": "8080",
      "ConnectionStrings:Default": "secret-value",
    }) as IConfigurationRoot;
  }

  test("renders leaves as key=value (provider) and intermediate nodes as key:", () => {
    const view = getDebugView(tree());
    const lines = view.split("\n");

    // Intermediate section node -- has children, no own value.
    expect(lines).toContain("Server:");
    // Leaves are indented two spaces under their parent and name their
    // provider with its friendly (constructor-name) label.
    expect(lines).toContain("  Host=localhost (MemoryConfigurationProvider)");
    expect(lines).toContain("  Port=8080 (MemoryConfigurationProvider)");
    // Trailing newline after the final line.
    expect(view.endsWith("\n")).toBe(true);
  });

  test("processValue can transform a leaf's rendered value and sees full context", () => {
    const seen: ConfigurationDebugViewContext[] = [];
    const view = getDebugView(tree(), (context) => {
      seen.push(context);
      return context.path === "ConnectionStrings:Default" ? "***" : (context.value ?? "");
    });

    expect(view).toContain("  Default=*** (MemoryConfigurationProvider)");
    expect(view).not.toContain("secret-value");

    // The callback receives path/key/value/provider for each leaf.
    const connection = seen.find((c) => c.path === "ConnectionStrings:Default");
    expect(connection).toBeDefined();
    expect(connection!.key).toBe("Default");
    expect(connection!.value).toBe("secret-value");
    expect(connection!.provider).toBeDefined();
  });

  test("with two providers, the rendered value comes from the last (winning) provider", () => {
    // Both providers define Server:Port; getValueAndProvider scans providers in
    // reverse, so the debug view attributes the value to the last registration.
    const root = new ConfigurationBuilder()
      .addInMemoryCollection({ "Server:Port": "8080" })
      .addInMemoryCollection({ "Server:Port": "9090" })
      .build() as unknown as IConfigurationRoot;

    const view = getDebugView(root);
    expect(view).toContain("  Port=9090 (MemoryConfigurationProvider)");
    expect(view).not.toContain("8080");
  });

  test("an empty root renders as the empty string", () => {
    const root = new ConfigurationBuilder().build() as unknown as IConfigurationRoot;
    expect(getDebugView(root)).toBe("");
  });
});
