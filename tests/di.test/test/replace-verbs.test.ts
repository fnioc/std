// Behaviour tests for `replace`. Replacing is a targeted override: it swaps the descriptor
// already holding the slot, in the slot it holds, and answers a no-match by changing nothing —
// so the descriptor-taking spelling and the uniform three-argument spelling agree.

import { ConstantType, DefaultManifest, type Manifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');

class Impl {}
class Other {}

/** The registered values, newest first — the order iterating a manifest yields. */
function values(manifest: Manifest<string>): unknown[] {
  return [...manifest].map(descriptor => descriptor.kind === 'value' ? descriptor.implementer : descriptor.kind);
}

describe('a no-match registers nothing', () => {
  test('a value replace on an empty manifest', () => {
    expect([...DefaultManifest.empty<string>().replace(A, 'a', ConstantType)]).toHaveLength(0);
  });

  test('a constructor replace on an empty manifest', () => {
    expect([...DefaultManifest.empty<string>().replace(A, Impl, Type.ctor(A, [[]]))]).toHaveLength(0);
  });

  test('a factory replace on an empty manifest', () => {
    expect([...DefaultManifest.empty<string>().replace(A, () => 'a', Type.func(A, [[]]))])
      .toHaveLength(0);
  });

  test('a manifest holding some OTHER service type is left alone', () => {
    const manifest = DefaultManifest.empty<string>().add(B, 'b', ConstantType);
    expect(values(manifest.replace(A, 'a', ConstantType))).toEqual(['b']);
  });

  test('a bare registration is not the slot a tagged replace targets', () => {
    const manifest = DefaultManifest.empty<string>().add(A, 'bare', ConstantType);
    expect(values(manifest.replace(Type.tag(A, 'primary'), 'keyed', ConstantType))).toEqual(['bare']);
  });
});

describe('a match is swapped in place', () => {
  test('the replacement keeps the position the old descriptor held', () => {
    const manifest = DefaultManifest.empty<string>()
      .add(A, 'a-old', ConstantType)
      .add(B, 'b', ConstantType);
    expect(values(manifest)).toEqual(['b', 'a-old']);
    expect(values(manifest.replace(A, 'a-new', ConstantType))).toEqual(['b', 'a-new']);
  });

  test('only the first registration of the service type is swapped', () => {
    const manifest = DefaultManifest.empty<string>()
      .add(A, 'a-older', ConstantType)
      .add(A, 'a-newer', ConstantType);
    expect(values(manifest.replace(A, 'a-new', ConstantType))).toEqual(['a-new', 'a-older']);
  });

  test('a constructor replace swaps the constructor a registration builds through', () => {
    const manifest = DefaultManifest.empty<string>()
      .add(A, Impl, Type.ctor(A, [[]]))
      .add(B, 'b', ConstantType);
    const replaced = [...manifest.replace(A, Other, Type.ctor(A, [[]]))];
    expect(replaced).toHaveLength(2);
    expect(replaced[1]!.kind === 'ctor' && replaced[1]!.implementer).toBe(Other);
  });

  test('a factory replace swaps the factory a registration builds through', () => {
    const manifest = DefaultManifest.empty<string>()
      .add(A, () => 'old', Type.func(A, [[]]))
      .add(B, 'b', ConstantType);
    const replaced = [...manifest.replace(A, () => 'new', Type.func(A, [[]]))];
    expect(replaced).toHaveLength(2);
    expect(replaced[1]!.kind === 'factory' && (replaced[1]!.implementer as () => string)()).toBe('new');
  });

  test('a tagged replace reaches the tagged slot without disturbing the bare one', () => {
    const manifest = DefaultManifest.empty<string>()
      .add(Type.tag(A, 'primary'), 'keyed-old', ConstantType)
      .add(A, 'bare', ConstantType);
    expect(values(manifest.replace(Type.tag(A, 'primary'), 'keyed-new', ConstantType))).toEqual(['bare', 'keyed-new']);
  });
});

describe('the two spellings of replace agree', () => {
  test('on a match', () => {
    const manifest = DefaultManifest.empty<string>()
      .add(A, 'a-old', ConstantType)
      .add(B, 'b', ConstantType);
    expect(values(manifest.replace(A, 'a-new', ConstantType)))
      .toEqual(values(manifest.replace(ServiceDescriptor.value(A, 'a-new'))));
  });

  test('on a no-match', () => {
    const manifest = DefaultManifest.empty<string>().add(B, 'b', ConstantType);
    expect(values(manifest.replace(A, 'a-new', ConstantType)))
      .toEqual(values(manifest.replace(ServiceDescriptor.value(A, 'a-new'))));
  });
});

describe('the string boundary', () => {
  test('Type.from names the same slot the Type does', () => {
    const manifest = DefaultManifest.empty<string>().add(A, 'a-old', ConstantType);
    expect(values(manifest.replace(Type.from('app:A'), 'a-new', ConstantType))).toEqual(['a-new']);
  });

  test('tagging a type that already carries a tag is a contradiction', () => {
    expect(() => Type.tag(Type.tag(A, 'primary'), 'secondary')).toThrow();
  });
});

describe('the receiver is untouched', () => {
  test('a discarded replace registers nothing', () => {
    const manifest = DefaultManifest.empty<string>().add(A, 'a-old', ConstantType);
    manifest.replace(A, 'a-new', ConstantType);
    expect(values(manifest)).toEqual(['a-old']);
  });
});
