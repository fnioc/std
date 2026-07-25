// The token classification + compose edge — the helpers the registration builder
// and the engine use to CLASSIFY a token (open vs closed) and COMPOSE one
// (`base<args>`). The five substitution routines that used to sit alongside
// these are gone — folded into the ONE `Substituter` reached through the slot
// edge (`slot.ts`); what remains is the thin layer the module shrinks to.
//
// `parseToken` and `closeToken` are pure string work — a shallow depth-tracked
// scan and a join, no parse. `isOpenToken` is NOT: classification is spelling-
// INDEPENDENT, so it reads the typed tree (`node.ts`) whenever the token parses
// and only falls back to the shallow scan for a token the tree grammar refuses.
// Deciding "open template?" off raw arg slices is what let `IRepo<IA, $1>` (a
// space after the comma) register as an exact entry on a literal holey token —
// see `isOpenToken`.
//
// A hole is a token node that is exactly `$N` (decimal N ≥ 1, no leading zero);
// a token containing a hole in any arg position is an *open template*. This
// module states none of that grammar itself — the tree parser (`parse.ts`) is
// its single statement, and everything here asks the parser (§129).

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
 * SPELLED. That is the whole point: the tree parser canonicalises whitespace, so
 * `pkg:IRepo<pkg:IA, $1>` is the same template as `pkg:IRepo<pkg:IA,$1>` and must
 * classify the same way. Reading raw arg slices — all this module used to do —
 * hid the hole, and `materialise` then routed the template into the EXACT map as
 * a literal holey token no closing could ever reach, silently and with no error:
 * `openEntry`'s "reject a template nothing can match" guard cannot fire for a
 * template that never reaches it.
 *
 * A token the tree grammar REFUSES (`"a b<$1>"` — trailing text after the base)
 * has no tree to read, so it falls back to the shallow scan, which splits the
 * args and asks THIS predicate about each. That keeps such a template classified
 * OPEN and therefore routed to `openEntry`, which is exactly where its rejection
 * lives — and it keeps the fallback on the parser's hole grammar instead of a
 * second pattern of its own.
 *
 * `$0` and `$01` are not holes, because the parser says so (§129). There is no
 * second grammar here to disagree with it.
 */
export function isOpenToken(token: Token): boolean {
  // A hole is spelled `$N`, so a token with no `$` at all is closed. This keeps
  // the engine's resolve-time guard off the parser for every ordinary token.
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
 * The fallback for a token the tree grammar refuses: split the top-level args
 * with the shallow depth-tracked scan and put each one back through
 * `isOpenToken`, so the hole grammar consulted is still the parser's. Recursion
 * terminates because every arg slice is strictly shorter than the token it came
 * from.
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
 * A key can neither introduce nor remove a hole. `isOpenToken` now reads the
 * typed tree, which parses `base<args>#key` and so sees past a key on its own;
 * the strip stays the documented pre-step of every classification so the two
 * spellings of one keyed registration — composed into the token, or passed as
 * the tail `key` argument — agree WITHOUT that agreement resting on the
 * classifier's internals. It is also what the shallow fallback needs, since
 * `parseToken` requires the closing `>` to be the token's LAST character and
 * therefore reads `pkg:IRepo<$1>#redis` as closed.
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
