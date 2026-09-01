// Behaviour tests for how the engine settles a structural object dependency: a registration for
// the object type itself answers ahead of everything else, and otherwise the shape is built from
// its own properties — all of them or none, so a single unresolvable property leaves the whole
// object unsatisfiable rather than half-built.

import { di, noopLifetimeAddon } from '@rhombus-std/di';
import { Manifest, Registration, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** Seals `manifest` into a provider through the front door, on the noop lifetime model. */
function toProvider(manifest: Manifest<string>) {
  return di.usingLifetimeModel(noopLifetimeAddon()).configureServices(m => m.add(manifest)).build();
}

const CACHE = Type.imported('Cache', 'app');
const CLOCK = Type.imported('Clock', 'app');
const MISSING = Type.imported('Missing', 'app');

class MemoryCache {}
class SystemClock {}

/** A manifest registering whichever of the leaf services are named. */
function manifestWith(...services: readonly ('cache' | 'clock')[]) {
  let manifest = Manifest.empty<string>();
  for (const service of services) {
    manifest = service === 'cache'
      ? manifest.add(Registration.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]]), 'singleton'))
      : manifest.add(Registration.ctor(CLOCK, SystemClock, Type.ctor(CLOCK, [[]]), 'singleton'));
  }
  return manifest;
}

describe('structural object resolution', () => {
  test('builds an unregistered shape from its properties', () => {
    const provider = toProvider(manifestWith('cache', 'clock'));

    const built = provider.getService(Type.object({ cache: CACHE, clock: CLOCK })) as Record<string, unknown>;

    expect(built.cache).toBeInstanceOf(MemoryCache);
    expect(built.clock).toBeInstanceOf(SystemClock);
  });

  test('refuses the whole shape when one property is unresolvable', () => {
    const provider = toProvider(manifestWith('cache'));

    expect(() => provider.getService(Type.object({ cache: CACHE, missing: MISSING }))).toThrow(UnsatisfiableError);
  });

  test('nests, so a property that is itself a shape is built too', () => {
    const provider = toProvider(manifestWith('cache', 'clock'));

    const built = provider.getService(Type.object({ clock: CLOCK, inner: Type.object({ cache: CACHE }) })) as Record<string, any>;

    expect(built.clock).toBeInstanceOf(SystemClock);
    expect(built.inner.cache).toBeInstanceOf(MemoryCache);
  });

  test('an optional property falls back to undefined instead of failing the shape', () => {
    const provider = toProvider(manifestWith('clock'));
    const optionalCache = Type.union(CACHE, Type.typeLiteral(undefined));

    const built = provider.getService(Type.object({ cache: optionalCache, clock: CLOCK })) as Record<string, unknown>;

    expect(built.clock).toBeInstanceOf(SystemClock);
    expect(built.cache).toBeUndefined();
  });

  test('a registration for the shape itself answers ahead of building one', () => {
    const shape = Type.object({ cache: CACHE });
    const registered = { cache: 'from the manifest' };
    const provider = toProvider(manifestWith('cache').add(Registration.value(shape, registered)));

    expect(provider.getService(shape)).toBe(registered);
  });
});
