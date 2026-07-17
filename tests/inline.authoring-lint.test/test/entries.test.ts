import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — untyped local ESM helper.
import { entryKind, loadInlineEntries } from '../../../scripts/eslint/inline-entries.mjs';

// The JS entries loader must stay byte-semantically identical to the Go twin
// (entries.go / entries_test.go): the same shape inference and the same import
// composition, cycle, and escape errors.

function pkg(inline: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'inline-entries-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', 'rhombus.inline': inline }));
  return dir;
}

describe('entryKind', () => {
  test('member / function / rejects', () => {
    expect(entryKind({ type: 'p:Foo', impl: 'Impl', member: 'bar' })).toBe('member');
    expect(entryKind({ type: 'p:tokenOf', impl: 'tokenOf' })).toBe('function');
    expect(entryKind({ type: 'p:tokenOf', impl: 'other' })).toBeNull();
    expect(entryKind({ type: 'p:X', impl: 'x', member: 'x' })).toBeNull();
    expect(entryKind({ impl: 'x', member: 'm' })).toBeNull();
  });
});

describe('loadInlineEntries', () => {
  test('composes imported files in order', () => {
    const dir = pkg({ entries: [{ type: 'p:A', impl: 'A', member: 'm1' }], import: './more.json' });
    writeFileSync(join(dir, 'more.json'), JSON.stringify({ entries: [{ type: 'p:B', impl: 'B', member: 'm2' }] }));
    const entries = loadInlineEntries(dir);
    expect(entries.map((e: { member?: string; }) => e.member)).toEqual(['m1', 'm2']);
  });

  test('bad shape throws', () => {
    const dir = pkg({ entries: [{ type: 'p:A', member: 'm' }] });
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_SHAPE/);
  });

  test('import cycle throws', () => {
    const dir = pkg({ entries: [], import: './a.json' });
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ entries: [], import: './b.json' }));
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ entries: [], import: './a.json' }));
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_IMPORT_CYCLE/);
  });

  test('import escape throws', () => {
    const dir = pkg({ entries: [], import: '../escape.json' });
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_IMPORT_ESCAPE/);
  });

  test('no key → empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inline-entries-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p' }));
    expect(loadInlineEntries(dir)).toEqual([]);
  });
});
