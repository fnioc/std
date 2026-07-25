// The string-grammar classification + compose edge — the shallow helpers the
// registration builder and the engine use to CLASSIFY a token (open vs closed)
// and COMPOSE one (`base<args>`), without a full parse. The five substitution
// routines that used to sit alongside these are gone — folded into the ONE
// `Substituter` reached through the slot edge (`slot.ts`); what remains is the
// thin string layer the module shrinks to.
//
// The one place the string grammar cannot answer for itself is a keyed token:
// `parseToken` requires the closing `>` to be the LAST character, so it stops at
// a `#key` suffix. `unkeyedToken` strips that suffix — using the tree parser for
// the boundary rather than restating the key grammar — and every classification
// runs on its result.
//
// A hole is a token node that is exactly `$N` (decimal N ≥ 1); a token containing
// a hole in any arg position is an *open template*.

import type { ParsedToken, Token } from '../types.js';
import { TokenNode } from './node.js';

/**
 * A token node that is exactly a hole: `$N`, decimal N ≥ 1. The single source of
 * the hole grammar — the builder imports this rather than re-declaring it.
 */
export const HOLE_PATTERN = /^\$[1-9][0-9]*$/;

/** The separator introducing a keyed token's trailing `#key`. */
const KEY_SEPARATOR = '#';

/**
 * Renders the canonical closed-generic form `base<arg1,arg2>`. With no args,
 * returns `base` unchanged. Args may themselves be closed-generic tokens
 * (nesting) or holes (`$N` — producing an open template).
 */
export function closeToken(base: Token, ...args: Token[]): Token {
  if (!args.length) {
    return base;
  }
  return `${base}<${args.join(',')}>`;
}

/**
 * Parses a closed-generic token into its base and top-level args.
 *
 * Returns `undefined` for non-generic tokens (no top-level `<`) AND for malformed
 * input (empty base, unbalanced brackets, empty arg, trailing text after the
 * closing `>`, unterminated quote) — callers fall through to their exact-match /
 * unregistered-token handling either way.
 *
 * The scan is depth-tracked over `<` / `>` and quote-aware for double quotes
 * (backslash escapes honored), so literal-type args like `"a,b" | "<c>"` split
 * correctly.
 */
export function parseToken(token: Token): ParsedToken | undefined {
  const open = token.indexOf('<');
  if (open <= 0) {
    // No `<` at all (not generic), or `<` first (empty base — malformed).
    return undefined;
  }
  const base = token.slice(0, open);
  if (base.includes('>') || base.includes('"')) {
    return undefined;
  }
  const args: Token[] = [];
  let depth = 1;
  let inQuote = false;
  let argStart = open + 1;
  for (let i = open + 1; i < token.length; i++) {
    const ch = token[i];
    if (inQuote) {
      if (ch === '\\') {
        i++;
      } else if (ch === '"') {
        inQuote = false;
      }
      continue;
    }
    if (ch === '"') {
      inQuote = true;
    } else if (ch === '<') {
      depth++;
    } else if (ch === '>') {
      depth--;
      if (!depth) {
        // The closing `>` must be the last character.
        if (i !== token.length - 1) {
          return undefined;
        }
        const last = token.slice(argStart, i);
        if (!last) {
          return undefined;
        }
        args.push(last);
        return { base, args };
      }
    } else if (ch === ',' && depth === 1) {
      const arg = token.slice(argStart, i);
      if (!arg) {
        return undefined;
      }
      args.push(arg);
      argStart = i + 1;
    }
  }
  // Ran off the end without closing — unbalanced or unterminated quote.
  return undefined;
}

/**
 * True when `token` contains a hole (`$N`) at any depth — i.e. it is an open
 * template rather than a resolvable token. Grammar-aware: a `$N` inside a quoted
 * literal arg is NOT a hole.
 */
export function isOpenToken(token: Token): boolean {
  if (HOLE_PATTERN.test(token)) {
    return true;
  }
  const parsed = parseToken(token);
  if (!parsed) {
    return false;
  }
  return parsed.args.some(isOpenToken);
}

/**
 * `token` with its trailing `#key` removed, or `token` unchanged when it carries
 * none — the inverse of composing a keyed token, and the pre-step every
 * open-vs-closed classification takes.
 *
 * A key can neither introduce nor remove a hole, but `parseToken` requires the
 * closing `>` to be the token's LAST character, so `isOpenToken` reads a keyed
 * template (`pkg:IRepo<$1>#redis`) as closed. Classifying the UNKEYED token is
 * what makes the two spellings of one keyed registration — composed into the
 * token, or passed as the tail `key` argument — agree.
 *
 * The key boundary comes from the tree parser rather than a third copy of the
 * key grammar; the result is still a slice of the ORIGINAL string, so nothing
 * here canonicalises whitespace or quotes on the caller's behalf.
 */
export function unkeyedToken(token: Token): Token {
  const node = TokenNode.tryParse(token);
  if (node === undefined || node.kind !== 'concrete' || node.key === undefined) {
    return token;
  }
  const suffix = `${KEY_SEPARATOR}${node.key}`;
  return token.endsWith(suffix) ? token.slice(0, -suffix.length) : token;
}
