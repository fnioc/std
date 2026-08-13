import { type ArrayType, type AsyncIterableType, type AsyncType, type CtorType, type FuncType, type GenericType,
  type IntersectionType, type IterableType, type NamedType, type ObjectType, type TagType, type TupleType, Type,
  type TypeLiteralType, type UnionType } from './Type.js';
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

  protected override visitAsync(type: AsyncType): Type {
    return Type.async(this.visit(type.element));
  }

  protected override visitAsyncIterable(type: AsyncIterableType): Type {
    return Type.asyncIterable(this.visit(type.element));
  }

  protected override visitCtor(type: CtorType): Type {
    return Type.ctor(this.visit(type.instanceType), ...this.#all(type.args));
  }

  protected override visitFunc(type: FuncType): Type {
    return Type.func(this.visit(type.returnType), ...this.#all(type.args));
  }

  protected override visitGeneric(type: GenericType): Type {
    return this.#substitutions.get(type.label) ?? type;
  }

  protected override visitIntersection(type: IntersectionType): Type {
    return Type.intersection(...this.#all(type.members));
  }

  protected override visitIterable(type: IterableType): Type {
    return Type.iterable(this.visit(type.element));
  }

  protected override visitNamed(type: NamedType): Type {
    return Type.named(type.name, type.from, this.#all(type.genericArgs));
  }

  protected override visitObject(type: ObjectType): Type {
    return Type.object(
      Object.fromEntries(Object.entries(type.members).map(([key, member]) => [key, this.visit(member)])),
    );
  }

  protected override visitTag(type: TagType): Type {
    return Type.tag(this.visit(type.type), type.tag);
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
}

export function substituteType(type: Type, substitutions: ReadonlyMap<string, Type>): Type {
  return new SubstituteVisitor(substitutions).visit(type);
}
