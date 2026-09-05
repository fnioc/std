// Behaviour tests for `replace`. Replacing is a targeted override: it swaps the registration
// already holding the slot, in the slot it holds, and answers a no-match by changing nothing —
// so the registration-taking spelling and the uniform three-argument spelling agree.

import { Manifest, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');

class Impl {}
class Other {}

/** The registered values, newest first — the order iterating a manifest yields. */
function values(manifest: Manifest<unknown>): unknown[] {
  return [...manifest].map(registration => 'value' in registration ? registration.value : Registration.kind(registration)[0]);
}

describe('a no-match registers nothing', () => {
  test('a value replace on an empty manifest', () => {
    expect([...Manifest.empty<unknown>().replaceValue(A, 'a')]).toHaveLength(0);
  });

  test('a constructor replace on an empty manifest', () => {
    expect([...Manifest.empty<unknown>().replace(A, Impl, Type.ctor(A, [[]]))]).toHaveLength(0);
  });

  test('a factory replace on an empty manifest', () => {
    expect([...Manifest.empty<unknown>().replace(A, () => 'a', Type.func(A, [[]]))])
      .toHaveLength(0);
  });

  test('a manifest holding some OTHER service type is left alone', () => {
    const manifest = Manifest.empty<unknown>().addValue(B, 'b');
    expect(values(manifest.replaceValue(A, 'a'))).toEqual(['b']);
  });

  test('a bare registration is not the slot a tagged replace targets', () => {
    const manifest = Manifest.empty<unknown>().addValue(A, 'bare');
    expect(values(manifest.replaceValue(Type.tag(A, 'primary'), 'keyed'))).toEqual(['bare']);
  });
});

describe('a match is swapped in place', () => {
  test('the replacement keeps the position the old registration held', () => {
    const manifest = Manifest.empty<unknown>()
      .addValue(A, 'a-old')
      .addValue(B, 'b');
    expect(values(manifest)).toEqual(['b', 'a-old']);
    expect(values(manifest.replaceValue(A, 'a-new'))).toEqual(['b', 'a-new']);
  });

  test('only the first registration of the service type is swapped', () => {
    const manifest = Manifest.empty<unknown>()
      .addValue(A, 'a-older')
      .addValue(A, 'a-newer');
    expect(values(manifest.replaceValue(A, 'a-new'))).toEqual(['a-new', 'a-older']);
  });

  test('a constructor replace swaps the constructor a registration builds through', () => {
    const manifest = Manifest.empty<unknown>()
      .add(A, Impl, Type.ctor(A, [[]]))
      .addValue(B, 'b');
    const replaced = [...manifest.replace(A, Other, Type.ctor(A, [[]]))];
    expect(replaced).toHaveLength(2);
    const swapped = replaced[1]!;
    expect('ctor' in swapped && swapped.ctor).toBe(Other);
  });

  test('a factory replace swaps the factory a registration builds through', () => {
    const manifest = Manifest.empty<unknown>()
      .add(A, () => 'old', Type.func(A, [[]]))
      .addValue(B, 'b');
    const replaced = [...manifest.replace(A, () => 'new', Type.func(A, [[]]))];
    expect(replaced).toHaveLength(2);
    const swapped = replaced[1]!;
    expect('factory' in swapped && (swapped.factory as () => string)()).toBe('new');
  });

  test('a tagged replace reaches the tagged slot without disturbing the bare one', () => {
    const manifest = Manifest.empty<unknown>()
      .addValue(Type.tag(A, 'primary'), 'keyed-old')
      .addValue(A, 'bare');
    expect(values(manifest.replaceValue(Type.tag(A, 'primary'), 'keyed-new'))).toEqual(['bare', 'keyed-new']);
  });
});

describe('the two spellings of replace agree', () => {
  test('on a match', () => {
    const manifest = Manifest.empty<unknown>()
      .addValue(A, 'a-old')
      .addValue(B, 'b');
    expect(values(manifest.replaceValue(A, 'a-new')))
      .toEqual(values(manifest.replace(Registration.value(A, 'a-new'))));
  });

  test('on a no-match', () => {
    const manifest = Manifest.empty<unknown>().addValue(B, 'b');
    expect(values(manifest.replaceValue(A, 'a-new')))
      .toEqual(values(manifest.replace(Registration.value(A, 'a-new'))));
  });
});

describe('the string boundary', () => {
  test('Type.from names the same slot the Type does', () => {
    const manifest = Manifest.empty<unknown>().addValue(A, 'a-old');
    expect(values(manifest.replaceValue(Type.from('app:A'), 'a-new'))).toEqual(['a-new']);
  });

  test('tagging a type that already carries a tag is a contradiction', () => {
    // Statically refused (a tagged base is not a legal tag base); the cast
    // reaches the runtime guard a checker-less caller would hit.
    expect(() => Type.tag(Type.tag(A, 'primary') as any, 'secondary')).toThrow();
  });
});

describe('the receiver is untouched', () => {
  test('a discarded replace registers nothing', () => {
    const manifest = Manifest.empty<unknown>().addValue(A, 'a-old');
    manifest.replaceValue(A, 'a-new');
    expect(values(manifest)).toEqual(['a-old']);
  });
});
