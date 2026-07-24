// The string-grammar classification + compose edge — the shallow helpers the
// registration builder and the engine use to CLASSIFY a token (open vs closed)
// and COMPOSE one (`base<args>`), without a full parse. The five substitution
// routines that used to sit alongside these are gone — folded into the ONE
// `Substituter` reached through the slot edge (`slot.ts`); what remains is the
// thin string layer the module shrinks to. These preserve the exact routing the
// registration boundary has today (e.g. `parseToken` requires the closing `>` to
// be the last character, so a keyed open generic classifies exactly as before).
//
// A hole is a token node that is exactly `$N` (decimal N ≥ 1); a token containing
// a hole in any arg position is an *open template*.

import type { ParsedToken, Token } from '../types.js';

/**
 * A token node that is exactly a hole: `$N`, decimal N ≥ 1. The single source of
 * the hole grammar — the builder imports this rather than re-declaring it.
 */
export const HOLE_PATTERN = /^\$[1-9][0-9]*$/;

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
