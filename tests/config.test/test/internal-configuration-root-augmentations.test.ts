// InternalConfigurationRootExtensions -- the INTERNAL child-enumeration
// helper (port of the reference internal static class of the same name).
// White-box via the internal/* subpath: the const is intra-package surface,
// deliberately NOT re-exported from the barrel and never installed on a
// prototype, so the standalone member form is its only call shape.

import * as configBarrel from "@rhombus-std/config";
import { InternalConfigurationRootExtensions } from "@rhombus-std/config/internal/internal-configuration-root-augmentations";
import { describe, expect, test } from "bun:test";
import { rootOf } from "./support";

describe("InternalConfigurationRootExtensions.getChildrenImplementation", () => {
  test("undefined path enumerates the root's immediate children", () => {
    const root = rootOf({ "Server:Host": "localhost", "Server:Port": "8080", "Mode": "dev" });

    const keys = InternalConfigurationRootExtensions.getChildrenImplementation(root, undefined)
      .map((section) => section.key)
      .sort();

    expect(keys).toEqual(["Mode", "Server"]);
  });

  test("a path enumerates that section's children with full combined paths", () => {
    const root = rootOf({ "Server:Host": "localhost", "Server:Port": "8080" });

    const children = InternalConfigurationRootExtensions.getChildrenImplementation(root, "Server");

    expect(children.map((section) => section.path).sort()).toEqual(["Server:Host", "Server:Port"]);
    expect(children.map((section) => section.key).sort()).toEqual(["Host", "Port"]);
  });

  test("dedups keys ordinal-ignore-case across providers -- one section per case-folded key", () => {
    const root = new configBarrel.ConfigurationBuilder()
      .addInMemoryCollection({ "Server:Host": "a" })
      .addInMemoryCollection({ "SERVER:Port": "1" })
      .build() as unknown as configBarrel.IConfigurationRoot;

    const keys = InternalConfigurationRootExtensions.getChildrenImplementation(root, undefined)
      .map((section) => section.key);

    // Exactly one section survives for the two case-variant spellings; which
    // spelling wins is the fold order after the last provider's sort, not part
    // of the contract.
    expect(keys.map((key) => key.toLowerCase())).toEqual(["server"]);
  });

  test("is not re-exported from the package barrel", () => {
    expect("InternalConfigurationRootExtensions" in configBarrel).toBe(false);
  });
});
