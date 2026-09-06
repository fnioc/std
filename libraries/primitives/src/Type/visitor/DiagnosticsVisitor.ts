import type { AbstractConstructorType, ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType, IntersectionType, IterableType, NamedType, ObjectType, TagType, TupleType, Type,
  TypeDiagnostic, TypeLiteralType, TypeRule, UnionType } from '../Type.js';
import { TypeVisitor } from './TypeVisitor.js';

/** Reaches every node of a type once, running every rule at each and collecting what they report. */
export class DiagnosticsVisitor extends TypeVisitor<void> {
  readonly #rules: readonly TypeRule[];
  readonly #reported: TypeDiagnostic[] = [];
  readonly #seen = new Set<Type>();

  constructor(rules: Iterable<TypeRule>) {
    super();
    this.#rules = Array.from(rules);
  }

  /** What the rules reported, in the order the walk produced it. */
  get diagnostics(): TypeDiagnostic[] {
    return this.#reported;
  }

  public override visit(type: Type): void {
    if (this.#seen.has(type)) {
      return;
    }
    this.#seen.add(type);
    this.#reported.push(
      ...Iterator.from(this.#rules)
        .map(rule => {
          const message = rule.check(type);
          return message === undefined ? undefined : { id: rule.id, level: rule.level, type, message };
        })
        .filter(diagnostic => diagnostic !== undefined),
    );
    super.visit(type);
  }

  protected override visitArray(type: ArrayType): void {
    this.visit(type.element);
  }

  protected override visitCtor(type: ConstructorType): void {
    this.visit(type.signatures);
    this.visit(type.instance);
  }

  protected override visitAbstractCtor(type: AbstractConstructorType): void {
    this.visit(type.signatures);
    this.visit(type.instance);
  }

  protected override visitFunc(type: FunctionType): void {
    this.visit(type.signatures);
    this.visit(type.return);
  }

  protected override visitGeneric(_type: GenericType): void {
  }

  protected override visitGlobal(type: GlobalType): void {
    this.#arguments(type);
  }

  protected override visitImported(type: ImportedType): void {
    this.#arguments(type);
  }

  protected override visitIntersection(type: IntersectionType): void {
    this.#each(type.members);
  }

  protected override visitIterable(type: IterableType): void {
    this.visit(type.element);
  }

  protected override visitObject(type: ObjectType): void {
    this.#each(Object.values(type.members));
  }

  protected override visitTag(type: TagType): void {
    this.visit(type.type);
  }

  protected override visitTuple(type: TupleType): void {
    this.#each(type.members);
    if (type.rest !== undefined) {
      this.visit(type.rest);
    }
  }

  protected override visitTypeLiteral(_type: TypeLiteralType): void {
  }

  protected override visitUnion(type: UnionType): void {
    this.#each(type.members);
  }

  #arguments(type: NamedType): void {
    this.#each(type.genericArgs);
  }

  #each(types: readonly Type[]): void {
    for (const type of types) {
      this.visit(type);
    }
  }
}
