// Directional unification: close an open template against a closed ground
// token, binding each hole label to the ground subtree it covers. Dual-tree
// (template ↔ ground), hence its own class rather than a `TokenWalker`.

import { assertNever } from './constants.js';
import { TokenNode } from './node.js';

export class Matcher {
  /**
   * Unifies `template` against the CLOSED `ground`, returning the label→node
   * binding, or `undefined` on mismatch.
   *
   * @remarks
   * concrete-vs-concrete requires equal base, key and arity (positional), then
   * recurses. A hole binds its label on first sight; a repeated label must
   * re-bind to a canonically equal ground.
   *
   * On failure `bind` may hold partial bindings, so pass a FRESH map per
   * attempt (or let it default).
   */
  public match(template: TokenNode, ground: TokenNode, bind: Map<number, TokenNode> = new Map<number, TokenNode>()):
    | Map<number, TokenNode>
    | undefined {
    switch (template.kind) {
      case 'hole': {
        // Directional contract: `ground` is closed. A hole never binds to an open
        // node — reject rather than leak an unbound label.
        if (TokenNode.isOpen(ground)) {
          return undefined;
        }
        const prior = bind.get(template.index);
        if (prior !== undefined) {
          return TokenNode.toString(prior) === TokenNode.toString(ground) ? bind : undefined;
        }
        bind.set(template.index, ground);
        return bind;
      }
      case 'provider': {
        return ground.kind === 'provider' ? bind : undefined;
      }
      case 'concrete': {
        if (ground.kind !== 'concrete') {
          return undefined;
        }
        if (template.base !== ground.base) {
          return undefined;
        }
        if ((template.key ?? '') !== (ground.key ?? '')) {
          return undefined;
        }
        if (template.args.length !== ground.args.length) {
          return undefined;
        }
        for (let k = 0; k < template.args.length; k++) {
          if (this.match(template.args[k]!, ground.args[k]!, bind) === undefined) {
            return undefined;
          }
        }
        return bind;
      }
      case 'union':
      case 'literal':
      case 'factory': {
        // Slot-only kinds cannot appear in a token-string template — clean miss.
        return undefined;
      }
      default: {
        return assertNever(template);
      }
    }
  }
}
