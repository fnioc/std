import { afterAll, describe, expect, test } from 'bun:test';
import { Linter } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// @ts-expect-error — untyped local ESLint plugin (flat-config rule object).
import tseslint from 'typescript-eslint';
import rhombusInline from '../../../scripts/eslint/rhombus-inline.mjs';

// Drives the inline-authoring rule with ESLint's programmatic Linter over a
// fixture source written into a temp package whose package.json carries the
// matching rhombus.inline entries (the rule loads entries from the file's
// nearest package.json). One fixture per messageId (invalid) plus valid bodies.

const DEFAULT_ENTRIES = {
  entries: [
    { type: 'p:Foo', impl: 'Foo', member: 'bar' },
    { type: '@rhombus-std/primitives:tokenOf', impl: 'tokenOf' },
  ],
};

// Fixtures live UNDER cwd: ESLint flat-config's `files` glob matches relative to
// the working directory, so a file outside it yields "no matching config".
const FIXTURE_BASE = resolve(process.cwd(), '.eslint-fixtures');
mkdirSync(FIXTURE_BASE, { recursive: true });
afterAll(() => rmSync(FIXTURE_BASE, { recursive: true, force: true }));

/** Lints a src/inline.ts body in a temp package, returning the reported messageIds. */
function lintInline(source: string, inlineConfig: unknown = DEFAULT_ENTRIES): string[] {
  const dir = mkdtempSync(join(FIXTURE_BASE, 'f-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', 'rhombus.inline': inlineConfig }));
  mkdirSync(join(dir, 'src'), { recursive: true });
  const file = resolve(dir, 'src', 'inline.ts');
  writeFileSync(file, source);

  const linter = new Linter();
  const messages = linter.verify(source, {
    files: ['**/*.ts'],
    // @ts-expect-error — tseslint parser is a valid flat-config parser object.
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: 2022, sourceType: 'module' } },
    plugins: { 'rhombus-inline': rhombusInline },
    rules: { 'rhombus-inline/inline-authoring': 'error' },
  }, file);
  return messages.map((m) => m.messageId ?? '').filter(Boolean);
}

const PRIMITIVE_IMPORT = `import { nameof } from '@rhombus-std/primitives';\n`;

describe('inline-authoring rule', () => {
  test('valid pilot body reports nothing', () => {
    const src = PRIMITIVE_IMPORT
      + `export const Foo = {\n  bar<T>(this: any): boolean { return this.isService(nameof<T>()); },\n};\n`;
    expect(lintInline(src)).toEqual([]);
  });

  test('valid multi-param body reports nothing', () => {
    const src = PRIMITIVE_IMPORT
      + `export function tokenOf<T>(prefix: string): string { return prefix + nameof<T>(); }\n`;
    expect(lintInline(src)).toEqual([]);
  });

  test('non-single-return body → singleReturn', () => {
    const src = `export const Foo = {\n  bar<T>(this: any): boolean { const x = 1; return x > 0; },\n};\n`;
    expect(lintInline(src)).toContain('singleReturn');
  });

  test('banned conditional → bannedSyntax', () => {
    const src = PRIMITIVE_IMPORT
      + `export const Foo = {\n  bar<T>(this: any): boolean { return this.a ? this.b(nameof<T>()) : false; },\n};\n`;
    expect(lintInline(src)).toContain('bannedSyntax');
  });

  test('free identifier → freeIdentifier', () => {
    const src = `export const Foo = {\n  bar<T>(this: any): boolean { return somethingExternal(); },\n};\n`;
    expect(lintInline(src)).toContain('freeIdentifier');
  });

  test('aliased primitive import → noAlias', () => {
    const src = `import { nameof as n } from '@rhombus-std/primitives';\n`
      + `export const Foo = {\n  bar<T>(this: any): boolean { return this.isService(n<T>()); },\n};\n`;
    expect(lintInline(src)).toContain('noAlias');
  });

  test('value param reused in runtime position → paramReuse', () => {
    const src = `export function tokenOf<T>(prefix: string): string { return prefix + prefix; }\n`;
    expect(lintInline(src)).toContain('paramReuse');
  });

  test('type param in a non-primitive call type-arg → typeParamPosition', () => {
    const src = `export const Foo = {\n  bar<T>(this: any): boolean { return this.pick<T>(); },\n};\n`;
    expect(lintInline(src)).toContain('typeParamPosition');
  });
});
