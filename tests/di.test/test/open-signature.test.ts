// Behaviour tests for a signature carrying a generic hole in its return type — an open callable
// address, closed positionally by a request for the instantiated shape.

import { Builder } from '@rhombus-std/di';
import { Manifest, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** Seals `manifest` into a provider with no lifetime model: every ask constructs afresh. */
function toProvider(manifest: Manifest<string>) {
  return Builder.withServices(() => manifest).build();
}

const T = Type.generic('T');
const STRING = Type.global('string');
const whatever = (argument: Type) => Type.imported('Whatever', 'app', [argument]);

/** `() => app:Whatever<%T>` — the open callable a request closes. */
const OPEN = Type.func({ return: whatever(T), signatures: [[]] });
/** `() => app:Whatever<string>` — the shape a caller asks for. */
const CLOSED = Type.func({ return: whatever(STRING), signatures: [[]] });

describe('an open signature as a service type', () => {
  test('a request for the instantiated shape resolves the open registration', () => {
    const made = () => 'made';
    const manifest = Manifest.empty<string>().add(Registration.value(OPEN, made));
    const provider = toProvider(manifest);
    expect(provider.resolve(CLOSED)).toBe(made);
  });

  test('closing discharges the hole, landing on the requested type itself', () => {
    const [matched, generics] = Type.bindGenerics(OPEN, CLOSED);
    expect(matched).toBe(true);
    expect(Type.substitute(OPEN, generics!)).toBe(CLOSED);
  });
});
