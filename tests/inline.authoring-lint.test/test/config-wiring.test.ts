import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';
import { basename, join, resolve } from 'node:path';

// Owner-task-#1 wiring guard: the rhombus-inline/inline-authoring rule must be
// applied to every real marker-body file by the REAL repo eslint.config.mjs —
// not just by the hand-built Linter configs the other suites use. If the glob,
// the plugin registration, or the flat-config block were wrong, `bun run lint`
// would silently never run the rule (the "wired but dead" failure the inline
// tripwires exist to prevent elsewhere).
//
// di.extras carries its marker bodies as object-literal augmentation sets under
// src/augmentations/*.ts, each published by the `registerInlineBodies` marker
// call beside it — the rule only checks bodies of published sets, so the
// violating text below carries the marker import and call too.

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const CONFIG = join(REPO_ROOT, 'eslint.config.mjs');

const DI_EXTRAS_BODY_FILES: Array<{ file: string; implName: string; member: string; }> = [
  { file: join(REPO_ROOT, 'libraries', 'di.extras', 'src', 'augmentations', 'Manifest-Descriptor-augmentations.ts'), implName: 'ManifestDescriptorAugmentations', member: 'add' },
  { file: join(REPO_ROOT, 'libraries', 'di.extras', 'src', 'augmentations', 'Manifest-Descriptor-augmentations.ts'), implName: 'ManifestDescriptorAugmentations', member: 'tryAdd' },
  { file: join(REPO_ROOT, 'libraries', 'di.extras', 'src', 'augmentations', 'ServiceProvider-service-augmentations.ts'), implName: 'ServiceProviderServiceAugmentations', member: 'resolve' },
];

describe('repo eslint config wires the inline-authoring rule over di.extras', () => {
  // One shared instance: the first type-aware parse pays the monorepo's project-
  // service cold-start cost, and every later call reuses it.
  const eslint = new ESLint({ cwd: REPO_ROOT, overrideConfigFile: CONFIG });

  for (const { file, implName, member } of DI_EXTRAS_BODY_FILES) {
    const name = basename(file);

    test(`calculateConfigForFile applies the rule at error for ${name}`, async () => {
      const config = await eslint.calculateConfigForFile(file);
      const rule = config.rules?.['rhombus-inline/inline-authoring'];
      expect(rule).toBeDefined();
      // Flat config normalizes severity to a numeric level in position 0; 2 = error.
      expect(Array.isArray(rule) ? rule[0] : rule).toBe(2);
    }, 60_000);

    test(`the rule actually fires on a violating body under ${name}`, async () => {
      // A two-statement body violates singleReturn; lintText runs the real config's
      // resolved rule set against the real path, proving the rule is live (not
      // merely present in the computed config).
      const violating = `import { registerInlineBodies } from '@rhombus-std/primitives.extras';\n`
        + `export const ${implName} = {\n`
        + `  ${member}<T>(this: any): boolean { const x = 1; return x > 0; },\n};\n`
        + `registerInlineBodies<any>(${implName});\n`;
      const [result] = await eslint.lintText(violating, { filePath: file });
      const ids = result.messages.map((m) => m.ruleId);
      expect(ids).toContain('rhombus-inline/inline-authoring');
    }, 60_000);
  }
});
