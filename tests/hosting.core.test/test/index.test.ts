import { LogLevel } from "@rhombus-std/hosting.core/internal/index";
import { expect, test } from "bun:test";

test("entry point loads and exports the local logging stub", () => {
  expect(LogLevel.Information).toBeDefined();
  expect(LogLevel.Error).not.toBe(LogLevel.Warning);
});
