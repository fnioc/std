// The parse-at-edges boundary between the wire `DepSlot` and the transient
// `TokenNode` tree, plus the slot-level signature closing the engine and the
// registration builder need.

import { isFactoryRef, isTypeArgRef, isUnionSlot } from '../guards.js';
import type { DepSignatures, DepSlot } from '../types.js';
import { assertNever } from './constants.js';
import type { TokenNode } from './node.js';
import { TokenNode as Tree } from './node.js';
import { Substituter } from './substitute.js';

/** One wire `DepSlot` → one `TokenNode`. A string slot must be a valid token
 * (throws on malformed — callers that tolerate malformed strings guard first). */
export function parseSlot(slot: DepSlot): TokenNode {
  if (typeof slot === 'string') {
    return Tree.parse(slot);
  }
  if (isTypeArgRef(slot)) {
    return { kind: 'hole', index: slot.typeArg, typeArg: true };
  }
  if (isFactoryRef(slot)) {
    return slot.params === undefined
      ? { kind: 'factory', type: Tree.parse(slot.type) }
      : { kind: 'factory', type: Tree.parse(slot.type), params: slot.params.map((param) => Tree.parse(param)) };
  }
  if (isUnionSlot(slot)) {
    return { kind: 'union', members: slot.union.map(parseSlot) };
  }
  // LiteralRef — the value key is present (possibly `undefined`).
  return { kind: 'literal', value: slot.value };
}

/** One `TokenNode` → one wire `DepSlot`. The token-shaped kinds serialise to a
 * token string; the slot-only kinds serialise to their object form (a `typeArg`
 * hole back to a `TypeArgRef`). */
export function serialiseSlot(node: TokenNode): DepSlot {
  switch (node.kind) {
    case 'concrete':
    case 'provider': {
      return Tree.toString(node);
    }
    case 'hole': {
      return node.typeArg ? { typeArg: node.index } : Tree.toString(node);
    }
    case 'union': {
      return { union: node.members.map(serialiseSlot) };
    }
    case 'literal': {
      return { value: node.value };
    }
    case 'factory': {
      return node.params === undefined
        ? { type: Tree.toString(node.type) }
        : { type: Tree.toString(node.type), params: node.params.map((param) => Tree.toString(param)) };
    }
    default: {
      return assertNever(node);
    }
  }
}

/** Closes every slot of every signature against a label→node binding. */
export function closeSignatures(signatures: DepSignatures, bind: ReadonlyMap<number, TokenNode>): DepSignatures {
  const substituter = new Substituter(bind);
  return signatures.map((signature) => signature.map((slot) => closeSlot(slot, substituter, bind)));
}

function closeSlot(slot: DepSlot, substituter: Substituter, bind: ReadonlyMap<number, TokenNode>): DepSlot {
  if (typeof slot === 'string') {
    return closeTokenString(slot, substituter);
  }
  if (isTypeArgRef(slot)) {
    return { value: boundLabel(slot.typeArg, bind) };
  }
  if (isFactoryRef(slot)) {
    const type = closeTokenString(slot.type, substituter);
    return slot.params === undefined
      ? { type }
      : { type, params: slot.params.map((param) => closeTokenString(param, substituter)) };
  }
  if (isUnionSlot(slot)) {
    return { union: slot.union.map((member) => closeSlot(member, substituter, bind)) };
  }
  // LiteralRef — nothing to substitute.
  return slot;
}

/** Substitute a single token string's holes by label. An unparseable token passes
 * through unchanged. */
function closeTokenString(token: string, substituter: Substituter): string {
  const node = Tree.tryParse(token);
  if (node === undefined) {
    return token;
  }
  return Tree.toString(substituter.rewrite(node));
}

/** A `TypeArgRef` closes to the token STRING of its bound node, carried as a
 * literal value. */
function boundLabel(label: number, bind: ReadonlyMap<number, TokenNode>): string {
  const bound = bind.get(label);
  if (bound === undefined) {
    throw new RangeError(`Hole $${label} has no matching type argument.`);
  }
  return Tree.toString(bound);
}
