import Ajv from 'ajv';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Validates every live "rhombus-std" marker against schema/rhombus-std.schema.json
// — the schema and the loaders (entries.go, inline-entries.mjs) must never drift
// from what the four authoring packages actually publish.

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

const schema = JSON.parse(readFileSync(join(REPO_ROOT, 'schema', 'rhombus-std.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

const LIVE_MARKERS = [
  'libraries/di.extras/rhombus-std.json',
  'libraries/di.extras.options/rhombus-std.json',
  'libraries/config.extras/rhombus-std.json',
  'libraries/primitives.extras/rhombus-std.json',
];

describe('rhombus-std.schema.json drift', () => {
  for (const relPath of LIVE_MARKERS) {
    test(`${relPath} validates`, () => {
      const marker = JSON.parse(readFileSync(join(REPO_ROOT, relPath), 'utf8'));
      const ok = validate(marker);
      expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
    });
  }
});
