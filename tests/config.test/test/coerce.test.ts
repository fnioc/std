// Coercion primitives -- the single source of truth for number/boolean parsing
// shared by the on-demand section helpers and the schema-walker.

import { parseBoolean, parseNumber } from '@rhombus-std/config/private/coerce';
import { describe, expect, test } from 'bun:test';

describe('parseNumber', () => {
  test('accepts finite numeric strings', () => {
    for (const [raw, value] of [['8080', 8080], ['-5', -5], ['3.14', 3.14], ['1e3', 1000]] as const) {
      expect(parseNumber(raw)).toEqual({ ok: true, value });
    }
  });

  test('rejects blank, non-numeric, and non-finite strings', () => {
    for (const raw of ['', '   ', 'abc', 'Infinity', '-Infinity', '1e400', 'NaN']) {
      expect(parseNumber(raw).ok).toBe(false);
    }
  });
});

describe('parseBoolean', () => {
  test('accepts the liberal truthy set (any case, padded)', () => {
    for (const raw of ['true', '1', 'yes', 'on', '  TRUE ', 'On', 'YES']) {
      expect(parseBoolean(raw)).toEqual({ ok: true, value: true });
    }
  });

  test('accepts the liberal falsy set (any case, padded)', () => {
    for (const raw of ['false', '0', 'no', 'off', ' FALSE', 'Off', 'NO']) {
      expect(parseBoolean(raw)).toEqual({ ok: true, value: false });
    }
  });

  test('rejects anything else', () => {
    for (const raw of ['maybe', '2', '']) {
      expect(parseBoolean(raw).ok).toBe(false);
    }
  });
});
