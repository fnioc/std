// Directional unification — the dual-tree op that closes an open template
// against a closed ground token, binding each hole label to the ground subtree it
// covers. It is inherently dual-tree (template ↔ ground), so it is its own class
// rather than a single-tree `TokenWalker`; it still routes ONE `switch` on the
// template kind.
//
// concrete-vs-concrete requires base + key equal AND equal arity (positional),
// then recurses; a hole binds its label on first sight and a repeated label must
// re-bind to an equal ground (canonical compare); a hole never binds to an open
// ground (that would leak an unbound label into a supposedly-resolved synthesis).
// A template only ever parses from a token STRING, so `union | literal | factory`
// cannot appear in one — those are a defensive clean miss.
//
// Returns the label→node binding on success, `undefined` on mismatch (truthiness
// over comparison — callers check `if (bind)`). On failure `bind` may hold
// partial bindings — callers pass a fresh map per attempt.
//
// NOTE hole extraction stays fused into this dual walk (bind-as-you-match), which
// is observationally identical to the current engine. The compiled-PATHS
// extraction sketched in Appendix A1 (child-index sequences run single-tree over
// the ground) is a later refinement, not required for wire-stable parity.

import { assertNever } from './constants.js';
import { TokenNode } from './node.js';

export class Matcher {
  public match(
    template: TokenNode,
    ground: TokenNode,
    bind: Map<number, TokenNode> = new Map<number, TokenNode>(),
  ): Map<number, TokenNode> | undefined {
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
