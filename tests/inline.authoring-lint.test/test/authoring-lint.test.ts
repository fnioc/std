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
    { impl: 'tokenOf' },
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

const PRIMITIVE_IMPORT = `import { tokenfor } from '@rhombus-std/primitives.extras';\n`;

describe('inline-authoring rule', () => {
  test('valid pilot body reports nothing', () => {
    const src = PRIMITIVE_IMPORT
      + `export const Foo = {\n  bar<T>(this: any): boolean { return this.isService(tokenfor<T>()); },\n};\n`;
    expect(lintInline(src)).toEqual([]);
  });

  test('valid multi-param body reports nothing', () => {
    const src = PRIMITIVE_IMPORT
      + `export function tokenOf<T>(prefix: string): string { return prefix + tokenfor<T>(); }\n`;
    expect(lintInline(src)).toEqual([]);
  });

  test('spread of a primitive call is allowed → reports nothing', () => {
    // `...signaturefor<T>()` spreads a primitive's minted members into the
    // surrounding call; the stage inlines them, so the rule permits a spread whose
    // argument is a primitive call (only that shape — `[...this.items]` stays
    // banned, covered below).
    const src = `import { signaturefor } from '@rhombus-std/di.core';\n`
      + `export const Foo = {\n  bar<T extends readonly any[]>(this: any): unknown { return this.withSignature(...signaturefor<T>()); },\n};\n`;
    expect(lintInline(src)).toEqual([]);
  });

  test('non-single-return body → singleReturn', () => {
    const src = `export const Foo = {\n  bar<T>(this: any): boolean { const x = 1; return x > 0; },\n};\n`;
    expect(lintInline(src)).toContain('singleReturn');
  });

  test('conditional (?:) is PERMITTED — the §94 resolve-family shape', () => {
    // The resolve-family sugar branches `isSingular<T>() ? singularValue<T>() :
    // this.resolve(tokenfor<T>())`, a single compile-time expression the engine
    // constant-folds. A conditional over otherwise-clean operands is no longer a
    // bannedSyntax violation.
    const src = PRIMITIVE_IMPORT
      + `export const Foo = {\n  bar<T>(this: any): boolean { return this.a ? this.b(tokenfor<T>()) : false; },\n};\n`;
    expect(lintInline(src)).toEqual([]);
  });

  test('free identifier → freeIdentifier', () => {
    const src = `export const Foo = {\n  bar<T>(this: any): boolean { return somethingExternal(); },\n};\n`;
    expect(lintInline(src)).toContain('freeIdentifier');
  });

  test('aliased primitive import → noAlias', () => {
    const src = `import { tokenfor as n } from '@rhombus-std/primitives.extras';\n`
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

  test('nested listed member call this.bar<T>() → noNesting', () => {
    // bar is a listed member (DEFAULT_ENTRIES: impl Foo, member bar); a body that
    // calls this.bar<T>() references another (here, its own) inlineable member —
    // nesting, not yet supported.
    const src = PRIMITIVE_IMPORT
      + `export const Foo = {\n  bar<T>(this: any): boolean { return this.bar<T>(); },\n};\n`;
    expect(lintInline(src)).toContain('noNesting');
  });

  test('reference to a listed free function → noNesting', () => {
    // tokenOf is a listed free function; referencing it by identifier inside a
    // sugar body is nesting.
    const src = PRIMITIVE_IMPORT
      + `export const Foo = {\n  bar<T>(this: any): boolean { return this.isService(tokenOf); },\n};\n`;
    expect(lintInline(src)).toContain('noNesting');
  });

  test('malformed publish list → entryShape at Program', () => {
    // A type-only entry is malformed; loadInlineEntries throws and the rule
    // reports entryShape once at the Program node, regardless of the body.
    const src = `export const Foo = {\n  bar<T>(this: any): boolean { return true; },\n};\n`;
    expect(lintInline(src, { entries: [{ type: 'p:X' }] })).toContain('entryShape');
  });

  test('concrete-type primitive body passes the lint (gap 19 mirror)', () => {
    // typeParamPosition only polices TYPE PARAMETERS; a concrete type in a
    // primitive call's type-arg position (tokenfor<Marker>()) is not a violation.
    // This mirrors the Go characterization test TestBodyWithConcreteNameofTypeArg:
    // the lint accepts it, and the failure (if any) only surfaces later at the
    // emit sweep — flagged for an owner decision.
    const src = PRIMITIVE_IMPORT
      + `interface Marker { readonly m: 'marker'; }\n`
      + `export const Foo = {\n  bar<T>(this: any): boolean { return this.isService(tokenfor<Marker>()); },\n};\n`;
    expect(lintInline(src)).toEqual([]);
  });

  // One fixture per remaining banned construct (a conditional is now PERMITTED,
  // §94, covered above). Each is a single return expression whose only issue is the
  // banned form, so the rule reports bannedSyntax.
  const bannedFixtures: Array<{ name: string; member: string; }> = [
    { name: 'logical', member: `bar<T>(this: any): boolean { return this.a && this.b; }` },
    { name: 'assignment', member: `bar<T>(this: any): boolean { return this.x = true; }` },
    { name: 'comma sequence', member: `bar<T>(this: any): boolean { return (this.a, this.b); }` },
    { name: 'await', member: `async bar<T>(this: any): Promise<boolean> { return await this.p(); }` },
    { name: 'yield', member: `*bar<T>(this: any): any { return yield this.g(); }` },
    { name: 'new', member: `bar<T>(this: any): unknown { return new this.C(); }` },
    { name: 'nested arrow', member: `bar<T>(this: any): unknown { return () => this.x; }` },
    { name: 'nested function', member: `bar<T>(this: any): unknown { return function () { return 1; }; }` },
    { name: 'spread', member: `bar<T>(this: any): unknown { return [...this.items]; }` },
  ];
  for (const { name, member } of bannedFixtures) {
    test(`banned ${name} → bannedSyntax`, () => {
      const src = `export const Foo = {\n  ${member},\n};\n`;
      expect(lintInline(src)).toContain('bannedSyntax');
    });
  }
});
