// Behaviour tests for registering a signature that quantifies holes of its own — an open callable
// address, closed positionally by a request for the instantiated shape.

import { ServiceProvider } from '@rhombus-std/di';
import { DefaultManifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const T = Type.generic('T');
const STRING = Type.global('string');
const whatever = (argument: Type) => Type.imported('Whatever', 'app', [argument]);

/** `<T>() => Whatever<T>` — the open callable a request closes. */
const OPEN = Type.func({ returnType: whatever(T), genericArgs: [T] });
/** `() => Whatever<string>` — the shape a caller asks for. */
const CLOSED = Type.func({ returnType: whatever(STRING) });

describe('a quantified signature as a service type', () => {
  test('a request for the instantiated shape resolves the open registration', () => {
    const made = () => 'made';
    const manifest = DefaultManifest.empty<string>().add(ServiceDescriptor.value(OPEN, made));
    const provider = new ServiceProvider(manifest);
    expect(provider.getService(CLOSED)).toBe(made);
  });

  test('quantifying a hole names a different type than merely mentioning one', () => {
    const mentions = Type.func({ returnType: whatever(T) });
    expect(mentions).not.toBe(OPEN);
    expect(Type.stringify(mentions)).toBe('() => app:Whatever<%T>');
    expect(Type.stringify(OPEN)).toBe('<%T>() => app:Whatever<%T>');
  });

  test('closing discharges the quantifier, landing on the requested type itself', () => {
    const [matched, generics] = Type.match(OPEN, CLOSED);
    expect(matched).toBe(true);
    expect(Type.substitute(OPEN, generics!)).toBe(CLOSED);
  });
});
