// The most-specific-wins metric for ranking overlapping open templates: the count
// of concrete (non-hole) nodes PLUS one per extra occurrence of a repeated hole
// label. The second term makes an equality-constrained template outrank an
// otherwise-identical one with distinct holes — `IPair<$1,$1>` (concrete=1, +1
// repeat) scores 2 over `IPair<$1,$2>` (concrete=1) — because the former's match
// set is a strict subset of the latter's. Without the repeat term the two tie and
// selection degrades to add-order.
//
// A `TokenWalker<number>`: `__fold` sums the concrete-node count over the tree,
// and `__visitHole` also tallies each label's occurrences into `#holeCounts` so
// `measure` can add the repeat term the fold cannot compute compositionally.

import type { HoleNode, TokenNode } from './node.js';
import { TokenWalker } from './visitor.js';

export class Specificity extends TokenWalker<number> {
  readonly #holeCounts = new Map<number, number>();

  /** The specificity score of `node`. Reusable across calls — resets its tally. */
  public measure(node: TokenNode): number {
    this.#holeCounts.clear();
    const concrete = this.walk(node);
    let repeats = 0;
    for (const count of this.#holeCounts.values()) {
      repeats += count - 1;
    }
    return concrete + repeats;
  }

  protected __fold(node: TokenNode, children: readonly number[]): number {
    const self = node.kind === 'concrete' || node.kind === 'provider' ? 1 : 0;
    return children.reduce((sum, child) => sum + child, self);
  }

  protected override __visitHole(node: HoleNode): number {
    this.#holeCounts.set(node.index, (this.#holeCounts.get(node.index) ?? 0) + 1);
    return this.__fold(node, []);
  }
}
