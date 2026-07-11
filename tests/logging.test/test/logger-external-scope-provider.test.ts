// LoggerExternalScopeProvider — the ambient scope stack (black-box via the
// public @rhombus-std/logging surface).

import { LoggerExternalScopeProvider } from '@rhombus-std/logging';
import { describe, expect, test } from 'bun:test';

function snapshot(provider: LoggerExternalScopeProvider): unknown[] {
  const seen: unknown[] = [];
  provider.forEachScope((scope) => seen.push(scope), undefined);
  return seen;
}

describe('LoggerExternalScopeProvider', () => {
  test('forEachScope reports pushed scopes parent-first', () => {
    const provider = new LoggerExternalScopeProvider();
    using _outer = provider.push('outer');
    using _inner = provider.push('inner');
    expect(snapshot(provider)).toEqual(['outer', 'inner']);
  });

  test('disposing a scope restores its parent', () => {
    const provider = new LoggerExternalScopeProvider();
    const outer = provider.push('outer');
    const inner = provider.push('inner');

    inner[Symbol.dispose]();
    expect(snapshot(provider)).toEqual(['outer']);

    outer[Symbol.dispose]();
    expect(snapshot(provider)).toEqual([]);
  });

  test('passes the state argument through to the callback', () => {
    const provider = new LoggerExternalScopeProvider();
    using _scope = provider.push('x');
    const acc: string[] = [];
    provider.forEachScope((scope, state) => acc.push(`${state}:${scope}`), 'S');
    expect(acc).toEqual(['S:x']);
  });

  test('double-dispose is a no-op', () => {
    const provider = new LoggerExternalScopeProvider();
    const scope = provider.push('only');
    scope[Symbol.dispose]();
    scope[Symbol.dispose]();
    expect(snapshot(provider)).toEqual([]);
  });
});
