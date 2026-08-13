// Behaviour tests for the value-driven `getService` overloads: hand it a constructor or a
// function and it comes back with a live provider as its one argument, so it can pull whatever
// it depends on itself. Nothing here is registered or cached — every call builds fresh.

import { ServiceProvider } from '@rhombus-std/di';
import { DefaultManifest } from '@rhombus-std/di.core';
import { IServiceProvider, Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const Bar = Type.named('Bar', 'app');

function providerWithBar(bar: unknown): ServiceProvider {
  return new ServiceProvider(DefaultManifest.empty<string>().addValue(Bar, bar));
}

describe('constructing a value-driven class', () => {
  class Foo {
    readonly bar: unknown;
    constructor(provider: IServiceProvider) {
      this.bar = provider.getRequiredService(Bar);
    }
  }

  test('the provider it receives resolves its own dependencies', () => {
    const provider = providerWithBar('a bar');
    const foo = provider.getService(Foo);
    expect(foo).toBeInstanceOf(Foo);
    expect(foo.bar).toBe('a bar');
  });

  test('two calls never share a result, even for the same class', () => {
    const provider = providerWithBar('a bar');
    expect(provider.getService(Foo)).not.toBe(provider.getService(Foo));
  });
});

describe('calling a value-driven function', () => {
  test('an ordinary function receives the provider and pulls its own deps', () => {
    const provider = providerWithBar('from a function');
    function makeFoo(sp: IServiceProvider) {
      return { bar: sp.getRequiredService(Bar) };
    }
    expect(provider.getService(makeFoo)).toEqual({ bar: 'from a function' });
  });

  test('an arrow function receives the provider and pulls its own deps', () => {
    const provider = providerWithBar('from an arrow');
    const makeFoo = (sp: IServiceProvider) => ({ bar: sp.getRequiredService(Bar) });
    expect(provider.getService(makeFoo)).toEqual({ bar: 'from an arrow' });
  });
});

describe('a new.target-guarded function constructor', () => {
  // Written as a plain `function`, not `class` — the guard is what actually enforces `new`.
  function GuardedFoo(this: { bar: unknown; }, provider: IServiceProvider) {
    if (!new.target) {
      throw new TypeError('GuardedFoo: this constructor must be called with new.');
    }
    this.bar = provider.getRequiredService(Bar);
  }

  test('the call attempt is rescued into a construct', () => {
    const provider = providerWithBar('rescued');
    const foo = provider.getService(GuardedFoo as unknown as new(sp: IServiceProvider) => { bar: unknown; });
    expect(foo).toBeInstanceOf(GuardedFoo);
    expect(foo.bar).toBe('rescued');
  });
});

describe('a non-function value', () => {
  test('throws TypeError instead of reaching the resolution engine', () => {
    const provider = providerWithBar('unused');
    expect(() => provider.getService(42 as unknown as new() => unknown)).toThrow(TypeError);
    expect(() => provider.getService(null as unknown as new() => unknown)).toThrow(TypeError);
    expect(() => provider.getService(undefined as unknown as new() => unknown))
      .toThrow(TypeError);
  });
});
