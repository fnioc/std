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
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', 'rhombus-std': inline }));
  return dir;
}

describe('entryKind', () => {
  test('the four grammar rows', () => {
    expect(entryKind({ type: '@rhombus-std/di.core:IServiceQuery', impl: 'p:Impl', member: 'isService' }))
      .toEqual({ kind: 'member', status: 'certified' });
    expect(entryKind({ type: '@rhombus-std/di.core:Foo', member: 'bar' }))
      .toEqual({ kind: 'member', status: 'uncertified' });
    expect(entryKind({ impl: 'p:FooBase', member: 'bar' })).toEqual({ kind: 'static-member', status: 'uncertified' });
    expect(entryKind({ impl: 'p:tokenOf' })).toEqual({ kind: 'floater', status: 'certified' });
  });

  test('malformed shapes', () => {
    const malformed = { kind: null, status: 'malformed' };
    // A malformed type token on the ambient-member row is malformed.
    expect(entryKind({ type: 'nocolon', impl: 'p:x', member: 'm' })).toEqual(malformed);
    expect(entryKind({ type: ':T', impl: 'p:x', member: 'm' })).toEqual(malformed);
    expect(entryKind({ type: 'p:', impl: 'p:x', member: 'm' })).toEqual(malformed);
    // A malformed impl token on the ambient-member row is malformed too.
    expect(entryKind({ type: 'p:T', impl: 'nocolon', member: 'm' })).toEqual(malformed);
    // A malformed type token on the own-body member row is malformed.
    expect(entryKind({ type: 'nocolon', member: 'm' })).toEqual(malformed);
    // A malformed impl token on the static-member row is malformed.
    expect(entryKind({ impl: 'nocolon', member: 'm' })).toEqual(malformed);
    // A malformed impl token on the floater row is malformed.
    expect(entryKind({ impl: 'nocolon' })).toEqual(malformed);
    // Both+neither mixtures and lone fields fit no row.
    expect(entryKind({})).toEqual(malformed);
    expect(entryKind({ type: 'p:T' })).toEqual(malformed);
    expect(entryKind({ member: 'm' })).toEqual(malformed);
    expect(entryKind({ type: 'p:T', impl: 'p:V' })).toEqual(malformed);
  });

  test('empty-string fields count as absent', () => {
    expect(entryKind({ type: '', impl: 'p:fn', member: 'm' })).toEqual({ kind: 'static-member',
      status: 'uncertified' });
    expect(entryKind({ impl: 'p:fn', member: '' })).toEqual({ kind: 'floater', status: 'certified' });
  });
});

describe('loadInlineEntries', () => {
  test('composes imported files in order, both certified rows', () => {
    const dir = pkg({ inline: [{ type: 'p:A', impl: 'p:A', member: 'm1' }], import: './more.json' });
    writeFileSync(join(dir, 'more.json'),
      JSON.stringify({ inline: [{ type: 'p:B', impl: 'p:B', member: 'm2' }, { impl: 'p:freeFn' }] }));
    const entries = loadInlineEntries(dir);
    expect(entries.map((e: { member?: string; impl?: string; }) => e.member ?? e.impl)).toEqual(['m1', 'm2',
      'p:freeFn']);
  });

  test('malformed shape throws INLINE_ENTRY_SHAPE', () => {
    // type+impl with no member fits no row.
    const dir = pkg({ inline: [{ type: 'p:A', impl: 'p:AImpl' }] });
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_SHAPE/);
  });

  test('uncertified shape throws INLINE_KIND_UNCERTIFIED', () => {
    const ownBody = pkg({ inline: [{ type: 'p:A', member: 'm' }] });
    expect(() => loadInlineEntries(ownBody)).toThrow(/INLINE_KIND_UNCERTIFIED/);
    const staticMember = pkg({ inline: [{ impl: 'p:AImpl', member: 'm' }] });
    expect(() => loadInlineEntries(staticMember)).toThrow(/INLINE_KIND_UNCERTIFIED/);
  });

  test('impl naming a foreign package throws INLINE_ENTRY_IMPL_FOREIGN', () => {
    const dir = pkg({ inline: [{ impl: '@other/pkg:tokenOf' }] });
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_IMPL_FOREIGN/);
  });

  test('import cycle throws', () => {
    const dir = pkg({ inline: [], import: './a.json' });
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ inline: [], import: './b.json' }));
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ inline: [], import: './a.json' }));
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_IMPORT_CYCLE/);
  });

  test('import escape throws', () => {
    const dir = pkg({ inline: [], import: '../escape.json' });
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_IMPORT_ESCAPE/);
  });

  test('no key → empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inline-entries-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p' }));
    expect(loadInlineEntries(dir)).toEqual([]);
  });

  test('import as an array composes each file', () => {
    const dir = pkg({ inline: [], import: ['./a.json', './b.json'] });
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ inline: [{ impl: 'p:fromA' }] }));
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ inline: [{ impl: 'p:fromB' }] }));
    const entries = loadInlineEntries(dir);
    expect(entries.map((e: { impl?: string; }) => e.impl)).toEqual(['p:fromA', 'p:fromB']);
  });

  test('malformed imported JSON throws INLINE_ENTRY_IMPORT (aligned with the Go twin)', () => {
    const dir = pkg({ inline: [], import: './bad.json' });
    writeFileSync(join(dir, 'bad.json'), '{ "inline": [ this is not json ');
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_IMPORT/);
  });

  test('non-string/array import throws INLINE_ENTRY_IMPORT', () => {
    const dir = pkg({ inline: [], import: 42 });
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_IMPORT/);
  });

  test('duplicate entry across two imports is concatenated undeduped', () => {
    // The chosen behavior mirrors the Go twin: both copies are returned;
    // deduplication (where it matters) happens later at the decl-map level.
    const dir = pkg({ inline: [], import: ['./a.json', './b.json'] });
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ inline: [{ impl: 'p:dup' }] }));
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ inline: [{ impl: 'p:dup' }] }));
    const entries = loadInlineEntries(dir);
    expect(entries.map((e: { impl?: string; }) => e.impl)).toEqual(['p:dup', 'p:dup']);
  });
});
