// Behaviour tests for the value-driven `getService` overloads: hand it a `ConstructorType` or
// `FunctionType` node alongside the constructor/function it describes, and its dependencies
// resolve from the node's own parameter types. Nothing here is registered or cached — every call
// builds fresh.

import { ServiceProvider } from '@rhombus-std/di';
import { DefaultManifest } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const Bar = Type.imported('Bar', 'app');
const Foo = Type.imported('Foo', 'app');
const Empty = Type.imported('Empty', 'app');
const Gadget = Type.imported('Gadget', 'app');

function providerWithBar(bar: unknown): ServiceProvider {
  return new ServiceProvider(DefaultManifest.empty<string>().addValue(Bar, bar));
}

describe('constructing from a ConstructorType node', () => {
  class Widget {
    constructor(readonly bar: unknown) {}
  }

  test('the node names the class its own dependencies resolve from', () => {
    const provider = providerWithBar('a bar');
    const widget = provider.getService(Type.ctor(Foo, Bar), Widget);
    expect(widget).toBeInstanceOf(Widget);
    expect(widget.bar).toBe('a bar');
  });

  class EmptyCtor {}

  test('two calls never share a result, even for the same node and class', () => {
    const provider = providerWithBar('unused');
    const node = Type.ctor(Empty);
    expect(provider.getService(node, EmptyCtor)).not.toBe(provider.getService(node, EmptyCtor));
  });
});

describe('calling from a FunctionType node', () => {
  function makeGadget(bar: unknown) {
    return { bar };
  }

  test('the node names the function its own dependencies resolve from', () => {
    const provider = providerWithBar('from a function');
    const result = provider.getService(Type.func(Gadget, Bar), makeGadget);
    expect(result).toEqual({ bar: 'from a function' });
  });

  test('an arrow function works the same way', () => {
    const provider = providerWithBar('from an arrow');
    const arrow = (bar: unknown) => ({ bar });
    expect(provider.getService(Type.func(Gadget, Bar), arrow)).toEqual({ bar: 'from an arrow' });
  });
});
