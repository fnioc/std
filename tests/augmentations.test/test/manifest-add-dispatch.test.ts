// Loading `di.extras` beside `di.core` must not change what an explicit, address-first `add` does.
// The sugar rows are inline bodies, substituted at a call site during the build, so the package
// installs no runtime member of its own — these tests are the runtime proof of that, exercised
// through the hand-written forms a no-transformer consumer writes.

import '@rhombus-std/di.extras';
import { Manifest, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const CLOCK = Type.imported('IClock', 'app');
const STORE = Type.imported('IStore', 'app');

class Clock {}

/** What each registration in `manifest` holds, newest first. */
function valuesOf(manifest: Manifest<string>): unknown[] {
  return [...manifest].map(registration => 'value' in registration ? registration.value : undefined);
}

describe('the explicit add shapes with di.extras loaded', () => {
  test('add(registration) files the one registration', () => {
    const manifest = Manifest.empty<string>().add(Registration.value(CLOCK, 'ticking'));
    expect([...manifest]).toHaveLength(1);
    expect([...manifest][0]!.address).toBe(CLOCK);
    expect(valuesOf(manifest)).toEqual(['ticking']);
  });

  test('add(registrations) files each in turn, the last one newest', () => {
    const manifest = Manifest.empty<string>().add([
      Registration.value(CLOCK, 'first'),
      Registration.value(CLOCK, 'second'),
    ]);
    expect(valuesOf(manifest)).toEqual(['second', 'first']);
  });

  test('add(address, value) registers the value as it stands', () => {
    const manifest = Manifest.empty<string>().add(CLOCK, new Clock());
    expect(valuesOf(manifest)[0]).toBeInstanceOf(Clock);
  });

  test('import(manifest) merges as one batch, in the imported order', () => {
    const feature = Manifest.empty<string>()
      .add(Registration.value(CLOCK, 'clock'))
      .add(Registration.value(STORE, 'store'));
    const merged = Manifest.empty<string>().add(Registration.value(CLOCK, 'own')).import(feature);
    expect(valuesOf(merged)).toEqual(['store', 'clock', 'own']);
  });
});
