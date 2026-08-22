import type { ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType, IntersectionType, IterableType, ObjectType, TagType, TupleType, Type, TypeLiteralType,
  UnionType } from '../Type.js';
import { isOpenType } from './IsOpenVisitor.js';
import { stringifyType } from './StringifyVisitor.js';
import { TypeVisitor } from './TypeVisitor.js';

/** What a match threads through the walk: the subject fragment in play, and the bindings so far. */
interface MatchContext {
  /** The subject fragment standing where the current pattern node does. */
  readonly subject: Type;
  /** One entry per hole label bound so far, shared by the whole walk. */
  readonly bindings: Map<string, Type>;
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
class MatchVisitor extends TypeVisitor<boolean, MatchContext> {
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
      && subject.abstract === pattern.abstract
      && this.#signaturesPairwise(pattern.signatures, subject.signatures, bindings)
      && this.visit(pattern.instance, { subject: subject.instance, bindings });
  }

  protected override visitFunc(pattern: FunctionType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'func'
      && this.#signaturesPairwise(pattern.signatures, subject.signatures, bindings)
      && this.visit(pattern.return, { subject: subject.return, bindings });
  }

  protected override visitGeneric(pattern: GenericType, { subject, bindings }: MatchContext): boolean {
    return bindings.getOrInsert(pattern.label, subject) === subject;
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
      && patternEntries.every(([name, member]) => name in subject.members && this.visit(member, { subject: subject.members[name]!, bindings }));
  }

  protected override visitTag(pattern: TagType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'tag'
      && subject.tag === pattern.tag
      && this.visit(pattern.type, { subject: subject.type, bindings });
  }

  protected override visitTuple(pattern: TupleType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'tuple' && this.#pairwise(pattern.members, subject.members, bindings);
  }

  protected override visitTypeLiteral(pattern: TypeLiteralType, { subject }: MatchContext): boolean {
    return subject.kind === 'literal' && Object.is(subject.value, pattern.value);
  }

  protected override visitUnion(pattern: UnionType, { subject, bindings }: MatchContext): boolean {
    return subject.kind === 'union' && this.#pairwise(pattern.members, subject.members, bindings);
  }

  /** Same count, and position `i` of the pattern matches position `i` of the subject. */
  #pairwise(patterns: readonly Type[], subjects: readonly Type[], bindings: Map<string, Type>): boolean {
    return patterns.length === subjects.length
      && patterns.every((pattern, index) => this.visit(pattern, { subject: subjects[index]!, bindings }));
  }

  /** Same signature count, signature `i` against signature `i`, each signature pairwise. */
  #signaturesPairwise(patterns: Type.Signatures, subjects: Type.Signatures, bindings: Map<string, Type>): boolean {
    return patterns.length === subjects.length
      && patterns.every((signature, index) => this.#pairwise(signature, subjects[index]!, bindings));
  }
}

const matchVisitor = new MatchVisitor();

/**
 * Does some instantiation of {@link candidate} equal {@link constraint}? Success carries the
 * instantiation: one entry per generic label in the candidate.
 */
export function matchType(candidate: Type, constraint: Type): [matched: false] | [matched: true, generics: Map<string, Type>] {
  if (isOpenType(constraint)) {
    throw new Error(`match: the constraint type may not contain generic holes — got ${stringifyType(constraint)}`);
  }
  // Interned identity IS the closed-candidate match; the walk exists for the holes.
  if (candidate === constraint) {
    return [true, new Map()];
  }
  const bindings = new Map<string, Type>();
  return matchVisitor.visit(candidate, { subject: constraint, bindings }) ? [true, bindings] : [false];
}
