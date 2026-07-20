// SPIKE (§ open-generic token redesign, additive — lands alongside the current
// `tokens.ts` string-grammar engine, replaces nothing). A *typed* token model:
// the closed-generic grammar parsed into a discriminated union of token nodes,
// with a canonicalising parser, a canonical serialiser, directional
// unification (`match`), a specificity metric for most-specific-wins template
// selection, and hole substitution.
//
// Self-contained: this module imports nothing — not even sibling di.core files —
// so it can be lifted, reviewed, and tested in isolation before any integration.
//
// Grammar (BNF the parser implements):
//
//     token    ::= base generics? key?
//     base     ::= (package ':')? path        ; none of  <  >  "  #
//     generics ::= '<' arg (',' arg)* '>'
//     arg      ::= token | hole | literal
//     hole     ::= '$' digit+                  ; a template-only LABEL, reorderable
//     literal  ::= string ('|' string)*        ; literal-union type arg
//     string   ::= '"' char* '"'               ; quote-aware; interior , < > inert
//     key      ::= '#' name
//
// Canonicalisation (what the parser normalises away, so two semantically-equal
// tokens serialise to the byte-identical string):
//   - whitespace OUTSIDE quoted literals is stripped (around , < > # | and the
//     base/key skeleton); interior quoted text is preserved EXACTLY;
//   - quote style is normalised to double quotes (single quotes accepted on
//     input as an ergonomic, re-emitted as double);
//   - numeric literal args are normalised (`72.00` → `72`, `.5` → `0.5`);
//   - hole labels are normalised to their integer form (`$01` → `$1`).

/** The canonical string of the resolver intrinsic — di.core's provider token. */
export const RESOLVER_TOKEN_STRING = '@rhombus-std/di.core:IResolver';

/** A concrete (closed or open) token: a `(package:)?path` base, positional
 * generic args, and an optional `#key`. Literal leaves (quoted strings, literal
 * unions, numeric literals) are modelled as an arg-less concrete node whose
 * `path` carries the already-canonicalised literal text (see design note in the
 * spike report). */
export interface ConcreteToken {
  readonly kind: 'concrete';
  readonly package?: string;
  readonly path: string;
  readonly args: Token[];
  readonly key?: string;
}

/** A hole `$N` — a TEMPLATE-only position. `n` is a LABEL, not an index: holes
 * are non-contiguous and reorderable; a repeated label must bind consistently. */
export interface HoleToken {
  readonly kind: 'hole';
  readonly n: number;
}

/** The resolver intrinsic sentinel — serialises to `RESOLVER_TOKEN_STRING`. */
export interface ProviderToken {
  readonly kind: 'provider';
}

export type Token = ConcreteToken | HoleToken | ProviderToken;

/** Local self-contained exhaustiveness guard (avoids a cross-package import). */
function assertNever(value: never): never {
  throw new Error(`unreachable token kind: ${JSON.stringify(value)}`);
}

const HOLE_TEXT = /^\$[0-9]+$/;
const NUMERIC = /^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/;
const BASE_STOP = new Set(['<', '>', ',', '#', '|', ' ', '\t', '\n', '\r']);
const KEY_STOP = new Set(['<', '>', ',', '#', '"', "'", ' ', '\t', '\n', '\r']);

/** Recursive-descent, index-based, quote-aware token parser. It parses to the
 * typed tree AND canonicalises in one pass, so `stringify(parse(raw))` is the
 * canonical form and `parse` of that yields an equal tree (idempotent). */
class TokenParser {
  readonly #src: string;
  #i = 0;

  public constructor(src: string) {
    this.#src = src;
  }

  public parse(): Token {
    this.#skipWs();
    const token = this.#parseValue();
    this.#skipWs();
    if (this.#i !== this.#src.length) {
      throw this.#fail('trailing characters after token');
    }
    return token;
  }

  #parseValue(): Token {
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

  #parseHole(): HoleToken {
    this.#i++;
    const start = this.#i;
    while (this.#isDigit(this.#src[this.#i])) {
      this.#i++;
    }
    if (this.#i === start) {
      throw this.#fail('hole `$` must be followed by digits');
    }
    return { kind: 'hole', n: Number(this.#src.slice(start, this.#i)) };
  }

  #parseLiteral(): ConcreteToken {
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
          content += this.#src[this.#i + 1] ?? '';
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
    const path = parts.map(canonicaliseQuoted).join('|');
    return { kind: 'concrete', path, args: [] };
  }

