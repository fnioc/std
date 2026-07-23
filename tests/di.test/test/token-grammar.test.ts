import { closeToken, isOpenToken, parseToken } from '@rhombus-std/di';
import { describe, expect, test } from 'bun:test';

// The closed-generic token grammar — relocated here from @rhombus-std/di.core when core
// became a pure-types package. These are runtime helpers the engine uses to close
// open registrations, so they live with the engine.

// ── closeToken ────────────────────────────────────────────────────────────────

describe('closeToken', () => {
  test('renders base<arg> for one arg', () => {
    expect(closeToken('pkg:IFoo', 'pkg:IBar')).toBe('pkg:IFoo<pkg:IBar>');
  });

  test('renders base<a,b> for multiple args — no whitespace around separators', () => {
    expect(closeToken('pkg:IMap', 'string', './src/User')).toBe(
      'pkg:IMap<string,./src/User>',
    );
  });

  test('no args returns the base unchanged', () => {
    expect(closeToken('pkg:IFoo')).toBe('pkg:IFoo');
  });

  test('args may themselves be closed-generic tokens (nesting)', () => {
    const inner = closeToken('pkg:IBar', './src/Baz');
    expect(closeToken('pkg:IFoo', inner)).toBe('pkg:IFoo<pkg:IBar<./src/Baz>>');
  });

  test('hole args render an open template', () => {
    expect(closeToken('app/IRepository', '$1')).toBe('app/IRepository<$1>');
  });
});

// ── parseToken ────────────────────────────────────────────────────────────────

describe('parseToken', () => {
  test('non-generic token → undefined', () => {
    expect(parseToken('pkg:IFoo')).toBeUndefined();
    expect(parseToken('./src/Baz')).toBeUndefined();
  });

  test('single arg', () => {
    expect(parseToken('pkg:IFoo<pkg:IBar>')).toEqual({
      base: 'pkg:IFoo',
      args: ['pkg:IBar'],
    });
  });

  test('multiple args split at top-level commas only', () => {
    expect(parseToken('pkg:IMap<string,./src/User>')).toEqual({
      base: 'pkg:IMap',
      args: ['string', './src/User'],
    });
  });

  test('nested generics stay whole in the arg list', () => {
    expect(parseToken('pkg:IFoo<pkg:IBar<./src/Baz>,number>')).toEqual({
      base: 'pkg:IFoo',
      args: ['pkg:IBar<./src/Baz>', 'number'],
    });
  });

  test('deeply nested — only the top level splits', () => {
    expect(parseToken('a<b<c<d,e>,f>,g>')).toEqual({
      base: 'a',
      args: ['b<c<d,e>,f>', 'g'],
    });
  });

  test('quoted literal arg keeps commas and spaces inside quotes', () => {
    expect(parseToken('app/IValidator<"a,b" | "c d">')).toEqual({
      base: 'app/IValidator',
      args: ['"a,b" | "c d"'],
    });
  });

  test('quoted literal arg containing angle brackets does not disturb depth', () => {
    expect(parseToken('app/IParser<"<html>",./src/Doc>')).toEqual({
      base: 'app/IParser',
      args: ['"<html>"', './src/Doc'],
    });
  });

  test('nested generic with a quoted literal-union arg', () => {
    expect(parseToken('pkg:IFoo<pkg:IMode<"dev" | "prod">,string>')).toEqual({
      base: 'pkg:IFoo',
      args: ['pkg:IMode<"dev" | "prod">', 'string'],
    });
  });

  test('hole args parse like any other arg token', () => {
    expect(parseToken('app/IRepository<$1,$2>')).toEqual({
      base: 'app/IRepository',
      args: ['$1', '$2'],
    });
  });

  describe('malformed → undefined', () => {
    test('unclosed bracket', () => {
      expect(parseToken('pkg:IFoo<pkg:IBar')).toBeUndefined();
      expect(parseToken('pkg:IFoo<')).toBeUndefined();
    });

    test('empty base', () => {
      expect(parseToken('<pkg:IBar>')).toBeUndefined();
    });

    test('empty arg', () => {
      expect(parseToken('pkg:IFoo<>')).toBeUndefined();
      expect(parseToken('pkg:IFoo<a,>')).toBeUndefined();
      expect(parseToken('pkg:IFoo<,a>')).toBeUndefined();
    });

    test('trailing text after the closing bracket', () => {
      expect(parseToken('pkg:IFoo<a>x')).toBeUndefined();
      expect(parseToken('pkg:IFoo<a>>')).toBeUndefined();
    });

    test('stray closing bracket in the base', () => {
      expect(parseToken('pkg:IFoo><a>')).toBeUndefined();
    });

    test('unterminated quote', () => {
      expect(parseToken('pkg:IFoo<"a>')).toBeUndefined();
    });

    test('empty string', () => {
      expect(parseToken('')).toBeUndefined();
    });
  });

  test('round-trip: parse of a closeToken render reproduces base and args', () => {
    const token = closeToken('pkg:IFoo', 'pkg:IBar<./src/Baz>', '"a" | "b"');
    expect(parseToken(token)).toEqual({
      base: 'pkg:IFoo',
      args: ['pkg:IBar<./src/Baz>', '"a" | "b"'],
    });
  });
});

// ── isOpenToken ───────────────────────────────────────────────────────────────

describe('isOpenToken', () => {
  test('a bare hole is open', () => {
    expect(isOpenToken('$1')).toBe(true);
    expect(isOpenToken('$9')).toBe(true);
    expect(isOpenToken('$12')).toBe(true);
  });

  test('a template with a hole arg is open', () => {
    expect(isOpenToken('app/IRepository<$1>')).toBe(true);
    expect(isOpenToken('pkg:IMap<string,$2>')).toBe(true);
  });

  test('a hole nested below the top level is still open', () => {
    expect(isOpenToken('pkg:IFoo<pkg:IBar<$1>>')).toBe(true);
    expect(isOpenToken('a<b<c<$3>>,d>')).toBe(true);
  });

  test('closed tokens are not open', () => {
    expect(isOpenToken('pkg:IFoo')).toBe(false);
    expect(isOpenToken('pkg:IFoo<pkg:IBar>')).toBe(false);
    expect(isOpenToken('pkg:IFoo<pkg:IBar<./src/Baz>,number>')).toBe(false);
  });

  test('hole-lookalikes are not holes: quoted literal, $0, prefix/suffix text', () => {
    expect(isOpenToken('pkg:IFoo<"$1">')).toBe(false);
    expect(isOpenToken('pkg:IFoo<$0>')).toBe(false);
    expect(isOpenToken('pkg:IFoo<x$1>')).toBe(false);
    expect(isOpenToken('pkg:IFoo<$1x>')).toBe(false);
  });
});
