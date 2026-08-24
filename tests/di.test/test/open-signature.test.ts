// Behaviour tests for a signature carrying a generic hole in its return type — an open callable
// address, closed positionally by a request for the instantiated shape.

import { ServiceProvider } from '@rhombus-std/di';
import { DefaultManifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const T = Type.generic('T');
const STRING = Type.global('string');
const whatever = (argument: Type) => Type.imported('Whatever', 'app', [argument]);

/** `() => app:Whatever<%T>` — the open callable a request closes. */
const OPEN = Type.func({ return: whatever(T), args: [[]] });
/** `() => app:Whatever<string>` — the shape a caller asks for. */
const CLOSED = Type.func({ return: whatever(STRING), args: [[]] });

describe('an open signature as a service type', () => {
  test('a request for the instantiated shape resolves the open registration', () => {
    const made = () => 'made';
    const manifest = DefaultManifest.empty<string>().add(ServiceDescriptor.value(OPEN, made));
    const provider = new ServiceProvider(manifest);
    expect(provider.resolve(CLOSED)).toBe(made);
  });

  test('closing discharges the hole, landing on the requested type itself', () => {
    const [matched, generics] = Type.match(OPEN, CLOSED);
    expect(matched).toBe(true);
    expect(Type.substitute(OPEN, generics!)).toBe(CLOSED);
  });
});
