import type { CtorType, IntersectionType, LateBoundType, NamedType, ObjectType, PlaceholderType, TagType, TupleType,
  Type, TypeLiteralType, UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

class TypeValidatorVisitor extends TypeVisitor<readonly string[]> {
  protected override visitUnion(type: UnionType): readonly string[] {
    return this.#all(type.types);
  }
  protected override visitIntersection(type: IntersectionType): readonly string[] {
    return this.#all(type.types);
  }
  protected override visitTuple(type: TupleType): readonly string[] {
    return this.#all(type.types);
  }
  protected override visitLateBound(type: LateBoundType): readonly string[] {
    return [...this.#all(type.args), ...this.visit(type.returnType)];
  }
  protected override visitCtor(type: CtorType): readonly string[] {
    return [...this.#all(type.args), ...this.visit(type.instanceType)];
  }
  protected override visitPlaceholder(_type: PlaceholderType): readonly string[] {
    return [];
  }
  protected override visitTag(type: TagType): readonly string[] {
    return this.visit(type.type);
  }
  protected override visitObject(type: ObjectType): readonly string[] {
    return this.#all(Object.values(type.members));
  }
  protected override visitTypeLiteral(_type: TypeLiteralType): readonly string[] {
    return [];
  }

  protected override visitNamed(type: NamedType): readonly string[] {
    const own = type.from === 'global' && type.name === 'default'
      ? ['global:default names nothing — give the export a name, or a `from` other than global']
      : [];
    return [...own, ...this.#all(type.genericTypes)];
  }

  #all(types: readonly Type[]): readonly string[] {
    return types.flatMap(type => this.visit(type));
  }
}

export const typeValidatorVisitor = new TypeValidatorVisitor();
