import { type IntersectionType, type LateBoundType, type NamedType, type ObjectType, type PlaceholderType, type TagType,
  type TupleType, Type, type TypeLiteralType, type UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

/**
 * Replaces each {@link PlaceholderType} whose label is a key of `substitutions` with the
 * mapped type. An unmatched placeholder is left alone.
 *
 * @remarks
 * One pass, no re-entry: a substituted type is spliced in as-is and never re-scanned, so
 * mapping `T` to a type containing `%T` terminates instead of looping.
 *
 * A subtree containing no substituted placeholder is returned by reference rather than
 * rebuilt, so identity survives everywhere nothing changed.
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
    const types = this.#all(type.types);
    return types === type.types ? type : Type.make.union(...types);
  }

  protected override visitIntersection(type: IntersectionType): Type {
    const types = this.#all(type.types);
    return types === type.types ? type : Type.make.intersection(...types);
  }

  protected override visitTuple(type: TupleType): Type {
    const types = this.#all(type.types);
    return types === type.types ? type : Type.make.tuple(...types);
  }

  protected override visitNamed(type: NamedType): Type {
    const genericTypes = this.#all(type.genericTypes);
    return genericTypes === type.genericTypes ? type : Type.make.named(type.name, type.from, genericTypes);
  }

  protected override visitLateBound(type: LateBoundType): Type {
    const args = this.#all(type.args);
    const returnType = this.visit(type.returnType);
    return args === type.args && returnType === type.returnType ? type : Type.make.latebound(returnType, ...args);
  }

  protected override visitTag(type: TagType): Type {
    const inner = this.visit(type.type);
    return inner === type.type ? type : Type.make.tag(inner, type.tag);
  }

  protected override visitObject(type: ObjectType): Type {
    const entries = Object.entries(type.members);
    const visited = entries.map(([key, member]) => [key, this.visit(member)] as const);
    return visited.every(([, member], index) => member === entries[index]![1])
      ? type
      : Type.make.object(Object.fromEntries(visited));
  }

  /** Visits each slot, handing back the original array when every slot came back unchanged. */
  #all(types: readonly Type[]): readonly Type[] {
    const visited = types.map(type => this.visit(type));
    return visited.every((type, index) => type === types[index]) ? types : visited;
  }
}

export function substituteType(type: Type, substitutions: ReadonlyMap<string, Type>): Type {
  return new SubstituteVisitor(substitutions).visit(type);
}
