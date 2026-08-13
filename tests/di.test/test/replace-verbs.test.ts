// Behaviour tests for the `replace*` verb family. Replacing is a targeted override: it swaps the
// descriptor already holding the slot, in the slot it holds, and answers a no-match by changing
// nothing — so the descriptor-taking spelling and the typed convenience spellings agree.

import { DefaultManifest, type Manifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');

class Impl {}
class Other {}

/** The registered values, newest first — the order iterating a manifest yields. */
function values(manifest: Manifest<string>): unknown[] {
  return [...manifest].map(descriptor => descriptor.kind === 'value' ? descriptor.value : descriptor.kind);
}

describe('a no-match registers nothing', () => {
  test('replaceValue on an empty manifest', () => {
    expect([...DefaultManifest.empty<string>().replaceValue(A, 'a')]).toHaveLength(0);
  });

  test('replaceClass on an empty manifest', () => {
    expect([...DefaultManifest.empty<string>().replaceClass(A, Impl, Type.ctor(A), undefined)]).toHaveLength(0);
  });

  test('replaceFactory on an empty manifest', () => {
    expect([...DefaultManifest.empty<string>().replaceFactory(A, () => 'a', Type.func(A), undefined)])
      .toHaveLength(0);
  });

  test('a manifest holding some OTHER service type is left alone', () => {
    const manifest = DefaultManifest.empty<string>().addValue(B, 'b');
    expect(values(manifest.replaceValue(A, 'a'))).toEqual(['b']);
  });

  test('a bare registration is not the slot a keyed replace targets', () => {
    const manifest = DefaultManifest.empty<string>().addValue(A, 'bare');
    expect(values(manifest.replaceValue(A, 'keyed', 'primary'))).toEqual(['bare']);
  });
});

describe('a match is swapped in place', () => {
  test('the replacement keeps the position the old descriptor held', () => {
    const manifest = DefaultManifest.empty<string>()
      .addValue(A, 'a-old')
      .addValue(B, 'b');
    expect(values(manifest)).toEqual(['b', 'a-old']);
    expect(values(manifest.replaceValue(A, 'a-new'))).toEqual(['b', 'a-new']);
  });

  test('only the first registration of the service type is swapped', () => {
    const manifest = DefaultManifest.empty<string>()
      .addValue(A, 'a-older')
      .addValue(A, 'a-newer');
    expect(values(manifest.replaceValue(A, 'a-new'))).toEqual(['a-new', 'a-older']);
  });

  test('replaceClass swaps the constructor a registration builds through', () => {
    const manifest = DefaultManifest.empty<string>()
      .addClass(A, Impl, Type.ctor(A))
      .addValue(B, 'b');
    const replaced = [...manifest.replaceClass(A, Other, Type.ctor(A), undefined)];
    expect(replaced).toHaveLength(2);
    expect(replaced[1]!.kind === 'ctor' && replaced[1]!.ctor).toBe(Other);
  });

  test('replaceFactory swaps the factory a registration builds through', () => {
    const manifest = DefaultManifest.empty<string>()
      .addFactory(A, () => 'old', Type.func(A))
      .addValue(B, 'b');
    const replaced = [...manifest.replaceFactory(A, () => 'new', Type.func(A), undefined)];
    expect(replaced).toHaveLength(2);
    expect(replaced[1]!.kind === 'factory' && replaced[1]!.factory()).toBe('new');
  });

  test('a keyed replace reaches the tagged slot without disturbing the bare one', () => {
    const manifest = DefaultManifest.empty<string>()
      .addValue(Type.tag(A, 'primary'), 'keyed-old')
      .addValue(A, 'bare');
    expect(values(manifest.replaceValue(A, 'keyed-new', 'primary'))).toEqual(['bare', 'keyed-new']);
  });
});

describe('the two spellings of replace agree', () => {
  test('on a match', () => {
    const manifest = DefaultManifest.empty<string>()
      .addValue(A, 'a-old')
      .addValue(B, 'b');
    expect(values(manifest.replaceValue(A, 'a-new')))
      .toEqual(values(manifest.replace(ServiceDescriptor.value(A, 'a-new'))));
  });

  test('on a no-match', () => {
    const manifest = DefaultManifest.empty<string>().addValue(B, 'b');
    expect(values(manifest.replaceValue(A, 'a-new')))
      .toEqual(values(manifest.replace(ServiceDescriptor.value(A, 'a-new'))));
  });
});

describe('the token door', () => {
  test('a string names the same slot the Type does', () => {
    const manifest = DefaultManifest.empty<string>().addValue(A, 'a-old');
    expect(values(manifest.replaceValue('app:A', 'a-new'))).toEqual(['a-new']);
  });

  test('a tagged type plus a key is a contradiction', () => {
    const manifest = DefaultManifest.empty<string>().addValue(Type.tag(A, 'primary'), 'a');
    expect(() => manifest.replaceValue(Type.tag(A, 'primary'), 'a-new', 'primary')).toThrow();
  });
});

describe('the receiver is untouched', () => {
  test('a discarded replace registers nothing', () => {
    const manifest = DefaultManifest.empty<string>().addValue(A, 'a-old');
    manifest.replaceValue(A, 'a-new');
    expect(values(manifest)).toEqual(['a-old']);
  });
});
