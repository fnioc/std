// Behavior tests for CancellationChangeToken -- backed by AbortSignal rather
// than .NET's CancellationToken (see src/cancellation-change-token.ts).

import { CancellationChangeToken } from "@rhombus-std/primitives/internal/cancellation-change-token";
import { describe, expect, test } from "bun:test";

describe("CancellationChangeToken", () => {
  test("hasChanged reflects signal.aborted", () => {
    const controller = new AbortController();
    const token = new CancellationChangeToken(controller.signal);

    expect(token.hasChanged).toBe(false);
    controller.abort();
    expect(token.hasChanged).toBe(true);
  });

  test("activeChangeCallbacks is always true", () => {
    const token = new CancellationChangeToken(new AbortController().signal);
    expect(token.activeChangeCallbacks).toBe(true);
  });

  test("registerChangeCallback fires on abort and passes state through", () => {
    const controller = new AbortController();
    const token = new CancellationChangeToken(controller.signal);

    let seen: string | undefined;
    token.registerChangeCallback((state) => {
      seen = state as string;
    }, "payload");

    expect(seen).toBeUndefined();
    controller.abort();
    expect(seen).toBe("payload");
  });

  test("registerChangeCallback fires synchronously if already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    const token = new CancellationChangeToken(controller.signal);

    let called = false;
    token.registerChangeCallback(() => {
      called = true;
    });

    expect(called).toBe(true);
  });

  test("disposing the registration removes the listener before abort fires", () => {
    const controller = new AbortController();
    const token = new CancellationChangeToken(controller.signal);

    let called = false;
    const registration = token.registerChangeCallback(() => {
      called = true;
    });
    registration[Symbol.dispose]();
    controller.abort();

    expect(called).toBe(false);
  });
});
