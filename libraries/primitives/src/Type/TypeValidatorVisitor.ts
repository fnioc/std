import type { AggregateType, ArrayType, AsyncIterableType, AsyncType, ConstructorType, FunctionType, GenericType,
  GlobalType, ImportType, IntersectionType, IterableType, ObjectType, TagType, TupleType, Type, TypeLiteralType,
  UnionType } from './Type.js';
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
  protected override visitCtor(type: ConstructorType): readonly string[] {
    return [...this.#all(type.args), ...this.visit(type.instanceType)];
  }
  protected override visitFunc(type: FunctionType): readonly string[] {
    return [...this.#all(type.args), ...this.visit(type.returnType)];
  }
  protected override visitGeneric(_type: GenericType): readonly string[] {
    return [];
  }
  protected override visitGlobal(type: GlobalType): readonly string[] {
    const own = type.name === 'default'
      ? ['`default` names nothing on its own — name the export, or reach it through the package it comes from']
      : [];
    return [...own, ...this.#all(type.genericArgs)];
  }
  protected override visitImport(type: ImportType): readonly string[] {
    return this.#all(type.genericArgs);
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

  #all(types: readonly Type[]): readonly string[] {
    return types.flatMap(type => this.visit(type));
  }
  #element(type: AggregateType): readonly string[] {
    return this.visit(type.element);
  }
}

export const typeValidatorVisitor = new TypeValidatorVisitor();
