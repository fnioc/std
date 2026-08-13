import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — untyped local ESM helper.
import { parseConfigFile, resolveConfig } from '../../../scripts/eslint/inline-entries.mjs';

function pkg(rhombusStd: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'config-formats-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', 'rhombus-std': rhombusStd }));
  return dir;
}

function pkgNoMarker(): string {
  const dir = mkdtempSync(join(tmpdir(), 'config-formats-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p' }));
  return dir;
}

describe('resolveConfig extends by extension', () => {
  test.each([
    ['a.json', `{ "typefor": { "emit": "inline" } }`],
    ['a.yaml', 'typefor:\n  emit: inline\n'],
    ['a.toml', '[typefor]\nemit = "inline"\n'],
  ])('%s parses by extension', (name, content) => {
    const dir = pkg({ extends: `./${name}` });
    writeFileSync(join(dir, name), content);
    const resolved = resolveConfig(dir);
    expect((resolved.typefor as { emit: string; }).emit).toBe('inline');
  });
});

describe('resolveConfig default probe', () => {
  test.each([
    ['rhombus-std.toml', '[typefor]\nemit = "inline"\n'],
    ['rhombus-std.yml', 'typefor:\n  emit: inline\n'],
    ['rhombus-std.yaml', 'typefor:\n  emit: inline\n'],
    ['rhombus-std.json', `{ "typefor": { "emit": "inline" } }`],
  ])('a lone %s sibling is picked up', (name, content) => {
    const dir = pkgNoMarker();
    writeFileSync(join(dir, name), content);
    const resolved = resolveConfig(dir);
    expect((resolved.typefor as { emit: string; }).emit).toBe('inline');
  });

  test('json — first in the probe order — is taken when every sibling format is present', () => {
    const dir = pkgNoMarker();
    writeFileSync(join(dir, 'rhombus-std.toml'), '[typefor]\nemit = "inline"\n');
    writeFileSync(join(dir, 'rhombus-std.yml'), 'typefor:\n  emit: inline\n');
    writeFileSync(join(dir, 'rhombus-std.yaml'), 'typefor:\n  emit: inline\n');
    writeFileSync(join(dir, 'rhombus-std.json'), JSON.stringify({ typefor: { emit: 'hoisted' } }));
    const resolved = resolveConfig(dir);
    expect((resolved.typefor as { emit: string; }).emit).toBe('hoisted');
  });

  test('the probe stops at the first match: json is taken, toml is never read', () => {
    const dir = pkgNoMarker();
    writeFileSync(join(dir, 'rhombus-std.json'), JSON.stringify({ typefor: { emit: 'hoisted' } }));
    writeFileSync(join(dir, 'rhombus-std.toml'), 'typefor.emit = "inline"\n$schema = "toml-marker"\n');
    const resolved = resolveConfig(dir);
    expect((resolved.typefor as { emit: string; }).emit).toBe('hoisted');
    expect(resolved.$schema).toBeUndefined();
  });
});

describe('resolveConfig schema errors name the file', () => {
  test.each([
    ['bad.json', `{ "notAKnownKey": true }`],
    ['bad.yaml', 'notAKnownKey: true\n'],
    ['bad.toml', 'notAKnownKey = true\n'],
  ])('%s', (name, content) => {
    const dir = pkg({ extends: `./${name}` });
    writeFileSync(join(dir, name), content);
    expect(() => resolveConfig(dir)).toThrow(new RegExp(`INLINE_CONFIG_SCHEMA.*${name}`));
  });
});

describe('parseConfigFile', () => {
  test.each([
    ['bad.yaml', 'typefor:\n  emit: [unterminated\n'],
    ['bad.toml', 'typefor = { emit = \n'],
  ])('%s is a loud INLINE_ENTRY_IMPORT error', (name, content) => {
    expect(() => parseConfigFile(name, content)).toThrow(/INLINE_ENTRY_IMPORT/);
  });

  test('a non-string YAML key is forced to its string form', () => {
    const obj = parseConfigFile('a.yaml', 'true: value\n');
    expect(obj.true).toBe('value');
  });

  test('a self-referential YAML anchor is rejected', () => {
    expect(() => parseConfigFile('a.yaml', 'a: &anchor\n  self: *anchor\n')).toThrow(/INLINE_ENTRY_IMPORT/);
  });

  test('every TOML temporal shape normalizes to a string', () => {
    const content = 'offset = 1979-05-27T07:32:00Z\n'
      + 'local = 1979-05-27T07:32:00\n'
      + 'date = 1979-05-27\n'
      + 'time = 07:32:00\n';
    const obj = parseConfigFile('a.toml', content);
    for (const [key, value] of Object.entries(obj)) {
      expect(typeof value, `expected ${key} to normalize to a string`).toBe('string');
    }
    expect(obj.offset).toBe('1979-05-27T07:32:00Z');
  });
});
