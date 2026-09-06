import type { Func } from '@rhombus-toolkit/types';
import type { AbstractConstructorType, ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType, IntersectionType, IterableType, ListType, NamedType, ObjectType, TagType,
  TupleType, Type, TypeLiteralType, UnionType } from '../Type.js';
import { TypeVisitor } from './TypeVisitor.js';

/** Reaches every node of a type in pre-order and stops at the first the predicate accepts. */
export class FindVisitor extends TypeVisitor<Type | undefined> {
  readonly #predicate: Func<[Type], boolean>;
  readonly #seen = new Set<Type>();

  constructor(predicate: Func<[Type], boolean>) {
    super();
    this.#predicate = predicate;
  }

  public override visit(type: Type): Type | undefined {
    if (this.#seen.has(type)) {
      return undefined;
    }
    this.#seen.add(type);
    if (this.#predicate(type)) {
      return type;
    }
    return super.visit(type);
  }

  protected override visitArray(type: ArrayType): Type | undefined {
    return this.#element(type);
  }

  protected override visitCtor(type: ConstructorType): Type | undefined {
    return this.visit(type.signatures) ?? this.visit(type.instance);
  }

  protected override visitAbstractCtor(type: AbstractConstructorType): Type | undefined {
    return this.visit(type.signatures) ?? this.visit(type.instance);
  }

  protected override visitFunc(type: FunctionType): Type | undefined {
    return this.visit(type.signatures) ?? this.visit(type.return);
  }

  protected override visitGeneric(_type: GenericType): Type | undefined {
    return undefined;
  }

  protected override visitGlobal(type: GlobalType): Type | undefined {
    return this.#arguments(type);
  }

  protected override visitImported(type: ImportedType): Type | undefined {
    return this.#arguments(type);
  }

  protected override visitIntersection(type: IntersectionType): Type | undefined {
    return this.#first(type.members);
  }

  protected override visitIterable(type: IterableType): Type | undefined {
    return this.#element(type);
  }

  protected override visitObject(type: ObjectType): Type | undefined {
    return this.#first(Object.values(type.members));
  }

  protected override visitTag(type: TagType): Type | undefined {
    return this.visit(type.type);
  }

  protected override visitTuple(type: TupleType): Type | undefined {
    return this.#first(type.members) ?? (type.rest === undefined ? undefined : this.visit(type.rest));
  }

  protected override visitTypeLiteral(_type: TypeLiteralType): Type | undefined {
    return undefined;
  }

  protected override visitUnion(type: UnionType): Type | undefined {
    return this.#first(type.members);
  }

  #arguments(type: NamedType): Type | undefined {
    return this.#first(type.genericArgs);
  }

  #element(type: ListType): Type | undefined {
    return this.visit(type.element);
  }

  #first(types: readonly Type[]): Type | undefined {
    return Iterator.from(types).map(type => this.visit(type)).find(found => found !== undefined);
  }
}
