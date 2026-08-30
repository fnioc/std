// Behaviour tests for the value-driven `resolve` overloads: hand it a `ConstructorType` or
// `FunctionType` node alongside the constructor/function it describes, and its dependencies
// resolve from the node's own parameter types. Nothing here is registered or cached — every call
// builds fresh.

import { di, noop } from '@rhombus-std/di';
import { type IServiceProvider, Manifest, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const Bar = Type.imported('Bar', 'app');
const Foo = Type.imported('Foo', 'app');
const Empty = Type.imported('Empty', 'app');
const Gadget = Type.imported('Gadget', 'app');

/** Seals `manifest` into a provider through the front door, on the noop lifetime model. */
function toProvider(manifest: Manifest<string>): IServiceProvider {
  return di.usingLifetimeModel(noop()).configureServices(m => m.add(manifest)).build();
}

function providerWithBar(bar: unknown): IServiceProvider {
  return toProvider(Manifest.empty<string>().addValue(Bar, bar));
}

describe('constructing from a ConstructorType node', () => {
  class Widget {
    constructor(readonly bar: unknown) {}
  }

  test('the node names the class its own dependencies resolve from', () => {
    const provider = providerWithBar('a bar');
    const widget = provider.resolve(Type.ctor(Foo, [[Bar]]), Widget);
    expect(widget).toBeInstanceOf(Widget);
    expect(widget.bar).toBe('a bar');
  });

  class EmptyCtor {}

  test('two calls never share a result, even for the same node and class', () => {
    const provider = providerWithBar('unused');
    const node = Type.ctor(Empty, [[]]);
    expect(provider.resolve(node, EmptyCtor)).not.toBe(provider.resolve(node, EmptyCtor));
  });
});

describe('calling from a FunctionType node', () => {
  function makeGadget(bar: unknown) {
    return { bar };
  }

  test('the node names the function its own dependencies resolve from', () => {
    const provider = providerWithBar('from a function');
    const result = provider.resolve(Type.func(Gadget, [[Bar]]), makeGadget);
    expect(result).toEqual({ bar: 'from a function' });
  });

  test('an arrow function works the same way', () => {
    const provider = providerWithBar('from an arrow');
    const arrow = (bar: unknown) => ({ bar });
    expect(provider.resolve(Type.func(Gadget, [[Bar]]), arrow)).toEqual({ bar: 'from an arrow' });
  });
});

describe('what the door does not do', () => {
  class Widget {
    constructor(readonly bar: unknown) {}
  }

  test('a dependency nothing registers throws rather than arriving undefined', () => {
    // Absence answers the one-argument lookup, which is a question about a
    // registration. Here the caller has already said what to build, so a
    // dependency it cannot reach is a broken graph.
    const provider = toProvider(Manifest.empty<string>());
    expect(() => provider.resolve(Type.ctor(Foo, [[Bar]]), Widget)).toThrow(UnsatisfiableError);
  });

  test('the node stays unregistered — a later lookup of it still finds nothing', () => {
    const provider = providerWithBar('a bar');
    const node = Type.ctor(Foo, [[Bar]]);
    provider.resolve(node, Widget);
    expect(() => provider.resolve(node)).toThrow(UnsatisfiableError);
  });
});
