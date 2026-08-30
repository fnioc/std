import type { AbstractConstructorType, ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType, IntersectionType, IterableType, ListType, NamedType, ObjectType, TagType,
  TupleType, Type, TypeLiteralType, UnionType } from '../Type.js';
import { TypeVisitor } from './TypeVisitor.js';

/** Reaches every position a generic hole can sit in, and stops at the first one it finds. */
export class IsOpenVisitor extends TypeVisitor<boolean> {
  protected override visitArray(type: ArrayType): boolean {
    return this.#element(type);
  }
  protected override visitCtor(type: ConstructorType): boolean {
    return this.#anyRow(type.signatures) || this.visit(type.instance);
  }
  protected override visitAbstractCtor(type: AbstractConstructorType): boolean {
    return this.#anyRow(type.signatures) || this.visit(type.instance);
  }
  protected override visitFunc(type: FunctionType): boolean {
    return this.#anyRow(type.signatures) || this.visit(type.return);
  }
  protected override visitGeneric(_type: GenericType): boolean {
    return true;
  }
  protected override visitGlobal(type: GlobalType): boolean {
    return this.#arguments(type);
  }
  protected override visitImported(type: ImportedType): boolean {
    return this.#arguments(type);
  }
  protected override visitIntersection(type: IntersectionType): boolean {
    return this.#any(type.members);
  }
  protected override visitIterable(type: IterableType): boolean {
    return this.#element(type);
  }
  protected override visitObject(type: ObjectType): boolean {
    return this.#any(Object.values(type.members));
  }
  protected override visitTag(type: TagType): boolean {
    return this.visit(type.type);
  }
  protected override visitTuple(type: TupleType): boolean {
    return this.#any(type.members);
  }
  protected override visitTypeLiteral(_type: TypeLiteralType): boolean {
    return false;
  }
  protected override visitUnion(type: UnionType): boolean {
    return this.#any(type.members);
  }

  #any(types: readonly Type[]): boolean {
    return types.some(type => this.visit(type));
  }
  #anyRow(signatures: Type.Signatures): boolean {
    return signatures.some(signature => this.#any(signature));
  }
  #arguments(type: NamedType): boolean {
    return this.#any(type.genericArgs);
  }
  #element(type: ListType): boolean {
    return this.visit(type.element);
  }
}
