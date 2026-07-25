// Recursive-descent, index-based, quote-aware parser for the token STRING
// grammar into the typed tree. It parses AND canonicalises in one pass, so
// `toString(parse(raw))` is the canonical form and re-parsing it yields an equal
// tree (idempotent). A token string only ever yields `concrete | hole | provider`
// nodes — the `union | literal | factory` kinds come from `DepSlot` objects at
// the slot edge (`slot.ts`), never from this grammar.
//
// Grammar (BNF):
//
//     token    ::= base generics? key?
//     base     ::= (package ':')? path        ; none of  <  >  "  #
//     generics ::= '<' arg (',' arg)* '>'
//     arg      ::= token | hole | literal
//     hole     ::= '$' [1-9] digit*            ; a template LABEL, reorderable
//     literal  ::= string ('|' string)*        ; literal-union type arg
//     string   ::= '"' char* '"'               ; quote-aware; interior , < > inert
//     key      ::= '#' name
//
// THIS FILE IS THE HOLE GRAMMAR — the single answer to "is this a hole", which
// `edges.ts`'s `isOpenToken` reads back off the tree rather than restating.
// Labels are 1-BASED and carry no leading zero, so `$0`, `$01` and `$007` are
// parse errors, matching the `Hole<N>` brand's own domain.
//
// Canonicalisation strips whitespace outside quoted literals, ` | `-joins
// literal unions, and normalises quotes to double. Hole labels need no
// normalisation — a label that parses is already its integer form. Numeric
// literals are NOT a normalised category: a bare `72` is an identifier-shaped
// `path`, byte-preserved.

import { RESOLVER_TOKEN_STRING } from './constants.js';
import type { ConcreteNode, HoleNode, TokenNode } from './node.js';

const WHITESPACE = /\s/;
// Structural stop characters only — whitespace is handled separately via `#isWs`,
// so the comprehensive `/\s/` class (form feed, vertical tab, NBSP, …) terminates
// a base/key rather than being absorbed into it.
const BASE_STOP = new Set(['<', '>', ',', '#', '|']);
const KEY_STOP = new Set(['<', '>', ',', '#', '"', "'"]);

/** Parses a raw token string into its typed tree, canonicalising as it goes.
 * Throws on malformed input (empty base, unbalanced brackets, empty arg,
 * trailing text, unterminated quote). */
export function parse(raw: string): TokenNode {
  return new TokenParser(raw).parse();
}

/** {@link parse}, but `undefined` for malformed input — so a ground token that
 * cannot parse becomes a clean lookup miss instead of a throw. */
export function tryParse(raw: string): TokenNode | undefined {
  try {
    return new TokenParser(raw).parse();
  } catch {
    return undefined;
  }
}

class TokenParser {
  readonly #src: string;
  #i = 0;

  public constructor(src: string) {
    this.#src = src;
  }

  public parse(): TokenNode {
    this.#skipWs();
    const token = this.#parseValue();
    this.#skipWs();
    if (this.#i !== this.#src.length) {
      throw this.#fail('trailing characters after token');
    }
    return token;
  }

