import { expect, test } from "bun:test";
import { LogLevel } from "../src/index";

test("entry point loads and exports the local logging stub", () => {
  expect(LogLevel.Information).toBeDefined();
  expect(LogLevel.Error).not.toBe(LogLevel.Warning);
});
