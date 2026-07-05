import { expect, test } from "bun:test";
import { Host } from "../src/index";

test("Host.createDefaultBuilder returns a builder stub", () => {
  const builder = Host.createDefaultBuilder();

  expect(builder.properties).toBeInstanceOf(Map);
  expect(() => builder.build()).toThrow("not implemented");
});