  #parseValue(): TokenNode {
    this.#skipWs();
    const ch = this.#src[this.#i];
    if (ch === undefined) {
      throw this.#fail('unexpected end of input');
    }
    if (ch === '$') {
      return this.#parseHole();
    }
    if (ch === '"' || ch === "'") {
      return this.#parseLiteral();
    }
    return this.#parseConcrete();
  }

  #parseHole(): HoleNode {
    this.#i++;
    const start = this.#i;
    while (this.#isDigit(this.#src[this.#i])) {
      this.#i++;
    }
    if (this.#i === start) {
      throw this.#fail('hole `$` must be followed by digits');
    }
    const digits = this.#src.slice(start, this.#i);
    // Labels are 1-based with no leading zero, so exactly ONE spelling reaches
    // each label — `$01` alongside `$1` would split one template's identity.
    if (digits[0] === '0') {
      throw this.#fail(
        digits.length === 1
          ? 'hole labels are 1-based — `$0` is not a hole'
          : 'hole label must not carry a leading zero',
      );
    }
    const index = Number(digits);
    if (!Number.isSafeInteger(index)) {
      throw this.#fail('hole label out of safe-integer range');
    }
    return { kind: 'hole', index };
  }

  #parseLiteral(): ConcreteNode {
    const parts: string[] = [];
    for (;;) {
      this.#skipWs();
      const quote = this.#src[this.#i];
      if (quote !== '"' && quote !== "'") {
        throw this.#fail('expected a quoted literal');
      }
      this.#i++;
      let content = '';
      for (;;) {
        const c = this.#src[this.#i];
        if (c === undefined) {
          throw this.#fail('unterminated quoted literal');
        }
        if (c === '\\') {
          const next = this.#src[this.#i + 1];
          // The only recognised escapes are `\\` and `\<quote>` (the inverse of
          // `canonicaliseQuoted`). Any other `\c` keeps the backslash verbatim.
          if (next === '\\' || next === quote) {
            content += next;
          } else {
            content += `\\${next ?? ''}`;
          }
          this.#i += 2;
          continue;
        }
        if (c === quote) {
          this.#i++;
          break;
        }
        content += c;
        this.#i++;
      }
      parts.push(content);
      this.#skipWs();
      if (this.#src[this.#i] === '|') {
        this.#i++;
        continue;
      }
      break;
    }
    // The canonical separator is ` | ` (space-pipe-space), so a re-derived union
    // lands on the same identity as an exactly-registered one.
    const base = parts.map(canonicaliseQuoted).join(' | ');
    return { kind: 'concrete', base, args: [] };
  }

  #parseConcrete(): TokenNode {
    const base = this.#readBase();
    if (!base) {
      throw this.#fail('empty base');
    }
    this.#skipWs();
    let args: TokenNode[] = [];
    if (this.#src[this.#i] === '<') {
      args = this.#parseGenerics();
    }
    this.#skipWs();
    let key: string | undefined;
    if (this.#src[this.#i] === '#') {
      this.#i++;
      key = this.#readKey();
    }
    if (!args.length && key === undefined && base === RESOLVER_TOKEN_STRING) {
      return { kind: 'provider' };
    }
    const colon = base.indexOf(':');
    if (colon === 0) {
      throw this.#fail('empty package');
    }
    if (colon > 0 && !base.slice(colon + 1)) {
      throw this.#fail('empty path after package');
    }
    return key !== undefined ? { kind: 'concrete', base, args, key } : { kind: 'concrete', base, args };
  }

  #parseGenerics(): TokenNode[] {
    this.#i++;
    const args: TokenNode[] = [];
    this.#skipWs();
    if (this.#src[this.#i] === '>') {
      throw this.#fail('empty generic list `<>`');
    }
    for (;;) {
      args.push(this.#parseValue());
      this.#skipWs();
      const c = this.#src[this.#i];
      if (c === ',') {
        this.#i++;
        this.#skipWs();
        if (this.#src[this.#i] === '>') {
          throw this.#fail('empty generic arg (trailing comma)');
        }
        continue;
      }
      if (c === '>') {
        this.#i++;
        return args;
      }
      throw this.#fail('expected `,` or `>` in generic list');
    }
  }

  #readBase(): string {
    const start = this.#i;
    while (this.#i < this.#src.length) {
      const ch = this.#src[this.#i]!;
      if (BASE_STOP.has(ch) || this.#isWs(ch)) {
        break;
      }
      if (ch === '"') {
        throw this.#fail('`"` is not allowed in a base');
      }
      this.#i++;
    }
    return this.#src.slice(start, this.#i);
  }

  #readKey(): string {
    this.#skipWs();
    const start = this.#i;
    while (this.#i < this.#src.length) {
      const ch = this.#src[this.#i]!;
      if (KEY_STOP.has(ch) || this.#isWs(ch)) {
        break;
      }
      this.#i++;
    }
    const key = this.#src.slice(start, this.#i);
    if (!key) {
      throw this.#fail('empty key after `#`');
    }
    return key;
  }

  #skipWs(): void {
    while (this.#isWs(this.#src[this.#i])) {
      this.#i++;
    }
  }

  #isWs(ch: string | undefined): boolean {
    return ch !== undefined && WHITESPACE.test(ch);
  }

  #isDigit(ch: string | undefined): boolean {
    return ch !== undefined && ch >= '0' && ch <= '9';
  }

  #fail(reason: string): Error {
    return new Error(`malformed token ${JSON.stringify(this.#src)} at ${this.#i}: ${reason}`);
  }
}

/** Re-emit a decoded literal string as a canonical double-quoted literal. */
function canonicaliseQuoted(content: string): string {
  const escaped = content.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}
