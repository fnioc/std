// getDebugView over IConfigurationRoot: the indented tree rendering, the
// intermediate (no-value) node line, and the processValue override. Black-box
// through the public @rhombus-std/config surface.

import {
  ConfigurationBuilder,
  type ConfigurationDebugViewContext,
  getDebugView,
  type IConfigurationRoot,
} from "@rhombus-std/config";
import { describe, expect, test } from "bun:test";
import { rootOf } from "./support";

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
    // Leaves are indented two spaces under their parent and name their provider.
    expect(lines).toContain("  Host=localhost ([object Object])");
    expect(lines).toContain("  Port=8080 ([object Object])");
    // Trailing newline after the final line.
    expect(view.endsWith("\n")).toBe(true);
  });

  test("processValue can transform a leaf's rendered value and sees full context", () => {
    const seen: ConfigurationDebugViewContext[] = [];
    const view = getDebugView(tree(), (context) => {
      seen.push(context);
      return context.path === "ConnectionStrings:Default" ? "***" : (context.value ?? "");
    });

    expect(view).toContain("  Default=*** ([object Object])");
    expect(view).not.toContain("secret-value");

    // The callback receives path/key/value/provider for each leaf.
    const connection = seen.find((c) => c.path === "ConnectionStrings:Default");
    expect(connection).toBeDefined();
    expect(connection!.key).toBe("Default");
    expect(connection!.value).toBe("secret-value");
    expect(connection!.provider).toBeDefined();
  });

  test("an empty root renders as the empty string", () => {
    const root = new ConfigurationBuilder().build() as unknown as IConfigurationRoot;
    expect(getDebugView(root)).toBe("");
  });
});
