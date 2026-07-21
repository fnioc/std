// DepSlot-aware substitution for closing an open template's dependency
// signatures against a match binding (label → bound `TokenNode`). The
// typed-token analog of `tokens.ts`'s string-based `substituteSignatures`:
// `match()` (in `./token.ts`) produces the label→TokenNode binding when a closed
// ground token unifies with a template, and this walks every signature slot
// substituting holes BY LABEL — the engine (`@rhombus-std/di`) calls it in
// `#lookup` when it synthesises a closing.
//
// Dispatch mirrors `tokens.ts`'s `substituteSlot` exactly, kind for kind:
//   - a string token → `tryParse` → `substitute` (holes by label) → `stringify`;
//     an unparseable token passes through untouched, matching the old
//     `parseToken`-undefined passthrough,
//   - a `TypeArgRef`  → a `LiteralRef` whose `value` is the bound arg's canonical
//     token string,
//   - a `FactoryRef`  → `type` and each `params` token substituted,
//   - a `Union`       → members substituted recursively,
//   - a `LiteralRef`  → unchanged.
//
// A hole label the binding does not carry throws `RangeError` (from `substitute`,
// or `stringify(bind.get(...))` here), so the engine's existing
// `catch (RangeError) → miss` keeps a gappy template (`IX<$1,$3>` depending on
// `$2`) a clean miss rather than an opaque crash.

import { isFactoryRef, isTypeArgRef, isUnionSlot } from './guards.js';
import { stringify, substitute, type TokenNode, tryParse } from './token.js';
import type { DepSlot } from './types.js';

/** Closes every slot of every signature against a label→`TokenNode` binding. */
export function substituteSignaturesByLabel(
  signatures: ReadonlyArray<readonly DepSlot[]>,
  bind: ReadonlyMap<number, TokenNode>,
): ReadonlyArray<readonly DepSlot[]> {
  return signatures.map((signature) => signature.map((slot) => substituteSlot(slot, bind)));
}

/** Slot-level dispatch, kind-for-kind with `tokens.ts`'s `substituteSlot`. */
function substituteSlot(slot: DepSlot, bind: ReadonlyMap<number, TokenNode>): DepSlot {
  if (typeof slot === 'string') {
    return substituteTokenByLabel(slot, bind);
  }
  if (isTypeArgRef(slot)) {
    return { value: boundLabel(slot.typeArg, bind) };
  }
  if (isFactoryRef(slot)) {
    const type = substituteTokenByLabel(slot.type, bind);
    if (slot.params) {
      return { type, params: slot.params.map((param) => substituteTokenByLabel(param, bind)) };
    }
    return { type };
  }
  if (isUnionSlot(slot)) {
    return { union: slot.union.map((member) => substituteSlot(member, bind)) };
  }
  // LiteralRef — nothing to substitute.
  return slot;
}

/** Substitute a single token string's holes by label. An unparseable token
 * (what `tryParse` returns `undefined` for) passes through unchanged, matching
 * the string engine's `parseToken`-undefined passthrough. */
function substituteTokenByLabel(token: string, bind: ReadonlyMap<number, TokenNode>): string {
  const node = tryParse(token);
  if (node === undefined) {
    return token;
  }
  return stringify(substitute(node, bind));
}

/** The canonical token string bound to hole `label`; throws `RangeError` when the
 * binding does not carry it — mirrors `holeArg`'s out-of-range throw. */
function boundLabel(label: number, bind: ReadonlyMap<number, TokenNode>): string {
  const bound = bind.get(label);
  if (bound === undefined) {
    throw new RangeError(`Hole $${label} has no matching type argument.`);
  }
  return stringify(bound);
}
