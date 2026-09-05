import type { AbstractConstructorType, ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType, IntersectionType, IterableType, ObjectType, TagType, TupleType, Type,
  TypeLiteralType, UnionType } from '../Type.js';
import { TypeVisitor } from './TypeVisitor.js';

/** What a match threads through the walk: the subject fragment in play, and the bindings so far. */
export interface MatchContext {
  /** The subject fragment standing where the current pattern node does. */
  readonly subject: Type;
  /** One entry per hole label bound so far, shared by the whole walk. */
  readonly bindings: Record<string, Type>;
}

/**
 * Unification: is the subject the pattern with each generic hole filled in? Matching is identity
 * modulo holes — outside a hole, pattern and subject must be the same interned node, compared
 * structurally only as deep as the holes require.
 *
 * @remarks
 * `visit` dispatches on the PATTERN side; the subject and the bindings ride in the context, so the
 * visitor itself is stateless and one instance serves every walk. A hole binds whatever subject
 * fragment stands in its place, and a label appearing twice must bind the same type both times.
 * Everything else is same kind, same scalars, and children matched pairwise — no assignability:
 * no width subtyping, no literal widening to its primitive, no member search. With no choice
 * points, a failed branch has nothing to roll back.
 */
export class MatchVisitor extends TypeVisitor<boolean, MatchContext> {
  public override visit(pattern: Type): boolean;
  public override visit(pattern: Type, context: MatchContext): boolean;
  public override visit(pattern: Type, context?: MatchContext): boolean {
    if (pattern === context!.subject) {
      return true;
    }
    return super.visit(pattern, context!);
  }

  protected override visitArray(pattern: ArrayType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'array' && this.visit(pattern.element, { subject: subject.element, bindings });
  }

  protected override visitCtor(pattern: ConstructorType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'ctor'
      && this.visit(pattern.signatures, { subject: subject.signatures, bindings })
      && this.visit(pattern.instance, { subject: subject.instance, bindings });
  }

  protected override visitAbstractCtor(pattern: AbstractConstructorType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'abstract-ctor'
      && this.visit(pattern.signatures, { subject: subject.signatures, bindings })
      && this.visit(pattern.instance, { subject: subject.instance, bindings });
  }

  protected override visitFunc(pattern: FunctionType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'func'
      && this.visit(pattern.signatures, { subject: subject.signatures, bindings })
      && this.visit(pattern.return, { subject: subject.return, bindings });
  }

  protected override visitGeneric(pattern: GenericType, { subject, bindings }: MatchContext): boolean {
    return (bindings[pattern.label] ??= subject) === subject;
  }

  protected override visitGlobal(pattern: GlobalType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'global'
      && subject.name === pattern.name
      && this.#pairwise(pattern.genericArgs, subject.genericArgs, bindings);
  }

  protected override visitImported(pattern: ImportedType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'imported'
      && subject.from === pattern.from
      && subject.name === pattern.name
      && this.#pairwise(pattern.genericArgs, subject.genericArgs, bindings);
  }

  protected override visitIntersection(pattern: IntersectionType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'intersection' && this.#pairwise(pattern.members, subject.members, bindings);
  }

  protected override visitIterable(pattern: IterableType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'iterable' && this.visit(pattern.element, { subject: subject.element, bindings });
  }

  protected override visitObject(pattern: ObjectType, { subject, bindings }: MatchContext): boolean {
    if (subject.kind !== 'object') {
      return false;
    }
    const patternEntries = Object.entries(pattern.members);
    return patternEntries.length === Object.keys(subject.members).length
      && patternEntries.every(([name, member]) => Object.hasOwn(subject.members, name) && this.visit(member, { subject: subject.members[name]!, bindings }));
  }

  protected override visitTag(pattern: TagType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'tag'
      && subject.tag === pattern.tag
      && this.visit(pattern.type, { subject: subject.type, bindings });
  }

  protected override visitTuple(pattern: TupleType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'tuple'
      && this.#pairwise(pattern.members, subject.members, bindings)
      && this.#restSlot(pattern.rest, subject.rest, bindings);
  }

  protected override visitTypeLiteral(pattern: TypeLiteralType, { subject }: MatchContext): boolean {
    return subject.kind === 'literal' && Object.is(subject.value, pattern.value);
  }

  protected override visitUnion(pattern: UnionType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'union' && this.#pairwise(pattern.members, subject.members, bindings);
  }

  /** Same count, and position `i` of the pattern matches position `i` of the subject. */
  #pairwise(patterns: readonly Type[], subjects: readonly Type[], bindings: Record<string, Type>): boolean {
    return patterns.length === subjects.length
      && patterns.every((pattern, index) => this.visit(pattern, { subject: subjects[index]!, bindings }));
  }

  /** A tuple's rest slot: absent on both sides, or present on both and matching. */
  #restSlot(pattern: Type | undefined, subject: Type | undefined, bindings: Record<string, Type>): boolean {
    if (pattern === undefined || subject === undefined) {
      return pattern === subject;
    }
    return this.visit(pattern, { subject, bindings });
  }
}
