import { type CtorType, type FunctionType, type IntersectionType, type NamedType, type ObjectType, type PlaceholderType,
  type TagType, type TupleType, Type, type TypeLiteralType, type UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

/**
 * Replaces each {@link PlaceholderType} whose label is a key of `substitutions` with the
 * mapped type. An unmatched placeholder is left alone.
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

  protected override visitPlaceholder(type: PlaceholderType): Type {
    return this.#substitutions.get(type.label) ?? type;
  }

  protected override visitTypeLiteral(type: TypeLiteralType): Type {
    return type;
  }

  protected override visitUnion(type: UnionType): Type {
    return Type.union(...this.#all(type.members));
  }

  protected override visitIntersection(type: IntersectionType): Type {
    return Type.intersection(...this.#all(type.members));
  }

  protected override visitTuple(type: TupleType): Type {
    return Type.tuple(...this.#all(type.members));
  }

  protected override visitNamed(type: NamedType): Type {
    return Type.named(type.name, type.from, this.#all(type.genericArgs));
  }

  protected override visitFunction(type: FunctionType): Type {
    return Type.func(this.visit(type.returnType), ...this.#all(type.args));
  }

  protected override visitCtor(type: CtorType): Type {
    return Type.ctor(this.visit(type.instanceType), ...this.#all(type.args));
  }

  protected override visitTag(type: TagType): Type {
    return Type.tag(this.visit(type.type), type.tag);
  }

  protected override visitObject(type: ObjectType): Type {
    return Type.object(
      Object.fromEntries(Object.entries(type.members).map(([key, member]) => [key, this.visit(member)])),
    );
  }

  #all(types: readonly Type[]): readonly Type[] {
    return types.map(type => this.visit(type));
  }
}

export function substituteType(type: Type, substitutions: ReadonlyMap<string, Type>): Type {
  return new SubstituteVisitor(substitutions).visit(type);
}
