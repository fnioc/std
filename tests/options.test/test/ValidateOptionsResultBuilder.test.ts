// Behavior tests for ValidateOptionsResultBuilder (public surface): accumulate
// failures from errors and prior results, then fold them into one
// ValidateOptionsResult.

import { ValidateOptionsResult, ValidateOptionsResultBuilder } from "@rhombus-std/options";
import { describe, expect, test } from "bun:test";

describe("ValidateOptionsResultBuilder", () => {
  test("empty builder builds success", () => {
    const builder = new ValidateOptionsResultBuilder();

    const result = builder.build();

    expect(result).toBe(ValidateOptionsResult.success);
    expect(result.succeeded).toBe(true);
    expect(result.failed).toBe(false);
  });

  test("addError without a property name records the message verbatim", () => {
    const builder = new ValidateOptionsResultBuilder();

    builder.addError("port must be positive");

    const result = builder.build();
    expect(result.failed).toBe(true);
    expect(result.failures).toEqual(["port must be positive"]);
  });

  test("addError with a property name prefixes it", () => {
    const builder = new ValidateOptionsResultBuilder();

    builder.addError("must be positive", "port");

    expect(builder.build().failures).toEqual(["Property port: must be positive"]);
  });

  test("accumulates several errors into one failed result", () => {
    const builder = new ValidateOptionsResultBuilder();

    builder.addError("first");
    builder.addError("second", "host");

    const result = builder.build();
    expect(result.failed).toBe(true);
    expect(result.failures).toEqual(["first", "Property host: second"]);
    expect(result.failureMessage).toBe("first; Property host: second");
  });

  test("addResult appends each failure of a failed result separately", () => {
    const builder = new ValidateOptionsResultBuilder();

    builder.addResult(ValidateOptionsResult.fail(["a", "b"]));

    expect(builder.build().failures).toEqual(["a", "b"]);
  });

  test("addResult ignores a succeeded or skipped result", () => {
    const builder = new ValidateOptionsResultBuilder();

    builder.addResult(ValidateOptionsResult.success);
    builder.addResult(ValidateOptionsResult.skip);

    expect(builder.build()).toBe(ValidateOptionsResult.success);
  });

  test("addResults folds every result's failures in", () => {
    const builder = new ValidateOptionsResultBuilder();

    builder.addResults([
      ValidateOptionsResult.fail("one"),
      ValidateOptionsResult.success,
      ValidateOptionsResult.fail(["two", "three"]),
    ]);

    expect(builder.build().failures).toEqual(["one", "two", "three"]);
  });

  test("clear resets to the empty state", () => {
    const builder = new ValidateOptionsResultBuilder();

    builder.addError("stale");
    builder.clear();

    expect(builder.build()).toBe(ValidateOptionsResult.success);
  });

  test("errors added after clear build a fresh failure", () => {
    const builder = new ValidateOptionsResultBuilder();

    builder.addError("stale");
    builder.clear();
    builder.addError("fresh");

    expect(builder.build().failures).toEqual(["fresh"]);
  });
});
