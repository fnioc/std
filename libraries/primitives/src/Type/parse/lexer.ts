import { TypeParseError } from '../../TypeParseError.js';
import { isSafeChar, isSegmentStart } from '../grammar.js';
import type { LiteralValue } from '../Type.js';

export interface LexToken {
  readonly kind: 'punct' | 'name' | 'literal';
  /** The punctuation itself, or the unescaped text of a name. */
  readonly text: string;
  /** The decoded value of a `literal`. */
  readonly value: LiteralValue;
  /** Whether a `name` was written with an escape, which rules out every reserved reading of it. */
  readonly escaped: boolean;
  readonly position: number;
}

const PUNCTUATION = new Set(['<', '>', '(', ')', '[', ']', '{', '}', ',', ';', ':', '|', '&', '#', '%']);
const BIGINT = /-?\d+n/y;
const NUMBER = /-?(?:Infinity|(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)/y;

/** Splits a type token into the punctuation, names and literals the reader consumes. */
export function* lex(token: string): Generator<LexToken> {
  let index = 0;
  while (index < token.length) {
    const char = token[index]!;
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (char === '=') {
      if (token[index + 1] !== '>') {
        throw new TypeParseError(token, index, '`=>`');
      }
      yield punct('=>', index);
      index += 2;
      continue;
    }
    if (char === '.' && !startsNumber(token, index)) {
      if (token[index + 1] !== '.' || token[index + 2] !== '.') {
        throw new TypeParseError(token, index, '`...`');
      }
      yield punct('...', index);
      index += 3;
      continue;
    }
    if (PUNCTUATION.has(char)) {
      yield punct(char, index);
      index++;
      continue;
    }
    if (char === '"') {
      const end = stringEnd(token, index);
      const text = token.slice(index, end);
      yield { kind: 'literal', text, value: stringValue(token, index, text), escaped: false, position: index };
      index = end;
      continue;
    }
    if (startsNumber(token, index)) {
      const [text, value] = number(token, index);
      yield { kind: 'literal', text, value, escaped: false, position: index };
      index += text.length;
      continue;
    }
    if (isSegmentStart(char)) {
      const name = segment(token, index);
      yield name.lexToken;
      index = name.end;
      continue;
    }
    throw new TypeParseError(token, index, 'a type');
  }
}

function punct(text: string, position: number): LexToken {
  return { kind: 'punct', text, value: undefined, escaped: false, position };
}

function startsNumber(token: string, index: number): boolean {
  const char = token[index]!;
  if (/\d/.test(char)) {
    return true;
  }
  if (char !== '-' && char !== '.') {
    return false;
  }
  const next = token.slice(index + 1);
  return /^\d/.test(next) || (char === '-' && (next.startsWith('.') || next.startsWith('Infinity')));
}

function number(token: string, index: number): [string, number | bigint] {
  BIGINT.lastIndex = index;
  const asBigint = BIGINT.exec(token);
  if (asBigint) {
    return [asBigint[0], BigInt(asBigint[0].slice(0, -1))];
  }
  NUMBER.lastIndex = index;
  const asNumber = NUMBER.exec(token);
  if (!asNumber) {
    throw new TypeParseError(token, index, 'a number literal');
  }
  return [asNumber[0], Number(asNumber[0])];
}

function stringValue(token: string, index: number, text: string): string {
  try {
    return JSON.parse(text) as string;
  } catch {
    throw new TypeParseError(token, index, 'a well-formed string literal');
  }
}

function stringEnd(token: string, index: number): number {
  for (let scan = index + 1; scan < token.length; scan++) {
    if (token[scan] === '\\') {
      scan++;
      continue;
    }
    if (token[scan] === '"') {
      return scan + 1;
    }
  }
  throw new TypeParseError(token, token.length, 'a closing `"`');
}

/**
 * Reads one identifier segment.
 *
 * A leading `\` marks the segment as escaped without standing for a character of its own; every
 * later `\` takes the character after it literally, whatever it is.
 */
function segment(token: string, index: number): { lexToken: LexToken; end: number; } {
  const position = index;
  let escaped = false;
  if (token[index] === '\\') {
    escaped = true;
    index++;
  }
  let text = '';
  while (index < token.length) {
    const char = token[index]!;
    if (char === '\\') {
      if (index + 1 >= token.length) {
        throw new TypeParseError(token, token.length, 'a character after `\\`');
      }
      escaped = true;
      text += token[index + 1];
      index += 2;
      continue;
    }
    if (!isSafeChar(char)) {
      break;
    }
    text += char;
    index++;
  }
  return { lexToken: { kind: 'name', text, value: undefined, escaped, position }, end: index };
}
