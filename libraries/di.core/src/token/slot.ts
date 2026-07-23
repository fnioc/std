// The parse-at-edges boundary between the wire `DepSlot` and the transient
// `TokenNode` tree, plus the two DepSlot-level signature transforms the engine
// and the registration builder need:
//
//   - `parseSlot` / `serialiseSlot` — one DepSlot ⇄ one TokenNode. A string slot
//     parses to a `concrete | hole | provider` tree; the object slots map to the
//     matching node kind (a `TypeArgRef` becomes a `typeArg` hole).
//   - `closeSignatures` — closes an open template's signatures against a
//     label→node binding. THE replacement for the old `substituteSignaturesByLabel`
//     — the collapse target for the five substitution routines: every token-string
//     hole substitution now runs through the ONE `Substituter`. Kept
//     kind-for-kind so an unparseable string slot passes through untouched
//     (matching the old `tryParse`-undefined passthrough).
//   - `blowUpSignatures` — materialises every param-level `union` slot into
//     cartesian concrete OVERLOADS (odometer order, rightmost-fastest). Called at
//     REGISTRATION time (`ServiceManifestClass`), so the stored/emitted DepSlot
//     keeps `union(...)` (the transformer and wire are unchanged) while the
//     resolve side never sees a union. Odometer order makes it observationally
//     identical to per-param union resolution: params resolve independently, so
//     "first fully-resolvable overload in order" == "leftmost-resolvable per
//     param". Nested unions flatten; a `[[]]` no-deps overload stays `[[]]`.

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

/** Closes every slot of every signature against a label→node binding — the one
 * signature-substitution edge (was `substituteSignaturesByLabel`). */
export function closeSignatures(
  signatures: DepSignatures,
  bind: ReadonlyMap<number, TokenNode>,
): DepSignatures {
  const substituter = new Substituter(bind);
  return signatures.map((signature) => signature.map((slot) => closeSlot(slot, substituter, bind)));
}

/** Slot-level closing, kind-for-kind with the old `substituteSlot`. Every
 * token-string hole substitution routes through the ONE `Substituter`. */
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
 * through unchanged, matching the string engine's `parseToken`-undefined
 * passthrough. */
function closeTokenString(token: string, substituter: Substituter): string {
  const node = Tree.tryParse(token);
  if (node === undefined) {
    return token;
  }
  return Tree.toString(substituter.rewrite(node));
}

/** The canonical token string bound to hole `label`; throws `RangeError` when the
 * binding does not carry it (mirrors the old `holeArg`/`boundLabel` out-of-range
 * throw). Used for a `TypeArgRef`, whose closed form is the token STRING as a
 * literal value. */
function boundLabel(label: number, bind: ReadonlyMap<number, TokenNode>): string {
  const bound = bind.get(label);
  if (bound === undefined) {
    throw new RangeError(`Hole $${label} has no matching type argument.`);
  }
  return Tree.toString(bound);
}

/** Materialises every param-level `union` slot into cartesian concrete overloads,
 * expanding each authored overload in place and preserving inter-overload order.
 * Union-free signatures pass through unchanged. */
export function blowUpSignatures(signatures: DepSignatures): DepSignatures {
  return signatures.flatMap(expandOverload);
}

/** One authored overload → its cartesian expansion over each slot's alternatives,
 * in odometer order (rightmost slot varies fastest). */
function expandOverload(overload: readonly DepSlot[]): Array<readonly DepSlot[]> {
  return overload
    .map(slotAlternatives)
    .reduce<Array<readonly DepSlot[]>>(
      (rows, alternatives) => rows.flatMap((prefix) => alternatives.map((item) => [...prefix, item])),
      [[]],
    );
}

/** The alternatives a slot contributes to the cartesian: a union yields its
 * members (nested unions flattened); every other slot yields itself. */
function slotAlternatives(slot: DepSlot): DepSlot[] {
  if (isUnionSlot(slot)) {
    return slot.union.flatMap(slotAlternatives);
  }
  return [slot];
}
