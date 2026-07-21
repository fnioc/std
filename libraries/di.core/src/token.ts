// The typed open-generic token model — the REAL matching engine of
// `@rhombus-std/di.core` + `@rhombus-std/di`. A token STRING is the identity; a
// `TokenNode` is its parsed view: the closed-generic grammar parsed into a
// discriminated union of token nodes, with a canonicalising parser, a canonical
// serialiser, directional unification (`match`), a specificity metric, and hole
// substitution. The resolution engine (`ServiceProviderClass`) closes open
// registrations by `parse`/`tryParse` → `match` (unification) → `substitute`.
//
// `tokens.ts` (sibling) stays the STRING-grammar compatibility + CLASSIFICATION
// surface: `isOpenToken`/`parseToken`/`HOLE_PATTERN`/`closeToken` remain the
// registration-boundary predicates (they define today's routing quirks and are a
// public downstream API), while THIS module does the matching and substitution.
//
// Partial closing and most-specific-wins template selection are implemented here
// but GATED OFF at the engine (the engine scans templates pure-recency, and the
// all-holes registration guard keeps templates single-shape); `specificity` +
// `TokenProvider` remain the exercised reference for those still-gated features.
//
// Self-contained: this module imports nothing — not even sibling di.core files.
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
//     base/key skeleton); the whitespace class is comprehensive (`/\s/`: space,
//     tab, LF, CR, form feed, vertical tab, NBSP, and the Unicode spaces),
//     while interior quoted text is preserved EXACTLY;
//   - a literal union serialises its members ` | `-joined (space-pipe-space),
//     byte-identical to the Go transformer's deterministic emit and the old
//     string engine's space-preserving grammar, so a re-derived union matches a
//     transformer-spelled exact registration;
//   - quote style is normalised to double quotes (single quotes accepted on
//     input as an ergonomic, re-emitted as double); the only recognised escapes
//     inside a literal are `\\` (→ `\`) and `\<quote>` (→ the quote char) — any
//     other `\c` keeps the backslash verbatim, matching the BNF's escape-free
//     `char*` and inverting the canonical encoder exactly;
//   - hole labels are normalised to their integer form (`$01` → `$1`) and MUST
//     be safe integers — an out-of-range label is rejected at parse, so the
//     `n: number` model never loses precision and stringify never emits
//     e-notation the grammar can't re-parse.
//
// Numeric literals are deliberately NOT a normalised category: the BNF has no
// numeric production (`arg ::= token | hole | literal`, `literal` = quoted
// strings only), so a bare `72` / `72.00` / `7.2e1` is just an identifier-shaped
// `path`, byte-preserved and mutually distinct. Numeric-equivalence is left as
// an explicit owner policy decision (see the spike report) rather than baked in
// via a lossy `Number()` round-trip.

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
  readonly args: TokenNode[];
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

export type TokenNode = ConcreteToken | HoleToken | ProviderToken;

/** Local self-contained exhaustiveness guard (avoids a cross-package import). */
function assertNever(value: never): never {
  throw new Error(`unreachable token kind: ${JSON.stringify(value)}`);
}

const WHITESPACE = /\s/;
// Structural stop characters only — whitespace is handled separately via
// `#isWs`, so the comprehensive `/\s/` class (form feed, vertical tab, NBSP, …)
// terminates a base/key rather than being absorbed into it.
const BASE_STOP = new Set(['<', '>', ',', '#', '|']);
const KEY_STOP = new Set(['<', '>', ',', '#', '"', "'"]);

