import { stringifyType } from './StringifyVisitor.js';
import type { AggregateType, ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType,
  IntersectionType, IterableType, ObjectType, TagType, TupleType, Type, TypeLiteralType, UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

class TypeValidatorVisitor extends TypeVisitor<readonly string[]> {
  protected override visitArray(type: ArrayType): readonly string[] {
    return this.#element(type);
  }
  protected override visitCtor(type: ConstructorType): readonly string[] {
    return [...this.#quantifiers(type.genericArgs), ...this.#all(type.args), ...this.visit(type.instanceType)];
  }
  protected override visitFunc(type: FunctionType): readonly string[] {
    return [...this.#quantifiers(type.genericArgs), ...this.#all(type.args), ...this.visit(type.returnType)];
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
  protected override visitImported(type: ImportedType): readonly string[] {
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

  /** A signature quantifies holes; anything else in the list names nothing a request could close. */
  #quantifiers(quantifiers: readonly Type[]): readonly string[] {
    return quantifiers
      .filter(quantifier => quantifier.kind !== 'generic')
      .map(quantifier => `a signature quantifies generic holes, but ${stringifyType(quantifier)} is not one`);
  }

  #all(types: readonly Type[]): readonly string[] {
    return types.flatMap(type => this.visit(type));
  }
  #element(type: AggregateType): readonly string[] {
    return this.visit(type.element);
  }
}

export const typeValidatorVisitor = new TypeValidatorVisitor();
