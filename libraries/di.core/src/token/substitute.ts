// The ONE substitution op — the collapse of the five parallel routines the
// package used to carry (`substitute` / `substituteSignature` / `substituteToken`
// / `substituteSignatures` / `substituteSignaturesByLabel`). It replaces each
// hole BY LABEL with its bound node; the signature-level closing that maps it
// over `DepSlot`s lives at the slot edge (`slot.ts`, `closeSignatures`).
//
// A `typeArg` hole (the wire `TypeArgRef`) reifies to a LITERAL of the bound
// node's token STRING — the `typeof(T)` semantics — rather than to the bound node
// itself; a plain hole substitutes to the bound node. An unbound label throws
// `RangeError` (not a plain `Error`) so the engine's `catch (RangeError) → miss`
// keeps a gappy template a clean miss rather than an opaque crash.

import type { HoleNode } from './node.js';
import { TokenNode } from './node.js';
import { TokenRewriter } from './visitor.js';

export class Substituter extends TokenRewriter {
  readonly #bind: ReadonlyMap<number, TokenNode>;

  public constructor(bind: ReadonlyMap<number, TokenNode>) {
    super();
    this.#bind = bind;
  }

  protected override __visitHole(node: HoleNode): TokenNode {
    const bound = this.#bind.get(node.index);
    if (bound === undefined) {
      throw new RangeError(`unbound hole $${node.index} in substitution`);
    }
    if (node.typeArg) {
      return { kind: 'literal', value: TokenNode.toString(bound) };
    }
    return bound;
  }
}
