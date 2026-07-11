import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Broader-principle guard (issue #45): manual token manipulation anywhere in the
// with-transformer example packages is a smell — it means the transformer left an
// authoring surface uncovered. Cheap source-text checks, no new lint
// infrastructure: neither the with-transformer LIBRARY nor the with-transformer
// APP may import `nameof`, and every `resolve<T>()` / `resolveAsync<T>()` /
// `tryResolve<T>()` call in them must be tokenless (no string-literal token arg).
//
// Both packages are covered because the interop matrix authors the tokenless
// dialect on both sides of the library boundary: the library's factory resolves
// tokenlessly, and the app registers + resolves tokenlessly.

const EXAMPLES_ROOT = join(import.meta.dir, '../../../examples');

const WITH_TRANSFORMER_SRC_DIRS = [
  join(EXAMPLES_ROOT, 'examples.lib.with-transformer/src'),
  join(EXAMPLES_ROOT, 'examples.app.with-transformer/src'),
];

/** Every `.ts` source file under `dir`. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => join(dir, entry));
}

// A raw-token call looks like `.resolve<...>("some:token")` /
// `.resolveAsync<...>("some:token")` / `.tryResolve<...>("some:token")` — a
// string literal as the value argument. The tokenless authoring form always has
// an EMPTY argument list.
const RAW_TOKEN_CALL = /\.(?:resolve|resolveAsync|tryResolve)<[^>]*>\(\s*["'`]/;

describe('with-transformer example packages never manually manipulate tokens', () => {
  for (const dir of WITH_TRANSFORMER_SRC_DIRS) {
    for (const file of sourceFiles(dir)) {
      const relative = file.slice(EXAMPLES_ROOT.length + 1);
      const source = readFileSync(file, 'utf8');

      test(`${relative} never imports nameof`, () => {
        expect(source).not.toMatch(/\bnameof\b/);
      });

      test(`${relative} never resolves with a raw string-literal token`, () => {
        expect(source).not.toMatch(RAW_TOKEN_CALL);
      });
    }
  }
});
