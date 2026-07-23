// The unified token/slot expression tree — ONE plain-data discriminated union
// that every token operation (parse, serialise, match, substitute, validate,
// rank) walks. It absorbs the whole `DepSlot` vocabulary so a resolve arg and a
// signature slot are the SAME expression, letting one traversal serve every op
// instead of the five parallel string/tree substitution routines the package
// used to carry (docs TODO §0 / Appendix A1).
//
// A token STRING is still the wire identity (the stored/emitted `DepSlot` format
// is UNCHANGED); a `TokenNode` is its transient parsed view. di.core parses the
// wire at the edges into this tree, runs the ops, and serialises back — the tree
// never touches the serialized ABI.
//
// PLAIN DATA, never class instances: the manifest updates nodes by SPREAD
// (`{ ...node, args }`), and spreading a class instance strips its prototype. So
// the visitor holds the `switch(kind)`, not an `accept` method on the node.
//
// Kind map to the wire `DepSlot`:
//   - `concrete`  — a `(package:)?path` base with positional generic args and an
//                   optional `#key`. A literal-union arg (`"a" | "b"`) is an
//                   arg-less concrete whose `base` carries the canonical literal
//                   text (it has token identity — see the spike report).
//   - `hole`      — an open-generic hole `$N` (`typeArg` absent), OR — with
//                   `typeArg: true` — the wire `TypeArgRef` (`typeof(T)`): on
//                   substitution it reifies to a LITERAL of the bound node's
//                   token string rather than to the bound node itself.
//   - `provider`  — the resolver intrinsic sentinel (`RESOLVER_TOKEN_STRING`).
//   - `union`     — the wire `Union`; members tried in order (blown to concrete
//                   overloads at registration, so it never reaches the resolve
//                   side — see `blowUpSignatures`).
//   - `literal`   — the wire `LiteralRef`; supplies its value directly.
//   - `factory`   — the wire `FactoryRef`; `type` is the produced token, `params`
//                   the caller-supplied param tokens (absent when the wire form
//                   omitted them — the absence is load-bearing, so `params` stays
//                   OPTIONAL rather than an empty array).
//
// NOTE the deliberate deviations from the Appendix A1 sketch, both forced by
// wire round-trip fidelity: `concrete` keeps an optional `key` (the `#key` grammar
// is part of the wire), and `literal.value` keeps the full wire value domain
// (`bigint`/`undefined` included, identified by the PRESENCE of the value — see
// `LiteralRef`). Factory params stay FLAT token positions (each parses to a
// `concrete | hole | provider`); making them recursively expressive is a later,
// wire-changing PR.

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
 * Materialised into concrete overloads at registration, so it is authoring-only
 * and never reaches resolution. */
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
export type TokenNode =
  | ConcreteNode
  | HoleNode
  | ProviderNode
  | UnionNode
  | LiteralNode
  | FactoryNode;

/** The static op surface — the owner-preferred `TokenNode.*` companion (statics,
 * not floating fns). The visitor CLASSES (`Substituter`, `Validator`, `Matcher`,
 * `Specificity`) are exported separately; these are the plain query/serialise
 * ops. `toString` (not `stringify`) per owner preference — a STATIC keeps the
 * nodes plain-data (an instance `toString` would force class nodes and fight the
 * spread-update idiom); it never auto-coerces, so every caller spells it out. */
export const TokenNode = {
  parse,
  tryParse,
  toString,
  canonicalise,
  baseKey,
  isOpen,
};
