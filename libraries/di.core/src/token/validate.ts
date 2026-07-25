import type { FactoryNode, LiteralNode, UnionNode } from './node.js';
import { TokenNode } from './node.js';
import { TokenWalker } from './visitor.js';

/**
 * The resolve-side guard: a slot to be resolved as a dependency must be a pure
 * token node (`concrete | hole | provider`).
 *
 * @remarks
 * The slot-only kinds (`union | literal | factory`) are handled by their own
 * paths BEFORE a slot reaches token resolution — a union is tried
 * member-by-member, a literal supplies its value, a factory injects a callable —
 * so meeting one where a resolvable token is expected means a malformed tree.
 * Only a HAND-BUILT tree needs this: parsing a `DepSlot` yields the right kind
 * by construction.
 */
export class Validator extends TokenWalker<void> {
  /** Throws unless every node reachable from `node` is a resolvable token kind. */
  public validate(node: TokenNode): void {
    this.walk(node);
  }

  protected __fold(): void {
    // Nothing to combine — validation is the throw in the rejecting visits below.
  }

  protected override __visitUnion(node: UnionNode): void {
    throw reject('union', node);
  }

  protected override __visitLiteral(node: LiteralNode): void {
    throw reject('literal', node);
  }

  protected override __visitFactory(node: FactoryNode): void {
    throw reject('factory', node);
  }
}

function reject(kind: string, node: TokenNode): TypeError {
  return new TypeError(`resolve arg is not a resolvable token: encountered a '${kind}' slot node (${describe(node)}).`);
}

/** A best-effort label for the offending node — its token string when it has one,
 * else its kind (the slot-only kinds have no token-string form). */
function describe(node: TokenNode): string {
  try {
    return TokenNode.toString(node);
  } catch {
    return node.kind;
  }
}
