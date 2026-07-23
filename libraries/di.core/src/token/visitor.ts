// The two typed visitor bases every single-tree token op subclasses. Each routes
// ONE `assertNever`-closed `switch(kind)` to an overridable `visit<Kind>` method;
// each default recurses into a branch node's children (spread-rebuilding for the
// rewriter) or is identity on a leaf. An op overrides ONLY its interesting node
// — `Substituter` overrides `__visitHole`, `Validator` overrides the three
// slot-only nodes. Dispatch lives on the visitor (the `switch`), NOT as an
// `accept` method on the node, because nodes are plain data updated by spread.
//
// Protected members are `__`-prefixed per repo convention (`protected` is erased
// in emit, so the prefix is the runtime "internal" signal).

import { assertNever } from './constants.js';
import type { ConcreteNode, FactoryNode, HoleNode, LiteralNode, ProviderNode, TokenNode, UnionNode } from './node.js';

/** A tree→tree transform. Default walk rebuilds each branch node by spread with
 * its children rewritten, and returns leaves unchanged. */
export abstract class TokenRewriter {
  public rewrite(node: TokenNode): TokenNode {
    switch (node.kind) {
      case 'concrete': {
        return this.__visitConcrete(node);
      }
      case 'hole': {
        return this.__visitHole(node);
      }
      case 'provider': {
        return this.__visitProvider(node);
      }
      case 'union': {
        return this.__visitUnion(node);
      }
      case 'literal': {
        return this.__visitLiteral(node);
      }
      case 'factory': {
        return this.__visitFactory(node);
      }
      default: {
        return assertNever(node);
      }
    }
  }

  protected __visitConcrete(node: ConcreteNode): TokenNode {
    return { ...node, args: node.args.map((arg) => this.rewrite(arg)) };
  }

  protected __visitHole(node: HoleNode): TokenNode {
    return node;
  }

  protected __visitProvider(node: ProviderNode): TokenNode {
    return node;
  }

  protected __visitUnion(node: UnionNode): TokenNode {
    return { ...node, members: node.members.map((member) => this.rewrite(member)) };
  }

  protected __visitLiteral(node: LiteralNode): TokenNode {
    return node;
  }

  protected __visitFactory(node: FactoryNode): TokenNode {
    if (node.params === undefined) {
      return { ...node, type: this.rewrite(node.type) };
    }
    return { ...node, type: this.rewrite(node.type), params: node.params.map((param) => this.rewrite(param)) };
  }
}

/** A tree→`T` query. Default walk folds a branch node's own contribution with
 * its children's results (`__fold`); an op overrides `__fold` for the leaf
 * contribution and any node whose recursion it wants to short-circuit. */
export abstract class TokenWalker<T> {
  public walk(node: TokenNode): T {
    switch (node.kind) {
      case 'concrete': {
        return this.__visitConcrete(node);
      }
      case 'hole': {
        return this.__visitHole(node);
      }
      case 'provider': {
        return this.__visitProvider(node);
      }
      case 'union': {
        return this.__visitUnion(node);
      }
      case 'literal': {
        return this.__visitLiteral(node);
      }
      case 'factory': {
        return this.__visitFactory(node);
      }
      default: {
        return assertNever(node);
      }
    }
  }

  /** Combine a node's own contribution with its children's results. */
  protected abstract __fold(node: TokenNode, children: readonly T[]): T;

  protected __visitConcrete(node: ConcreteNode): T {
    return this.__fold(node, node.args.map((arg) => this.walk(arg)));
  }

  protected __visitHole(node: HoleNode): T {
    return this.__fold(node, []);
  }

  protected __visitProvider(node: ProviderNode): T {
    return this.__fold(node, []);
  }

  protected __visitUnion(node: UnionNode): T {
    return this.__fold(node, node.members.map((member) => this.walk(member)));
  }

  protected __visitLiteral(node: LiteralNode): T {
    return this.__fold(node, []);
  }

  protected __visitFactory(node: FactoryNode): T {
    const parts = node.params === undefined ? [node.type] : [node.type, ...node.params];
    return this.__fold(node, parts.map((part) => this.walk(part)));
  }
}
