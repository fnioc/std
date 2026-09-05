import Ajv from 'ajv';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Validates every live "rhombus-std" config file against
// schema/rhombus-std.schema.json — the schema and the loaders (entries.go,
// inline-entries.mjs) must never drift from what the authoring packages
// actually publish by JSON. primitives.extras is the only JSON publisher left;
// the other authoring packages publish through `registerInlineBodies` markers.

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

const schema = JSON.parse(readFileSync(join(REPO_ROOT, 'schema', 'rhombus-std.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

const LIVE_MARKERS = [
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
