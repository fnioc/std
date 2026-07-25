import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// `$1`…`$9` are di.core's pre-instantiated bare hole aliases — the everyday
// spelling of `$<N>` when registering an open template, documented there as
// "one fewer pair of angle brackets for the overwhelmingly common case".
//
// They were exported by di.core ALONE. Neither barrel a consumer actually
// imports re-exported them, even though each barrel's own doc promises
// otherwise: `@rhombus-std/di` says it re-exports "the whole authoring surface
// … exactly as before the split", and `@rhombus-std/di.extras` says a consumer
// can use "the open-generics placeholders … without importing from
// @rhombus-std/di.core directly". So the shorthand was unreachable in practice —
// `addClass<IJoin<$1, $2>>(…)` did not compile from either package.
//
// This asserts the SHIPPED rolled declarations rather than the source, so a
// future barrel edit that drops them again fails loud however the roll is
// configured. A `.d.ts` carries no runtime code, so once comments are stripped
// an identifier match on the remainder is exact.

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');

/** The nine aliases di.core exports; the barrels must carry the same set. */
const HOLE_ALIASES = ['$1', '$2', '$3', '$4', '$5', '$6', '$7', '$8', '$9'] as const;

/** A package's rolled public declarations, comments removed. */
function declarationsOf(packageName: string): string {
  const dts = readFileSync(
    join(REPO_ROOT, 'libraries', packageName, 'dist', 'bundle', 'index.d.ts'),
    'utf8',
  );
  return dts.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('the bare hole aliases reach consumers through the barrels they import', () => {
  for (const packageName of ['di', 'di.extras']) {
    test(`@rhombus-std/${packageName} re-exports every bare hole alias`, () => {
      const declarations = declarationsOf(packageName);
      for (const alias of HOLE_ALIASES) {
        expect(declarations).toMatch(new RegExp(`\\${alias}\\b`));
      }
    });
  }
});