/** Recursive-descent, index-based, quote-aware token parser. It parses to the
 * typed tree AND canonicalises in one pass, so `stringify(parse(raw))` is the
 * canonical form and `parse` of that yields an equal tree (idempotent). */
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

  #parseHole(): HoleToken {
    this.#i++;
    const start = this.#i;
    while (this.#isDigit(this.#src[this.#i])) {
      this.#i++;
    }
    if (this.#i === start) {
      throw this.#fail('hole `$` must be followed by digits');
    }
    const n = Number(this.#src.slice(start, this.#i));
    if (!Number.isSafeInteger(n)) {
      throw this.#fail('hole label out of safe-integer range');
    }
    return { kind: 'hole', n };
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
          const next = this.#src[this.#i + 1];
          // The only recognised escapes are `\\` and `\<quote>` (the inverse of
          // `canonicaliseQuoted`). Any other `\c` keeps the backslash verbatim —
          // `"a\nb"` is the three-code-unit content `a`, `\`, `n`, `b`, NOT a
          // decoded newline and NOT the escape-stripped `anb`.
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
    // The canonical union separator is ` | ` (space-pipe-space), byte-identical
    // to the Go transformer's deterministic emit (`strings.Join(parts, " | ")`,
    // transforms/internal/tokens/derive.go) and to the old string engine's
    // space-preserving grammar. Re-deriving a bound union (open-generic closing,
    // collection element extraction, TypeArgRef injection) therefore reproduces
    // the exact string a transformer-emitted registration was keyed under — an
    // unspaced `"a"|"b"` would miss the spaced `"a" | "b"` exact registration.
    const path = parts.map(canonicaliseQuoted).join(' | ');
    return { kind: 'concrete', path, args: [] };
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
    if (colon > 0) {
      const path = base.slice(colon + 1);
      if (!path) {
        throw this.#fail('empty path after package');
      }
      return { kind: 'concrete', package: base.slice(0, colon), path, args, key };
    }
    return { kind: 'concrete', path: base, args, key };
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

/** Parse a raw token string into its typed tree, canonicalising as it goes.
 * Throws on malformed input (empty base, unbalanced brackets, empty arg,
 * trailing text, unterminated quote). */
export function parse(raw: string): TokenNode {
  return new TokenParser(raw).parse();
}

/** Throw-free {@link parse}: the parsed tree, or `undefined` for malformed input
 * (empty base, unbalanced brackets, empty arg, trailing text, unterminated
 * quote). The engine's `#lookup` funnels the ground token through here so a
 * malformed token becomes a clean miss instead of a throw — the typed-model
 * analog of `parseToken` returning `undefined`. */
export function tryParse(raw: string): TokenNode | undefined {
  try {
    return new TokenParser(raw).parse();
  } catch {
    return undefined;
  }
}

/** The canonical string form of a token tree. */
export function stringify(token: TokenNode): string {
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
export function isOpen(token: TokenNode): boolean {
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
  template: TokenNode,
  ground: TokenNode,
  bind: Map<number, TokenNode> = new Map<number, TokenNode>(),
): Map<number, TokenNode> | null {
  switch (template.kind) {
    case 'hole': {
      // Directional contract: `ground` is closed. A hole never binds to an open
      // node (a bare hole, or a subtree still containing one) — that would leak
      // an unbound label into a supposedly-resolved synthesis. Reject instead.
      if (isOpen(ground)) {
        return null;
      }
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

/** The most-specific-wins metric for ranking overlapping templates: the count
 * of concrete (non-hole) nodes PLUS one per extra occurrence of a repeated hole
 * label. The second term makes an equality-constrained template outrank an
 * otherwise-identical one with distinct holes — `IPair<$1,$1>` (concrete=1,
 * +1 repeat) scores 2 over `IPair<$1,$2>` (concrete=1) — because the former's
 * match set is a strict subset of the latter's (only the diagonal `IPair<T,T>`).
 * Without the repeat term the two tie and selection degrades to add-order. */
export function specificity(token: TokenNode): number {
  const holeCounts = new Map<number, number>();
  const concrete = countConcrete(token, holeCounts);
  let repeats = 0;
  for (const count of holeCounts.values()) {
    repeats += count - 1;
  }
  return concrete + repeats;
}

/** Count concrete/provider nodes, tallying each hole label's occurrences into
 * `holeCounts` for the repeated-hole term of {@link specificity}. */
function countConcrete(token: TokenNode, holeCounts: Map<number, number>): number {
  switch (token.kind) {
    case 'hole': {
      holeCounts.set(token.n, (holeCounts.get(token.n) ?? 0) + 1);
      return 0;
    }
    case 'provider': {
      return 1;
    }
    case 'concrete': {
      return token.args.reduce((sum, arg) => sum + countConcrete(arg, holeCounts), 1);
    }
    default: {
      return assertNever(token);
    }
  }
}

/** Replace each hole reference BY LABEL with its bound token, recursing into
 * concrete args. Throws when a referenced label is unbound. */
export function substitute(token: TokenNode, bind: ReadonlyMap<number, TokenNode>): TokenNode {
  switch (token.kind) {
    case 'hole': {
      const bound = bind.get(token.n);
      if (bound === undefined) {
        // RangeError (not a plain Error) so the engine's `catch (RangeError) →
        // miss` swallow keeps a gappy template (`IX<$1,$3>` depending on `$2`)
        // a clean miss rather than an opaque crash out of `#lookup`.
        throw new RangeError(`unbound hole $${token.n} in substitution`);
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
  signature: readonly TokenNode[],
  bind: ReadonlyMap<number, TokenNode>,
): TokenNode[] {
  return signature.map((slot) => substitute(slot, bind));
}

/** The base-only string of a token (package + path + key, generics stripped) —
 * the key the template-by-base index is gated on. */
export function baseKey(token: TokenNode): string {
  if (token.kind === 'concrete') {
    return stringify({ kind: 'concrete', package: token.package, path: token.path, key: token.key, args: [] });
  }
  return stringify(token);
}
