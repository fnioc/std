import { type CtorType, type FunctionType, type IntersectionType, type NamedType, type ObjectType, type PlaceholderType,
  type TagType, type TupleType, type Type, type TypeLiteralType, TypeVisitor,
  type UnionType } from '@rhombus-std/primitives';

class OpenTypeVisitor extends TypeVisitor<boolean> {
  protected override visitPlaceholder(_type: PlaceholderType): boolean {
    return true;
  }
  protected override visitUnion(type: UnionType): boolean {
    return this.#any(type.types);
  }
  protected override visitIntersection(type: IntersectionType): boolean {
    return this.#any(type.types);
  }
  protected override visitTuple(type: TupleType): boolean {
    return this.#any(type.types);
  }
  protected override visitFunction(type: FunctionType): boolean {
    return this.#any(type.args) || this.visit(type.returnType);
  }
  protected override visitCtor(type: CtorType): boolean {
    return this.#any(type.args) || this.visit(type.instanceType);
  }
  protected override visitNamed(type: NamedType): boolean {
    return this.#any(type.genericTypes);
  }
  protected override visitObject(type: ObjectType): boolean {
    return this.#any(Object.values(type.members));
  }
  protected override visitTag(type: TagType): boolean {
    return this.visit(type.type);
  }
  protected override visitTypeLiteral(_type: TypeLiteralType): boolean {
    return false;
  }

  #any(types: readonly Type[]): boolean {
    return types.some(type => this.visit(type));
  }
}

const openTypeVisitor = new OpenTypeVisitor();

/**
 * Whether `type` still holds a placeholder anywhere — an open registration, which serves a
 * request by capturing its fragments and so has nothing to lower until one arrives.
 */
export function isOpenType(type: Type): boolean {
  return openTypeVisitor.visit(type);
}
