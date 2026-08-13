import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error — untyped local ESM helper.
import { entryKind, loadInlineEntries, resolveConfig } from '../../../scripts/eslint/inline-entries.mjs';

// The JS entries loader must stay byte-semantically identical to the Go twin
// (entries.go / entries_test.go): the same shape inference and the same
// "@imports" resolution, deep-merge, and error behavior.

function pkg(rhombusStd: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'inline-entries-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', 'rhombus-std': rhombusStd }));
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
  test('malformed shape throws INLINE_ENTRY_SHAPE', () => {
    // type+impl with no member fits no row.
    const dir = pkg({ inline: { entries: [{ type: 'p:A', impl: 'p:AImpl' }] } });
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_SHAPE/);
  });

  test('uncertified shape throws INLINE_KIND_UNCERTIFIED', () => {
    const ownBody = pkg({ inline: { entries: [{ type: 'p:A', member: 'm' }] } });
    expect(() => loadInlineEntries(ownBody)).toThrow(/INLINE_KIND_UNCERTIFIED/);
    const staticMember = pkg({ inline: { entries: [{ impl: 'p:AImpl', member: 'm' }] } });
    expect(() => loadInlineEntries(staticMember)).toThrow(/INLINE_KIND_UNCERTIFIED/);
  });

  test('impl naming a foreign package throws INLINE_ENTRY_IMPL_FOREIGN', () => {
    const dir = pkg({ inline: { entries: [{ impl: '@other/pkg:tokenOf' }] } });
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_IMPL_FOREIGN/);
  });

  test('malformed imported JSON throws INLINE_ENTRY_IMPORT (aligned with the Go twin)', () => {
    const dir = pkg({ '@imports': './bad.json' });
    writeFileSync(join(dir, 'bad.json'), '{ "inline": [ this is not json ');
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_IMPORT/);
  });

  test('non-string @imports throws INLINE_ENTRY_IMPORT', () => {
    const dir = pkg({ '@imports': 42 });
    expect(() => loadInlineEntries(dir)).toThrow(/INLINE_ENTRY_IMPORT/);
  });

  test('default with no rhombus-std key and no file: empty, silent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inline-entries-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p' }));
    expect(loadInlineEntries(dir)).toEqual([]);
  });

  test('default with no rhombus-std key but a sibling rhombus-std.json: loaded', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inline-entries-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p' }));
    writeFileSync(join(dir, 'rhombus-std.json'), JSON.stringify({ inline: { entries: [{ impl: 'p:fromDefault' }] } }));
    const entries = loadInlineEntries(dir);
    expect(entries.map((e: { impl?: string; }) => e.impl)).toEqual(['p:fromDefault']);
  });

  test('"rhombus-std": {} kills the default even with a file on disk', () => {
    const dir = pkg({});
    writeFileSync(join(dir, 'rhombus-std.json'), JSON.stringify({ inline: { entries: [{ impl: 'p:ignored' }] } }));
    expect(loadInlineEntries(dir)).toEqual([]);
  });

  test('explicit @imports naming a missing file resolves silently to nothing', () => {
    const dir = pkg({ '@imports': './missing.json', inline: { entries: [{ impl: 'p:local' }] } });
    const entries = loadInlineEntries(dir);
    expect(entries.map((e: { impl?: string; }) => e.impl)).toEqual(['p:local']);
  });

  test('a chain of two files resolves base-then-local at each hop', () => {
    const dir = pkg({ '@imports': './a.json' });
    writeFileSync(join(dir, 'a.json'),
      JSON.stringify({ '@imports': './b.json', inline: { entries: [{ impl: 'p:fromA' }] } }));
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ inline: { entries: [{ impl: 'p:fromB' }] } }));
    const entries = loadInlineEntries(dir);
    expect(entries.map((e: { impl?: string; }) => e.impl)).toEqual(['p:fromB', 'p:fromA']);
  });

  test('a cycle resolves clean instead of looping', () => {
    const dir = pkg({ '@imports': './a.json' });
    writeFileSync(join(dir, 'a.json'),
      JSON.stringify({ '@imports': './b.json', inline: { entries: [{ impl: 'p:fromA' }] } }));
    writeFileSync(join(dir, 'b.json'),
      JSON.stringify({ '@imports': './a.json', inline: { entries: [{ impl: 'p:fromB' }] } }));
    const entries = loadInlineEntries(dir);
    expect(entries.map((e: { impl?: string; }) => e.impl)).toEqual(['p:fromB', 'p:fromA']);
  });

  test('a local leaf wins over the same leaf in the imported base', () => {
    const dir = pkg({ '@imports': './base.json', typefor: { emit: 'hoisted' } });
    writeFileSync(join(dir, 'base.json'), JSON.stringify({ typefor: { emit: 'inline' } }));
    const resolved = resolveConfig(dir);
    expect(resolved.typefor).toEqual({ emit: 'hoisted' });
  });

  test('entries concatenate imported-then-local, undeduped', () => {
    const dir = pkg({ '@imports': './rhombus-std.json', inline: { entries: [{ impl: 'p:dup' }] } });
    writeFileSync(join(dir, 'rhombus-std.json'), JSON.stringify({ inline: { entries: [{ impl: 'p:dup' }] } }));
    const entries = loadInlineEntries(dir);
    expect(entries.map((e: { impl?: string; }) => e.impl)).toEqual(['p:dup', 'p:dup']);
  });
});
