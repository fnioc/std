import { tag as tagType } from './internals/factories.js';
import { type ArrayType, type ConstructorType, type FunctionType, type GenericType, type GlobalType, type ImportedType,
  type IntersectionType, type IterableType, type ObjectType, type TagType, type TupleType, Type, type TypeLiteralType,
  type TypeSignatures, type UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

/**
 * Replaces each {@link GenericType} whose label is a key of `substitutions` with the
 * mapped type. An unmatched hole is left alone.
 *
 * @remarks
 * One pass, no re-entry: a substituted type is spliced in as-is and never re-scanned, so
 * mapping `T` to a type containing `%T` terminates instead of looping.
 */
class SubstituteVisitor extends TypeVisitor<Type> {
  readonly #substitutions: ReadonlyMap<string, Type>;

  constructor(substitutions: ReadonlyMap<string, Type>) {
    super();
    this.#substitutions = substitutions;
  }

  protected override visitArray(type: ArrayType): Type {
    return Type.array(this.visit(type.element));
  }

  protected override visitCtor(type: ConstructorType): Type {
    return Type.ctor({
      instance: this.visit(type.instance),
      args: this.#allRows(type.args),
      abstract: type.abstract,
    });
  }

  protected override visitFunc(type: FunctionType): Type {
    return Type.func({
      return: this.visit(type.return),
      args: this.#allRows(type.args),
    });
  }

  protected override visitGeneric(type: GenericType): Type {
    return this.#substitutions.get(type.label) ?? type;
  }

  protected override visitGlobal(type: GlobalType): Type {
    return Type.global(type.name, this.#all(type.genericArgs));
  }

  protected override visitImported(type: ImportedType): Type {
    return Type.imported(type.name, type.from, this.#all(type.genericArgs));
  }

  protected override visitIntersection(type: IntersectionType): Type {
    return Type.intersection(...this.#all(type.members));
  }

  protected override visitIterable(type: IterableType): Type {
    return Type.iterable(this.visit(type.element));
  }

  protected override visitObject(type: ObjectType): Type {
    return Type.object(
      Object.fromEntries(Object.entries(type.members).map(([key, member]) => [key, this.visit(member)])),
    );
  }

  /** A substitution can put a tagged type where the tag's own inner type stands, which is refused. */
  protected override visitTag(type: TagType): Type {
    return tagType(this.visit(type.type), type.tag);
  }

  protected override visitTuple(type: TupleType): Type {
    return Type.tuple(...this.#all(type.members));
  }

  protected override visitTypeLiteral(type: TypeLiteralType): Type {
    return type;
  }

  protected override visitUnion(type: UnionType): Type {
    return Type.union(...this.#all(type.members));
  }

  #all(types: readonly Type[]): readonly Type[] {
    return types.map(type => this.visit(type));
  }

  #allRows(rows: TypeSignatures): TypeSignatures {
    return rows.map(row => this.#all(row));
  }
}

export function substituteType(type: Type, substitutions: ReadonlyMap<string, Type>): Type {
  return new SubstituteVisitor(substitutions).visit(type);
}
