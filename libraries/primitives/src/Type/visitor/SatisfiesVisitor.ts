import type { Func } from '@rhombus-toolkit/func';
import { sequenceEquals } from '../../utils/iterable.js';
import { LITERAL_BASES } from '../factory/literal-base.js';
import type { ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType, IntersectionType, IterableType, ObjectType, TagType, TupleType, Type, TypeLiteralType,
  UnionType } from '../Type.js';
import { isOpenType } from './IsOpenVisitor.js';
import { stringifyType } from './StringifyVisitor.js';
import { TypeVisitor } from './TypeVisitor.js';

type Predicate = Func<[candidate: Type], boolean>;

/**
 * Assignability, in the sense of a TypeScript `extends` clause: does `candidate` fit where
 * `constraint` is required.
 *
 * @remarks
 * `visit` dispatches on the CONSTRAINT and returns a predicate over the candidate; the
 * rules that belong to the candidate side (a candidate union must satisfy on every member)
 * are applied by `match` before dispatching.
 *
 * A generic hole in the constraint matches anything and records what it matched. A label
 * appearing twice must capture equal types both times, so `Pair<%T, %T>` rejects mismatched
 * arguments.
 */
class SatisfiesVisitor extends TypeVisitor<Predicate> {
  readonly captures = new Map<string, Type>();

  /** Entry point: applies the candidate-side rules, then dispatches on the constraint. */
  match(candidate: Type, constraint: Type): boolean {
    if (constraint.kind === 'generic') {
      return this.capture(constraint.label, candidate);
    }
    if (candidate.kind === 'union') {
      return candidate.members.every(member => this.match(member, constraint));
    }
    if (candidate.kind === 'intersection' && constraint.kind !== 'intersection') {
      return candidate.members.some(member => this.match(member, constraint));
    }
    return this.visit(constraint)(candidate);
  }

  /**
   * An abstract candidate serves only an abstract request — an implementer nothing can `new`
   * cannot answer a request for one that can. A concrete candidate serves either.
   */
  protected override visitCtor(type: ConstructorType): Predicate {
    return candidate =>
      candidate.kind === 'ctor'
      && (!candidate.abstract || type.abstract)
      // Every constraint row must be served by some candidate row; parameters are contravariant,
      // so the constraint's parameter must fit the candidate's.
      && type.args.every(constraintRow =>
        candidate.args.some(candidateRow =>
          this.#rollingBackCapturesOnFailure(() => sequenceEquals(constraintRow, candidateRow, (constraintArg, candidateArg) => this.match(constraintArg, candidateArg)))
        )
      )
      && this.match(candidate.instance, type.instance);
  }

  protected override visitFunc(type: FunctionType): Predicate {
    return candidate =>
      candidate.kind === 'func'
      // Every constraint row must be served by some candidate row; parameters are contravariant,
      // so the constraint's parameter must fit the candidate's.
      && type.args.every(constraintRow =>
        candidate.args.some(candidateRow =>
          this.#rollingBackCapturesOnFailure(() => sequenceEquals(constraintRow, candidateRow, (constraintArg, candidateArg) => this.match(constraintArg, candidateArg)))
        )
      )
      && this.match(candidate.return, type.return);
  }

  protected override visitGeneric(type: GenericType): Predicate {
    return candidate => this.capture(type.label, candidate);
  }

  /** A literal satisfies the global name of its own primitive base — `'fast'` fits `string`. */
  protected override visitGlobal(type: GlobalType): Predicate {
    return candidate => {
      if (candidate.kind === 'literal') {
        return LITERAL_BASES.has(type.name) && type.name === typeof candidate.value;
      }
      return candidate.kind === 'global'
        && candidate.name === type.name
        && candidate.genericArgs.length === type.genericArgs.length
        && type.genericArgs.every((arg, index) => this.match(candidate.genericArgs[index]!, arg));
    };
  }

  protected override visitImported(type: ImportedType): Predicate {
    return candidate =>
      candidate.kind === 'imported'
      && candidate.from === type.from
      && candidate.name === type.name
      && candidate.genericArgs.length === type.genericArgs.length
      && type.genericArgs.every((arg, index) => this.match(candidate.genericArgs[index]!, arg));
  }

