import type { HoleNode } from './node.js';
import { TokenNode } from './node.js';
import { TokenRewriter } from './visitor.js';

/**
 * Replaces each hole BY LABEL with its bound node. Signature-level closing over
 * `DepSlot`s lives at the slot edge (`closeSignatures`).
 *
 * @remarks
 * A `typeArg` hole reifies to a LITERAL of the bound node's token STRING, where
 * a plain hole substitutes to the bound node itself. An unbound label throws
 * `RangeError` specifically, so a caller can treat a gappy template as a clean
 * miss rather than an opaque crash.
 */
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
