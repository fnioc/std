import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';
import { join, resolve } from 'node:path';

// Owner-task-#1 wiring guard: the rhombus-inline/inline-authoring rule must be
// applied to libraries/*/src/inline.ts by the REAL repo eslint.config.mjs — not
// just by the hand-built Linter configs the other suites use. If the glob, the
// plugin registration, or the flat-config block were wrong, `bun run lint` would
// silently never run the rule (the "wired but dead" failure the inline tripwires
// exist to prevent elsewhere).

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const CONFIG = join(REPO_ROOT, 'eslint.config.mjs');
const INLINE_FILE = join(REPO_ROOT, 'libraries', 'di.core', 'src', 'inline.ts');

describe('repo eslint config wires the inline-authoring rule', () => {
  test('calculateConfigForFile applies the rule at error for di.core/src/inline.ts', async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT, overrideConfigFile: CONFIG });
    const config = await eslint.calculateConfigForFile(INLINE_FILE);
    const rule = config.rules?.['rhombus-inline/inline-authoring'];
    expect(rule).toBeDefined();
    // Flat config normalizes severity to a numeric level in position 0; 2 = error.
    expect(Array.isArray(rule) ? rule[0] : rule).toBe(2);
  });

  test('the rule actually fires on a violating body under that filename', async () => {
    // A two-statement body violates singleReturn; lintText runs the real config's
    // resolved rule set against the real inline.ts path, proving the rule is live
    // (not merely present in the computed config). The impl name must match
    // di.core's real publish list (ServiceQueryInline / isService) — the rule only
    // checks bodies of listed impls.
    const eslint = new ESLint({ cwd: REPO_ROOT, overrideConfigFile: CONFIG });
    const violating = `export const ServiceQueryInline = {\n`
      + `  isService<T>(this: any): boolean { const x = 1; return x > 0; },\n};\n`;
    const [result] = await eslint.lintText(violating, { filePath: INLINE_FILE });
    const ids = result.messages.map((m) => m.ruleId);
    expect(ids).toContain('rhombus-inline/inline-authoring');
  });
});
