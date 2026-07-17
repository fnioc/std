import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The pilot guard (commit b5fb329): di.core's inline-sugar impl body
// (ServiceQueryInline in src/inline.ts) must NEVER reach the shipped dist. Its
// body is `this.isService(nameof<T>())` over an UNBOUND generic, so di.core's own
// nameof lowering — which has no type to bind — would rewrite it to the
// wrong-answer-at-runtime empty token `this.isService("")`. Two mechanisms keep
// it out (a tsconfig.build.json exclude for the per-file emit, a barrel omission
// for the bundle); either can be silently undone by a future include-glob or
// barrel edit. This asserts the OUTPUT, so a regression fails loud regardless of
// which mechanism drifts. It reads the checked-in dist — cheap, in the default gate.

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const DI_CORE = join(REPO_ROOT, 'libraries', 'di.core');

describe('di.core inline sugar stays out of the shipped dist', () => {
  test('the per-file internal emit has no inline.js', () => {
    expect(existsSync(join(DI_CORE, 'dist', 'internal', 'inline.js'))).toBe(false);
  });

  test('the bundled dist/index.js carries neither the impl nor the empty-token lowering', () => {
    const bundle = readFileSync(join(DI_CORE, 'dist', 'index.js'), 'utf8');
    expect(bundle).not.toContain('ServiceQueryInline');
    expect(bundle).not.toContain('isService("")');
  });

  test('the internal/inline subpath does not resolve at runtime', async () => {
    await expect(import('@rhombus-std/di.core/internal/inline')).rejects.toThrow();
  });
});
