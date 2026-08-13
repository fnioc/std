import { type ArrayType, type AsyncIterableType, type AsyncType, type CtorType, type FuncType, type GenericType,
  type IntersectionType, type IterableType, type NamedType, type ObjectType, type TagType, type TupleType, Type,
  type TypeLiteralType, type UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

/**
 * Expands every union into the union-free alternatives it stands for, so
 * `(A | B, C)` becomes `(A, C)` and `(B, C)`.
 *
 * @remarks
 * Ordering is leftmost-significant: the rightmost union varies fastest, so the first alternative
 * takes every union's first member in canonical order.
 */
class ExpandUnionsVisitor extends TypeVisitor<readonly Type[]> {
  protected override visitArray(type: ArrayType): readonly Type[] {
    return this.visit(type.element).map(element => Type.array(element));
  }
  protected override visitAsync(type: AsyncType): readonly Type[] {
    return this.visit(type.element).map(element => Type.async(element));
  }
  protected override visitAsyncIterable(type: AsyncIterableType): readonly Type[] {
    return this.visit(type.element).map(element => Type.asyncIterable(element));
  }
  protected override visitGeneric(type: GenericType): readonly Type[] {
    return [type];
  }
  protected override visitIntersection(type: IntersectionType): readonly Type[] {
    return this.#product(type.members).map(types => Type.intersection(...types));
  }
  protected override visitIterable(type: IterableType): readonly Type[] {
    return this.visit(type.element).map(element => Type.iterable(element));
  }
  protected override visitNamed(type: NamedType): readonly Type[] {
    return this.#product(type.genericArgs).map(args => Type.named(type.name, type.from, args));
  }
  protected override visitTag(type: TagType): readonly Type[] {
    return this.visit(type.type).map(inner => Type.tag(inner, type.tag));
  }
  protected override visitTuple(type: TupleType): readonly Type[] {
    return this.#product(type.members).map(types => Type.tuple(...types));
  }
  protected override visitTypeLiteral(type: TypeLiteralType): readonly Type[] {
    return [type];
  }
  protected override visitUnion(type: UnionType): readonly Type[] {
    return type.members.flatMap(member => this.visit(member));
  }

  protected override visitCtor(type: CtorType): readonly Type[] {
    return this.#product([...type.args, type.instanceType]).map(parts =>
      Type.ctor(parts[parts.length - 1]!, ...parts.slice(0, -1))
    );
  }

  protected override visitFunc(type: FuncType): readonly Type[] {
    return this.#product([...type.args, type.returnType]).map(parts =>
      Type.func(parts[parts.length - 1]!, ...parts.slice(0, -1))
    );
  }

  protected override visitObject(type: ObjectType): readonly Type[] {
    const keys = Object.keys(type.members);
    return this.#product(keys.map(key => type.members[key]!)).map(values =>
      Type.object(Object.fromEntries(keys.map((key, index) => [key, values[index]!])))
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
