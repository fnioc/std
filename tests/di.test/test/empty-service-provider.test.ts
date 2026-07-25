import { DiError, EmptyServiceProvider, RESOLVER_TOKEN } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';

// `EmptyServiceProvider` — a null-object `IServiceProvider` with no application
// services. Every token is unregistered except the ONE intrinsic built-in, the
// provider itself.

const empty = EmptyServiceProvider.instance;

describe('EmptyServiceProvider', () => {
  test('Instance is a shared singleton', () => {
    expect(EmptyServiceProvider.instance).toBe(empty);
  });

  test('every application token is unregistered', () => {
    expect(empty.isService('pkg:anything')).toBe(false);
    expect(empty.tryResolve('pkg:anything')).toBeUndefined();
    expect(() => empty.resolve('pkg:anything')).toThrow(DiError);
  });

  test('the intrinsic provider token resolves to the provider itself', () => {
    expect(empty.isService(RESOLVER_TOKEN)).toBe(true);
    expect(empty.tryResolve(RESOLVER_TOKEN)).toBe(empty);
    expect(empty.resolve(RESOLVER_TOKEN)).toBe(empty);
  });

  test('the keyed PLURAL forms return [] — never a throw on count', () => {
    // `IRequiredResolver`'s contract: 0 matches yields `[]`. A provider with no
    // registrations has an empty key-space for every token, the provider token
    // included (a keyed scan is confined to its base's own key-space).
    expect(empty.resolve('pkg:anything', /.*/)).toEqual([]);
    expect(empty.tryResolve('pkg:anything', /.*/)).toEqual([]);
    expect(empty.resolve(RESOLVER_TOKEN, /.*/)).toEqual([]);
    expect(empty.tryResolve(RESOLVER_TOKEN, /.+/)).toEqual([]);
  });

  test('a keyed SINGULAR request misses, provider token included', () => {
    // A key composes an ORDINARY token, and every token but the bare intrinsic
    // provider is unregistered here.
    expect(empty.tryResolve('pkg:anything', 'k')).toBeUndefined();
    expect(empty.tryResolve(RESOLVER_TOKEN, 'k')).toBeUndefined();
    expect(() => empty.resolve(RESOLVER_TOKEN, 'k')).toThrow(DiError);
    // The empty key is the bare non-keyed token, so it still resolves.
    expect(empty.resolve(RESOLVER_TOKEN, '')).toBe(empty);
  });

  test('resolveAsync rejects a miss and resolves the provider token', async () => {
    await expect(empty.resolveAsync('pkg:anything')).rejects.toThrow(DiError);
    await expect(empty.resolveAsync(RESOLVER_TOKEN)).resolves.toBe(empty);
  });

  test('resolveFactory throws — there is no target to build', () => {
    expect(() => empty.resolveFactory('pkg:anything')).toThrow(DiError);
  });

  test('createScope returns the same empty provider', () => {
    expect(empty.createScope()).toBe(empty);
    expect(empty.createScope('whatever')).toBe(empty);
  });

  test('name throws — the empty provider is frameless', () => {
    expect(() => empty.name).toThrow();
  });

  test('dispose and disposeAsync are no-ops', async () => {
    expect(() => empty.dispose()).not.toThrow();
    await expect(empty.disposeAsync()).resolves.toBeUndefined();
    // Still fully usable after disposal — it owns nothing.
    expect(empty.tryResolve(RESOLVER_TOKEN)).toBe(empty);
  });

  test('supports the native using / await using disposal protocols', async () => {
    expect(() => empty[Symbol.dispose]()).not.toThrow();
    await expect(empty[Symbol.asyncDispose]()).resolves.toBeUndefined();
  });
});
