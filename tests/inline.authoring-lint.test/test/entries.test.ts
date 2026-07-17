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
  test('the four grammar rows', () => {
    expect(entryKind({ type: 'p:Foo', impl: 'Impl', member: 'bar' })).toEqual({ kind: 'member', status: 'certified' });
    expect(entryKind({ impl: 'tokenOf' })).toEqual({ kind: 'function', status: 'certified' });
    expect(entryKind({ type: 'p:Foo', member: 'bar' })).toEqual({ kind: 'class-member', status: 'uncertified' });
    expect(entryKind({ impl: 'FooLiteral', member: 'bar' })).toEqual({ kind: 'object-literal-member',
      status: 'uncertified' });
  });

  test('malformed shapes', () => {
    const malformed = { kind: null, status: 'malformed' };
    // member==impl and malformed type tokens violate the interface-member row.
    expect(entryKind({ type: 'p:X', impl: 'x', member: 'x' })).toEqual(malformed);
    expect(entryKind({ type: 'nocolon', impl: 'x', member: 'm' })).toEqual(malformed);
    expect(entryKind({ type: ':T', impl: 'x', member: 'm' })).toEqual(malformed);
    expect(entryKind({ type: 'p:', impl: 'x', member: 'm' })).toEqual(malformed);
    // both+neither mixtures and lone fields.
    expect(entryKind({})).toEqual(malformed);
    expect(entryKind({ type: 'p:T' })).toEqual(malformed);
    expect(entryKind({ member: 'm' })).toEqual(malformed);
    // the retired free-function shape (type+impl) is now malformed.
    expect(entryKind({ type: 'p:tokenOf', impl: 'tokenOf' })).toEqual(malformed);
  });

  test('empty-string fields count as absent', () => {
    expect(entryKind({ type: '', impl: 'fn' })).toEqual({ kind: 'function', status: 'certified' });
    expect(entryKind({ impl: 'fn', member: '' })).toEqual({ kind: 'function', status: 'certified' });
  });
});

describe('loadInlineEntries', () => {
  test('composes imported files in order, both certified rows', () => {
    const dir = pkg({ entries: [{ type: 'p:A', impl: 'A', member: 'm1' }], import: './more.json' });
    writeFileSync(join(dir, 'more.json'),
      JSON.stringify({ entries: [{ type: 'p:B', impl: 'B', member: 'm2' }, { impl: 'freeFn' }] }));
    const entries = loadInlineEntries(dir);
    expect(entries.map((e: { member?: string; impl?: string; }) => e.member ?? e.impl)).toEqual(['m1', 'm2', 'freeFn']);
  });

  test('malformed shape throws INLINE_ENTRY_SHAPE', () => {
    // type+impl with no member: the retired free-function shape, now malformed.
    const dir = pkg({ entries: [{ type: 'p:A', impl: 'AImpl' }] });
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_SHAPE/);
  });

  test('uncertified shape throws INLINE_KIND_UNCERTIFIED', () => {
    const classMember = pkg({ entries: [{ type: 'p:A', member: 'm' }] });
    expect(() => loadInlineEntries(classMember)).toThrow(/INLINE_KIND_UNCERTIFIED/);
    const objectLiteral = pkg({ entries: [{ impl: 'AImpl', member: 'm' }] });
    expect(() => loadInlineEntries(objectLiteral)).toThrow(/INLINE_KIND_UNCERTIFIED/);
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

  test('import as an array composes each file', () => {
    const dir = pkg({ entries: [], import: ['./a.json', './b.json'] });
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ entries: [{ impl: 'fromA' }] }));
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ entries: [{ impl: 'fromB' }] }));
    const entries = loadInlineEntries(dir);
    expect(entries.map((e: { impl?: string; }) => e.impl)).toEqual(['fromA', 'fromB']);
  });

  test('malformed imported JSON throws INLINE_ENTRY_IMPORT (aligned with the Go twin)', () => {
    const dir = pkg({ entries: [], import: './bad.json' });
    writeFileSync(join(dir, 'bad.json'), '{ "entries": [ this is not json ');
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_IMPORT/);
  });

  test('non-string/array import throws INLINE_ENTRY_IMPORT', () => {
    const dir = pkg({ entries: [], import: 42 });
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_IMPORT/);
  });

  test('duplicate entry across two imports is concatenated undeduped', () => {
    // The chosen behavior mirrors the Go twin: both copies are returned;
    // deduplication (where it matters) happens later at the decl-map level.
    const dir = pkg({ entries: [], import: ['./a.json', './b.json'] });
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ entries: [{ impl: 'dup' }] }));
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ entries: [{ impl: 'dup' }] }));
    const entries = loadInlineEntries(dir);
    expect(entries.map((e: { impl?: string; }) => e.impl)).toEqual(['dup', 'dup']);
  });
});
