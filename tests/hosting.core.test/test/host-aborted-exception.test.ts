import { HostAbortedException } from "@rhombus-std/hosting.core/internal/index";
import { expect, test } from "bun:test";

test("HostAbortedException() uses the system-supplied message", () => {
  const error = new HostAbortedException();
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe("HostAbortedException");
  expect(error.message).toBe("The host was aborted.");
  expect(error.cause).toBeUndefined();
});

test("HostAbortedException(message) uses the supplied message", () => {
  const error = new HostAbortedException("shutting down");
  expect(error.message).toBe("shutting down");
  expect(error.cause).toBeUndefined();
});

test("HostAbortedException(message, innerException) wraps the inner error as the cause", () => {
  const inner = new Error("root cause");
  const error = new HostAbortedException("shutting down", inner);
  expect(error.message).toBe("shutting down");
  expect(error.cause).toBe(inner);
});

test("HostAbortedException(undefined, innerException) still falls back to the default message", () => {
  const inner = new Error("root cause");
  const error = new HostAbortedException(undefined, inner);
  expect(error.message).toBe("The host was aborted.");
  expect(error.cause).toBe(inner);
});
