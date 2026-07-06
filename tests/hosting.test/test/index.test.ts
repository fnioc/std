import { Host } from "@rhombus-std/hosting/internal/index";
import { expect, test } from "bun:test";

test("Host.createDefaultBuilder returns a builder stub", () => {
  const builder = Host.createDefaultBuilder();

  expect(builder.properties).toBeInstanceOf(Map);
  expect(() => builder.build()).toThrow("not implemented");
});