  #parseConcrete(): Token {
    const base = this.#readBase();
    if (!base) {
      throw this.#fail('empty base');
    }
    this.#skipWs();
    let args: Token[] = [];
    if (this.#src[this.#i] === '<') {
      args = this.#parseGenerics();
    }
    this.#skipWs();
    let key: string | undefined;
    if (this.#src[this.#i] === '#') {
      this.#i++;
      key = this.#readKey();
    }
    if (!args.length && key === undefined) {
      if (base === RESOLVER_TOKEN_STRING) {
        return { kind: 'provider' };
      }
      if (NUMERIC.test(base)) {
        return { kind: 'concrete', path: String(Number(base)), args: [] };
      }
    }
    const colon = base.indexOf(':');
    if (colon === 0) {
      throw this.#fail('empty package');
    }
    if (colon > 0) {
      const path = base.slice(colon + 1);
      if (!path) {
        throw this.#fail('empty path after package');
      }
      return { kind: 'concrete', package: base.slice(0, colon), path, args, key };
    }
    return { kind: 'concrete', path: base, args, key };
  }

  #parseGenerics(): Token[] {
    this.#i++;
    const args: Token[] = [];
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
    while (this.#i < this.#src.length && !BASE_STOP.has(this.#src[this.#i]!)) {
      const ch = this.#src[this.#i]!;
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
    while (this.#i < this.#src.length && !KEY_STOP.has(this.#src[this.#i]!)) {
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
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
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

/** Parse a raw token string into its typed tree, canonicalising as it goes.
 * Throws on malformed input (empty base, unbalanced brackets, empty arg,
 * trailing text, unterminated quote). */
export function parse(raw: string): Token {
  return new TokenParser(raw).parse();
}

/** The canonical string form of a token tree. */
export function stringify(token: Token): string {
  switch (token.kind) {
    case 'hole': {
      return `$${token.n}`;
    }
    case 'provider': {
      return RESOLVER_TOKEN_STRING;
    }
    case 'concrete': {
      const base = token.package !== undefined ? `${token.package}:${token.path}` : token.path;
      const generics = token.args.length ? `<${token.args.map(stringify).join(',')}>` : '';
      const key = token.key ? `#${token.key}` : '';
      return `${base}${generics}${key}`;
    }
    default: {
      return assertNever(token);
    }
  }
}

/** `stringify(parse(raw))` — the canonical string of a raw token. Idempotent. */
export function canonicalise(raw: string): string {
  return stringify(parse(raw));
}

/** True when a token tree contains a hole anywhere — i.e. it is an open
 * template rather than a resolvable closed token. */
export function isOpen(token: Token): boolean {
  switch (token.kind) {
    case 'hole': {
      return true;
    }
    case 'provider': {
      return false;
    }
    case 'concrete': {
      return token.args.some(isOpen);
    }
    default: {
      return assertNever(token);
    }
  }
}

/** Directional unification: `template` may hold holes, `ground` is closed.
 *
 * concrete-vs-concrete requires package + path + key equal AND args.length equal
 * (arity is POSITIONAL), then recurses; a hole binds its label on first sight
 * and a repeated label must equal its prior binding (canonical compare); a
 * concrete arg in the template (PARTIAL CLOSING) must match `ground` exactly.
 *
 * Returns the label→token binding on success, `null` on mismatch. On failure
 * `bind` may hold partial bindings — callers pass a fresh map per attempt. */
export function match(
  template: Token,
  ground: Token,
  bind: Map<number, Token> = new Map<number, Token>(),
): Map<number, Token> | null {
  switch (template.kind) {
    case 'hole': {
      const prior = bind.get(template.n);
      if (prior !== undefined) {
        return stringify(prior) === stringify(ground) ? bind : null;
      }
      bind.set(template.n, ground);
      return bind;
    }
    case 'provider': {
      return ground.kind === 'provider' ? bind : null;
    }
    case 'concrete': {
      if (ground.kind !== 'concrete') {
        return null;
      }
      if (template.package !== ground.package) {
        return null;
      }
      if (template.path !== ground.path) {
        return null;
      }
      if ((template.key ?? '') !== (ground.key ?? '')) {
        return null;
      }
      if (template.args.length !== ground.args.length) {
        return null;
      }
      for (let k = 0; k < template.args.length; k++) {
        if (match(template.args[k]!, ground.args[k]!, bind) === null) {
          return null;
        }
      }
      return bind;
    }
    default: {
      return assertNever(template);
    }
  }
}

/** The count of concrete (non-hole) nodes in a tree — the most-specific-wins
 * metric for ranking overlapping templates (a hole contributes 0). */
export function specificity(token: Token): number {
  switch (token.kind) {
    case 'hole': {
      return 0;
    }
    case 'provider': {
      return 1;
    }
    case 'concrete': {
      return token.args.reduce((sum, arg) => sum + specificity(arg), 1);
    }
    default: {
      return assertNever(token);
    }
  }
}

/** Replace each hole reference BY LABEL with its bound token, recursing into
 * concrete args. Throws when a referenced label is unbound. */
export function substitute(token: Token, bind: ReadonlyMap<number, Token>): Token {
  switch (token.kind) {
    case 'hole': {
      const bound = bind.get(token.n);
      if (bound === undefined) {
        throw new Error(`unbound hole $${token.n} in substitution`);
      }
      return bound;
    }
    case 'provider': {
      return token;
    }
    case 'concrete': {
      return {
        kind: 'concrete',
        package: token.package,
        path: token.path,
        key: token.key,
        args: token.args.map((arg) => substitute(arg, bind)),
      };
    }
    default: {
      return assertNever(token);
    }
  }
}

/** Substitute a whole signature (a positional list of dependency tokens). */
export function substituteSignature(
  signature: readonly Token[],
  bind: ReadonlyMap<number, Token>,
): Token[] {
  return signature.map((slot) => substitute(slot, bind));
}

/** The base-only string of a token (package + path + key, generics stripped) —
 * the key the template-by-base index is gated on. */
export function baseKey(token: Token): string {
  if (token.kind === 'concrete') {
    return stringify({ kind: 'concrete', package: token.package, path: token.path, key: token.key, args: [] });
  }
  return stringify(token);
}
