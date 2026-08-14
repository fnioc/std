import { tag as tagType } from './internals/factories.js';
import { type ArrayType, type ConstructorType, type FunctionType, type GenericType, type GlobalType, type ImportedType,
  type IntersectionType, type IterableType, type ObjectType, type TagType, type TupleType, Type, type TypeLiteralType,
  type TypeSignatures, type UnionType } from './Type.js';
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
  protected override visitGeneric(type: GenericType): readonly Type[] {
    return [type];
  }
  protected override visitGlobal(type: GlobalType): readonly Type[] {
    return this.#product(type.genericArgs).map(args => Type.global(type.name, args));
  }
  protected override visitImported(type: ImportedType): readonly Type[] {
    return this.#product(type.genericArgs).map(args => Type.imported(type.name, type.from, args));
  }
  protected override visitIntersection(type: IntersectionType): readonly Type[] {
    return this.#product(type.members).map(types => Type.intersection(...types));
  }
  protected override visitIterable(type: IterableType): readonly Type[] {
    return this.visit(type.element).map(element => Type.iterable(element));
  }
  /** A union of tagged types under a tag expands to alternatives that are tagged twice, which is refused. */
  protected override visitTag(type: TagType): readonly Type[] {
    return this.visit(type.type).map(inner => tagType(inner, type.tag));
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

  protected override visitCtor(type: ConstructorType): readonly Type[] {
    return this.#signature(type.args, type.instance).map(([args, instance]) =>
      Type.ctor({ instance, args, abstract: type.abstract })
    );
  }

  protected override visitFunc(type: FunctionType): readonly Type[] {
    return this.#signature(type.args, type.return).map(([args, returns]) => Type.func({ return: returns, args }));
  }

  protected override visitObject(type: ObjectType): readonly Type[] {
    const keys = Object.keys(type.members);
    return this.#product(keys.map(key => type.members[key]!)).map(values =>
      Type.object(Object.fromEntries(keys.map((key, index) => [key, values[index]!])))
    );
  }

  /**
   * A callable's alternatives, each carrying its parameter rows beside the head those rows produce
   * — the instance type of a constructor, the return type of a function.
   *
   * @remarks
   * The product is taken over every parameter of every row and the head at once, so one alternative
   * chooses one reading of the WHOLE signature; slicing the result back into rows restores the
   * shape the callable was written with.
   */
  #signature(rows: TypeSignatures, head: Type): ReadonlyArray<[TypeSignatures, Type]> {
    return this.#product([...rows.flat(), head]).map(parts => {
      const expanded: Array<readonly Type[]> = [];
      let taken = 0;
      for (const row of rows) {
        expanded.push(parts.slice(taken, taken + row.length));
        taken += row.length;
      }
      return [expanded, parts[parts.length - 1]!];
    });
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
