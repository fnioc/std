import { DiError, EmptyServiceProvider, RESOLVER_TOKEN } from "@rhombus-std/di.core";
import { describe, expect, test } from "bun:test";

// `EmptyServiceProvider` — a null-object `ServiceProvider` with no application
// services. Every token is unregistered except the ONE intrinsic built-in, the
// provider itself.

const empty = EmptyServiceProvider.instance;

describe("EmptyServiceProvider", () => {
  test("Instance is a shared singleton", () => {
    expect(EmptyServiceProvider.instance).toBe(empty);
  });

  test("every application token is unregistered", () => {
    expect(empty.isService("pkg:anything")).toBe(false);
    expect(empty.tryResolve("pkg:anything")).toBeUndefined();
    expect(() => empty.resolve("pkg:anything")).toThrow(DiError);
  });

  test("the intrinsic provider token resolves to the provider itself", () => {
    expect(empty.isService(RESOLVER_TOKEN)).toBe(true);
    expect(empty.tryResolve(RESOLVER_TOKEN)).toBe(empty);
    expect(empty.resolve(RESOLVER_TOKEN)).toBe(empty);
  });

  test("resolveAsync rejects a miss and resolves the provider token", async () => {
    await expect(empty.resolveAsync("pkg:anything")).rejects.toThrow(DiError);
    await expect(empty.resolveAsync(RESOLVER_TOKEN)).resolves.toBe(empty);
  });

  test("resolveFactory throws — there is no target to build", () => {
    expect(() => empty.resolveFactory("pkg:anything")).toThrow(DiError);
  });

  test("createScope returns the same empty provider", () => {
    expect(empty.createScope()).toBe(empty);
    expect(empty.createScope("whatever")).toBe(empty);
  });

  test("name throws — the empty provider is frameless", () => {
    expect(() => empty.name).toThrow();
  });

  test("dispose and disposeAsync are no-ops", async () => {
    expect(() => empty.dispose()).not.toThrow();
    await expect(empty.disposeAsync()).resolves.toBeUndefined();
    // Still fully usable after disposal — it owns nothing.
    expect(empty.tryResolve(RESOLVER_TOKEN)).toBe(empty);
  });

  test("supports the native using / await using disposal protocols", async () => {
    expect(() => empty[Symbol.dispose]()).not.toThrow();
    await expect(empty[Symbol.asyncDispose]()).resolves.toBeUndefined();
  });
});
