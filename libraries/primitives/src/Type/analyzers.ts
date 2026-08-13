/**
 * The standalone capability questions asked of a {@link Type} — what a node can be used for,
 * derived from the node and nothing else.
 *
 * @remarks
 * A node is interned and frozen, so an answer read off it holds forever. Where the answer costs a
 * walk it is remembered, in a cache the deriving walk is the only writer of; the node itself stays
 * pure data and never carries a capability of its own.
 */

import { memo } from '../utils/map.js';
import type { AggregateType, ArrayType, AsyncIterableType, AsyncType, CtorType, FuncType, GenericType, IntersectionType,
  IterableType, NamedType, ObjectType, TagType, TupleType, Type, TypeLiteralType, UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

/** The kinds that name a type without describing one. */
const IDENTIFIER_KINDS: ReadonlySet<Type['kind']> = new Set<Type['kind']>(['generic', 'named', 'tag']);

/**
 * Is `type` address-only — a pure reference, with nothing of its own to build from?
 *
 * @remarks
 * The answer is the node's own discriminant, so there is nothing to walk and nothing to remember.
 * A tag is address-only whatever it wraps: keying is registration intent, so an unregistered keyed
 * request fails rather than constructs.
 */
export function isIdentifierType(type: Type): boolean {
  return IDENTIFIER_KINDS.has(type.kind);
}

/**
 * Does `type` still hold a generic hole anywhere — an open registration, which serves a request by
 * capturing its fragments and so has nothing to build until one arrives?
 */
export const isOpenType = (() => {
  class OpenScanner extends TypeVisitor<boolean> {
    protected override visitArray(type: ArrayType): boolean {
      return this.#element(type);
    }
    protected override visitAsync(type: AsyncType): boolean {
      return this.#element(type);
    }
    protected override visitAsyncIterable(type: AsyncIterableType): boolean {
      return this.#element(type);
    }
    protected override visitCtor(type: CtorType): boolean {
      return this.#any(type.args) || this.visit(type.instanceType);
    }
    protected override visitFunc(type: FuncType): boolean {
      return this.#any(type.args) || this.visit(type.returnType);
    }
    protected override visitGeneric(_type: GenericType): boolean {
      return true;
    }
    protected override visitIntersection(type: IntersectionType): boolean {
      return this.#any(type.members);
    }
    protected override visitIterable(type: IterableType): boolean {
      return this.#element(type);
    }
    protected override visitNamed(type: NamedType): boolean {
      return this.#any(type.genericArgs);
    }
    protected override visitObject(type: ObjectType): boolean {
      return this.#any(Object.values(type.members));
    }
    protected override visitTag(type: TagType): boolean {
      return this.visit(type.type);
    }
    protected override visitTuple(type: TupleType): boolean {
      return this.#any(type.members);
    }
    protected override visitTypeLiteral(_type: TypeLiteralType): boolean {
      return false;
    }
    protected override visitUnion(type: UnionType): boolean {
      return this.#any(type.members);
    }

    #any(types: readonly Type[]): boolean {
      return types.some(type => this.visit(type));
    }
    #element(type: AggregateType): boolean {
      return this.visit(type.element);
    }
  }

  const scanner = new OpenScanner();

  return memo(function isOpen(type: Type): boolean {
    return scanner.visit(type);
  });
})();
