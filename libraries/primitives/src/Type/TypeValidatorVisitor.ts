import type { AggregateType, ArrayType, AsyncIterableType, AsyncType, CtorType, FuncType, GenericType, IntersectionType,
  IterableType, NamedType, ObjectType, TagType, TupleType, Type, TypeLiteralType, UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

class TypeValidatorVisitor extends TypeVisitor<readonly string[]> {
  protected override visitArray(type: ArrayType): readonly string[] {
    return this.#element(type);
  }
  protected override visitAsync(type: AsyncType): readonly string[] {
    return this.#element(type);
  }
  protected override visitAsyncIterable(type: AsyncIterableType): readonly string[] {
    return this.#element(type);
  }
  protected override visitCtor(type: CtorType): readonly string[] {
    return [...this.#all(type.args), ...this.visit(type.instanceType)];
  }
  protected override visitFunc(type: FuncType): readonly string[] {
    return [...this.#all(type.args), ...this.visit(type.returnType)];
  }
  protected override visitGeneric(_type: GenericType): readonly string[] {
    return [];
  }
  protected override visitIntersection(type: IntersectionType): readonly string[] {
    return this.#all(type.members);
  }
  protected override visitIterable(type: IterableType): readonly string[] {
    return this.#element(type);
  }
  protected override visitObject(type: ObjectType): readonly string[] {
    return this.#all(Object.values(type.members));
  }
  protected override visitTag(type: TagType): readonly string[] {
    return this.visit(type.type);
  }
  protected override visitTuple(type: TupleType): readonly string[] {
    return this.#all(type.members);
  }
  protected override visitTypeLiteral(_type: TypeLiteralType): readonly string[] {
    return [];
  }
  protected override visitUnion(type: UnionType): readonly string[] {
    return this.#all(type.members);
  }

  protected override visitNamed(type: NamedType): readonly string[] {
    const own = type.from === 'global' && type.name === 'default'
      ? ['global:default names nothing — give the export a name, or a `from` other than global']
      : [];
    return [...own, ...this.#all(type.genericArgs)];
  }

  #all(types: readonly Type[]): readonly string[] {
    return types.flatMap(type => this.visit(type));
  }
  #element(type: AggregateType): readonly string[] {
    return this.visit(type.element);
  }
}

export const typeValidatorVisitor = new TypeValidatorVisitor();
