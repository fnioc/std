import { type CtorType, type IntersectionType, type LateBoundType, type NamedType, type ObjectType,
  type PlaceholderType, type TagType, type TupleType, Type, type TypeLiteralType, type UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

// TODO: short-circuit a branch whose children all expanded to themselves, returning the
// node as-is instead of rebuilding it. Every composite currently goes back through its
// factory even when no union was found, so a union-free tree comes out as a deep copy —
// wasted allocation, and identity-keyed callers (`memo`) miss on every entry.

/**
 * Expands every union into the union-free alternatives it stands for, so
 * `(A | B, C)` becomes `(A, C)` and `(B, C)`.
 *
 * @remarks
 * Ordering is leftmost-significant: the rightmost union varies fastest, so the
 * first alternative takes every union's first branch and declaration priority
 * survives left to right.
 */
class ExpandUnionsVisitor extends TypeVisitor<readonly Type[]> {
  protected override visitUnion(type: UnionType): readonly Type[] {
    return type.types.flatMap(member => this.visit(member));
  }
  protected override visitIntersection(type: IntersectionType): readonly Type[] {
    return this.#product(type.types).map(types => Type.make.intersection(...types));
  }
  protected override visitTuple(type: TupleType): readonly Type[] {
    return this.#product(type.types).map(types => Type.make.tuple(...types));
  }
  protected override visitPlaceholder(type: PlaceholderType): readonly Type[] {
    return [type];
  }
  protected override visitTypeLiteral(type: TypeLiteralType): readonly Type[] {
    return [type];
  }
  protected override visitTag(type: TagType): readonly Type[] {
    return this.visit(type.type).map(inner => Type.make.tag(inner, type.tag));
  }
  protected override visitNamed(type: NamedType): readonly Type[] {
    return this.#product(type.genericTypes).map(args => Type.make.named(type.name, type.from, args));
  }

  protected override visitLateBound(type: LateBoundType): readonly Type[] {
    return this.#product([...type.args, type.returnType]).map(parts =>
      Type.make.latebound(parts[parts.length - 1]!, ...parts.slice(0, -1))
    );
  }

  protected override visitCtor(type: CtorType): readonly Type[] {
    return this.#product([...type.args, type.instanceType]).map(parts =>
      Type.make.ctor(parts[parts.length - 1]!, ...parts.slice(0, -1))
    );
  }

  protected override visitObject(type: ObjectType): readonly Type[] {
    const keys = Object.keys(type.members);
    return this.#product(keys.map(key => type.members[key]!)).map(values =>
      Type.make.object(Object.fromEntries(keys.map((key, index) => [key, values[index]!])))
    );
  }

  /** Cartesian product of each slot's own expansion, rightmost slot varying fastest. */
  #product(types: readonly Type[]): ReadonlyArray<readonly Type[]> {
    return types.reduce<ReadonlyArray<readonly Type[]>>(
      (combinations, type) => combinations.flatMap(prefix => this.visit(type).map(one => [...prefix, one])),
      [[]],
    );
  }
}

export const expandUnionsVisitor = new ExpandUnionsVisitor();