  protected override visitIntersection(type: IntersectionType): Predicate {
    return candidate => type.members.every(member => this.match(candidate, member));
  }

  protected override visitArray(type: ArrayType): Predicate {
    return candidate => candidate.kind === type.kind && this.match(candidate.element, type.element);
  }

  protected override visitIterable(type: IterableType): Predicate {
    return candidate => candidate.kind === type.kind && this.match(candidate.element, type.element);
  }

  protected override visitObject(type: ObjectType): Predicate {
    // Width subtyping: the candidate object may carry members the constraint does not name.
    return candidate =>
      candidate.kind === 'object'
      && Object.entries(type.members).every(([key, member]) => key in candidate.members && this.match(candidate.members[key]!, member));
  }

  /**
   * Tags match strictly, in both directions: only the same tag over a satisfying inner type
   * satisfies a tagged constraint, and — since every other constraint kind demands its own kind of
   * the candidate — a tagged type satisfies no untagged constraint. Tagging therefore yields a
   * type distinct from the one it wraps, not a refinement of it.
   */
  protected override visitTag(type: TagType): Predicate {
    return candidate => candidate.kind === 'tag' && candidate.tag === type.tag && this.match(candidate.type, type.type);
  }

  protected override visitTuple(type: TupleType): Predicate {
    return candidate =>
      candidate.kind === 'tuple'
      && candidate.members.length === type.members.length
      && type.members.every((member, index) => this.match(candidate.members[index]!, member));
  }

  protected override visitTypeLiteral(type: TypeLiteralType): Predicate {
    return candidate => candidate.kind === 'literal' && Object.is(candidate.value, type.value);
  }

  protected override visitUnion(type: UnionType): Predicate {
    return candidate => type.members.some(member => this.#rollingBackCapturesOnFailure(() => this.match(candidate, member)));
  }

  /** Binds a label, requiring any earlier binding of the same label to be the same type. */
  protected capture(label: string, captured: Type): boolean {
    return this.captures.getOrInsert(label, captured) === captured;
  }

  /** Runs one trial, keeping its bindings on success; a failed trial binds nothing. */
  #rollingBackCapturesOnFailure(trial: Func<[], boolean>): boolean {
    const snapshot = new Map(this.captures);
    if (trial()) {
      return true;
    }
    this.captures.clear();
    for (const [label, type] of snapshot) {
      this.captures.set(label, type);
    }
    return false;
  }
}

/**
 * The pattern-match sibling of {@link SatisfiesVisitor}: the CANDIDATE side is a pattern whose
 * generic holes capture the constraint's fragments, while the subtyping direction is unchanged —
 * pattern-instantiated extends constraint.
 *
 * @remarks
 * Only the candidate-hole interception is added here. In variance-flipped sub-positions
 * (function/ctor parameters) the recursion swaps the sides, so a pattern hole arrives as
 * the CONSTRAINT of that sub-match — the inherited constraint-hole branch captures it, and
 * the shared {@link captures} map keeps repeated labels consistent across both.
 */
class PatternMatchVisitor extends SatisfiesVisitor {
  override match(candidate: Type, constraint: Type): boolean {
    if (candidate.kind === 'generic') {
      return this.capture(candidate.label, constraint);
    }
    return super.match(candidate, constraint);
  }
}

export function satisfiesType(candidate: Type, constraint: Type): [satisfied: false] | [satisfied: true, generics: Map<string, Type>] {
  if (isOpenType(candidate)) {
    throw new Error(`satisfies: the candidate type may not contain generic holes — got ${stringifyType(candidate)}`);
  }
  const visitor = new SatisfiesVisitor();
  return visitor.match(candidate, constraint) ? [true, visitor.captures] : [false];
}

/**
 * Does some instantiation of {@link candidate} extend {@link constraint}? Success carries the
 * instantiation: one entry per generic label in the candidate.
 */
export function matchType(candidate: Type, constraint: Type): [matched: false] | [matched: true, generics: Map<string, Type>] {
  if (isOpenType(constraint)) {
    throw new Error(`match: the constraint type may not contain generic holes — got ${stringifyType(constraint)}`);
  }
  const visitor = new PatternMatchVisitor();
  return visitor.match(candidate, constraint) ? [true, visitor.captures] : [false];
}
