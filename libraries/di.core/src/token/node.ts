// The unified token/slot expression tree — ONE plain-data discriminated union
// that every token operation (parse, serialise, match, substitute, validate,
// rank) walks. It absorbs the whole `DepSlot` vocabulary, so a resolve arg and a
// signature slot are the SAME expression and one traversal serves every op.
//
// A token STRING remains the wire identity; a `TokenNode` is its transient
// parsed view. The tree is parsed in at the edges and serialised back out, so it
// never touches the stored/emitted ABI.
//
// PLAIN DATA, never class instances: nodes are updated by SPREAD
// (`{ ...node, args }`), and spreading a class instance strips its prototype.
// Hence the `switch(kind)` lives in the visitor, not an `accept` on the node.
//
// Kind map to the wire `DepSlot`:
//   - `concrete`  — a `(package:)?path` base with positional generic args and an
//                   optional `#key`. A literal-union arg (`"a" | "b"`) is an
//                   arg-less concrete whose `base` carries the canonical literal
//                   text — it has token identity.
//   - `hole`      — an open-generic hole `$N` (`typeArg` absent), OR — with
//                   `typeArg: true` — the wire `TypeArgRef` (`typeof(T)`): on
//                   substitution it reifies to a LITERAL of the bound node's
//                   token string rather than to the bound node itself.
//   - `provider`  — the resolver intrinsic sentinel (`RESOLVER_TOKEN_STRING`).
//   - `union`     — the wire `Union`; members tried in order at resolve time.
//   - `literal`   — the wire `LiteralRef`; supplies its value directly.
//   - `factory`   — the wire `FactoryRef`; `type` is the produced token, `params`
//                   the caller-supplied param tokens (absent when the wire form
//                   omitted them — the absence is load-bearing, so `params` stays
//                   OPTIONAL rather than an empty array). Params are FLAT token
//                   positions: each parses to a `concrete | hole | provider`.

import { parse, tryParse } from './parse.js';
import { baseKey, canonicalise, isOpen, toString } from './stringify.js';

export { RESOLVER_TOKEN_STRING } from './constants.js';

/** A concrete (closed or open) token: a `(package:)?path` base, positional
 * generic args, and an optional `#key`. */
export interface ConcreteNode {
  readonly kind: 'concrete';
  /** The full `(package:)?path` identity — package and path are one string; the
   * split is a parse-time validation concern, not a stored distinction. */
  readonly base: string;
  readonly args: readonly TokenNode[];
  readonly key?: string;
}

/** A hole — an open-generic position. `index` is a LABEL, not an ordinal: holes
 * are non-contiguous and reorderable; a repeated label must bind consistently.
 * `typeArg: true` marks the wire `TypeArgRef` — a `typeof(T)` reference that
 * substitutes to a LITERAL of the bound token's string, not to the bound node. */
export interface HoleNode {
  readonly kind: 'hole';
  readonly index: number;
  readonly typeArg?: boolean;
}

/** The resolver intrinsic sentinel — serialises to `RESOLVER_TOKEN_STRING`. */
export interface ProviderNode {
  readonly kind: 'provider';
}

/** A set of alternative slots tried in declaration order — the wire `Union`.
 * Resolved per-param at RESOLVE time, falling through on a member's failure. */
export interface UnionNode {
  readonly kind: 'union';
  readonly members: readonly TokenNode[];
}

/** A singular literal supplying its value directly — the wire `LiteralRef`.
 * `value` may legitimately be `undefined` (the `void`/`undefined` case), so the
 * node is identified by its kind, never by `value !== undefined`. */
export interface LiteralNode {
  readonly kind: 'literal';
  readonly value: string | number | boolean | bigint | undefined | null;
}

/** A factory-injected parameter — the wire `FactoryRef`. `type` is the produced
 * token; `params` is the authored-order caller-supplied param list, OPTIONAL to
 * mirror the wire (absent = the shape drifts with registration, `[]` = pinned). */
export interface FactoryNode {
  readonly kind: 'factory';
  readonly type: TokenNode;
  readonly params?: readonly TokenNode[];
}

/** The unified token/slot expression tree. A signature is `readonly
 * TokenNode[][]`; a resolve arg is a node the `Validator` proves is
 * `concrete | hole | provider` only. */
export type TokenNode = ConcreteNode | HoleNode | ProviderNode | UnionNode | LiteralNode | FactoryNode;

/** The plain query/serialise ops; the visitor classes (`Substituter`,
 * `Validator`, `Matcher`, `Specificity`) are exported separately. `toString` is
 * a STATIC so nodes stay plain data — and so it never auto-coerces, meaning
 * every caller spells the conversion out. */
export const TokenNode = { parse, tryParse, toString, canonicalise, baseKey, isOpen };
