// The serialise + pure-query edge of the token tree: `toString` (the canonical
// token STRING of a node), `canonicalise` (`toString(parse(raw))`), `isOpen`
// (does the tree hold a hole anywhere), and `baseKey` (the generics-stripped
// base+key the open-template index is gated on). These are the plain fns the
// `TokenNode.*` companion re-exports; the mutating/query VISITORS live in their
// own files.

import { assertNever, RESOLVER_TOKEN_STRING } from './constants.js';
import type { TokenNode } from './node.js';
import { parse } from './parse.js';

/** The canonical token STRING of a node. Defined only for the token-shaped kinds
 * (`concrete | hole | provider`); the slot-only kinds (`union | literal |
 * factory`) have no token-string form — serialise those through `serialiseSlot`.
 * In the live paths `toString` only ever sees the token-shaped kinds (a bound
 * ground token, a parsed template), so the throw is defensive. */
export function toString(node: TokenNode): string {
  switch (node.kind) {
    case 'hole': {
      return `$${node.index}`;
    }
    case 'provider': {
      return RESOLVER_TOKEN_STRING;
    }
    case 'concrete': {
      const generics = node.args.length ? `<${node.args.map(toString).join(',')}>` : '';
      const key = node.key ? `#${node.key}` : '';
      return `${node.base}${generics}${key}`;
    }
    case 'union':
    case 'literal':
    case 'factory': {
      throw new TypeError(
        `TokenNode.toString: '${node.kind}' is a slot-only node with no token-string form (use serialiseSlot).`,
      );
    }
    default: {
      return assertNever(node);
    }
  }
}

/** `toString(parse(raw))` — the canonical string of a raw token. Idempotent. */
export function canonicalise(raw: string): string {
  return toString(parse(raw));
}

/** True when the tree contains a hole anywhere — i.e. it is an open template
 * rather than a resolvable closed token. */
export function isOpen(node: TokenNode): boolean {
  switch (node.kind) {
    case 'hole': {
      return true;
    }
    case 'provider':
    case 'literal': {
      return false;
    }
    case 'concrete': {
      return node.args.some(isOpen);
    }
    case 'union': {
      return node.members.some(isOpen);
    }
    case 'factory': {
      return isOpen(node.type) || (node.params?.some(isOpen) ?? false);
    }
    default: {
      return assertNever(node);
    }
  }
}

/** The base-only string of a token (base + key, generics stripped) — the key the
 * template-by-base index is gated on. */
export function baseKey(node: TokenNode): string {
  if (node.kind === 'concrete') {
    return toString(
      node.key !== undefined
        ? { kind: 'concrete', base: node.base, args: [], key: node.key }
        : { kind: 'concrete', base: node.base, args: [] },
    );
  }
  return toString(node);
}
