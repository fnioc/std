// CLASSIFY a token (open vs closed) and COMPOSE one (`base<args>`).
//
// `parseToken` and `closeToken` are pure string work — a shallow depth-tracked
// scan and a join, no parse. `isOpenToken` is NOT: classification must be
// spelling-INDEPENDENT, so it reads the typed tree (`node.ts`) whenever the
// token parses, falling back to the shallow scan only for a token the tree
// grammar refuses.
//
// A hole is a token node spelled exactly `$N`; a token carrying a hole in any
// arg position is an *open template*. The hole grammar is stated once, by the
// tree parser (`parse.ts`) — everything here asks it rather than re-spelling it.

import type { ParsedToken, Token } from '../types.js';
import { TokenNode } from './node.js';

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
 *
 * The answer comes off the TYPED TREE, so it does not depend on how the token is
 * SPELLED: the parser canonicalises whitespace, so `pkg:IRepo<pkg:IA, $1>` and
 * `pkg:IRepo<pkg:IA,$1>` are one template and must classify alike. `$0` and
 * `$01` are not holes, because the parser says so.
 *
 * A token the tree grammar REFUSES (`"a b<$1>"` — trailing text after the base)
 * has no tree to read, so it falls back to the shallow scan, which splits the
 * args and asks THIS predicate about each. Such a template stays classified
 * OPEN, which is where its rejection lives.
 */
export function isOpenToken(token: Token): boolean {
  // A hole is spelled `$N`, so a token with no `$` at all is closed — which
  // keeps every ordinary token off the parser entirely.
  if (!token.includes('$')) {
    return false;
  }
  const node = TokenNode.tryParse(token);
  if (node === undefined) {
    return isOpenByShallowScan(token);
  }
  return TokenNode.isOpen(node);
}

/**
 * Splits the top-level args with the shallow scan and puts each back through
 * `isOpenToken`, so the hole grammar consulted is still the parser's. Recursion
 * terminates because every arg slice is strictly shorter than its token.
 */
function isOpenByShallowScan(token: Token): boolean {
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
 * @remarks
 * A key can neither introduce nor remove a hole, so stripping first makes the
 * two spellings of one keyed registration — composed into the token, or passed
 * as the tail `key` argument — classify alike. The shallow fallback NEEDS it:
 * `parseToken` requires the closing `>` to be the token's LAST character and so
 * reads `pkg:IRepo<$1>#redis` as closed.
 *
 * The result is a slice of the ORIGINAL string, so no whitespace or quote
 * canonicalisation leaks back to the caller.
 */
export function unkeyedToken(token: Token): Token {
  const node = TokenNode.tryParse(token);
  if (node === undefined || node.kind !== 'concrete' || node.key === undefined) {
    return token;
  }
  const suffix = `${KEY_SEPARATOR}${node.key}`;
  return token.endsWith(suffix) ? token.slice(0, -suffix.length) : token;
}
