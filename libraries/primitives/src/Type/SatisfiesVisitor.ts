import type { Func } from '@rhombus-toolkit/func';
import { isOpenType } from './analyzers.js';
import { LITERAL_BASE } from './internals/literal-base.js';
import { stringifyType } from './StringifyVisitor.js';
import type { AggregateType, ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType,
  IntersectionType, IterableType, ObjectType, TagType, TupleType, Type, TypeLiteralType, TypeSignatures,
  UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

type Predicate = Func<[proposed: Type], boolean>;

/**
 * Assignability, in the sense of a TypeScript `extends` clause: does `proposed` fit where
 * `condition` is required.
 *
 * @remarks
 * `visit` dispatches on the CONDITION and returns a predicate over the proposed type; the
 * rules that belong to the proposed side (a proposed union must satisfy on every member)
 * are applied by `match` before dispatching.
 *
 * A generic hole in the condition matches anything and records what it matched. A label
 * appearing twice must capture equal types both times, so `Pair<%T, %T>` rejects mismatched
 * arguments.
 */
class SatisfiesVisitor extends TypeVisitor<Predicate> {
  readonly captures = new Map<string, Type>();

  /** Entry point: applies the proposed-side rules, then dispatches on the condition. */
  match(proposed: Type, condition: Type): boolean {
    if (condition.kind === 'generic') {
      return this.capture(condition.label, proposed);
    }
    if (proposed.kind === 'union') {
      return proposed.members.every(member => this.match(member, condition));
    }
    if (proposed.kind === 'intersection' && condition.kind !== 'intersection') {
      return proposed.members.some(member => this.match(member, condition));
    }
    return this.visit(condition)(proposed);
  }

  protected override visitArray(type: ArrayType): Predicate {
    return this.#aggregate(type);
  }

  protected override visitCtor(type: ConstructorType): Predicate {
    return proposed =>
      proposed.kind === 'ctor'
      && this.#rows(proposed.args, type.args)
      && this.match(proposed.instance, type.instance);
  }

  protected override visitFunc(type: FunctionType): Predicate {
    return proposed =>
      proposed.kind === 'func'
      && this.#rows(proposed.args, type.args)
      && this.match(proposed.return, type.return);
  }

  protected override visitGeneric(type: GenericType): Predicate {
    return proposed => this.capture(type.label, proposed);
  }

  /** A literal satisfies the global name of its own primitive base — `'fast'` fits `string`. */
  protected override visitGlobal(type: GlobalType): Predicate {
    return proposed => {
      if (proposed.kind === 'literal') {
        return LITERAL_BASE[type.name] === typeof proposed.value;
      }
      return proposed.kind === 'global'
        && proposed.name === type.name
        && this.#arguments(type.genericArgs, proposed.genericArgs);
    };
  }

  protected override visitImported(type: ImportedType): Predicate {
    return proposed =>
      proposed.kind === 'imported'
      && proposed.from === type.from
      && proposed.name === type.name
      && this.#arguments(type.genericArgs, proposed.genericArgs);
  }

  protected override visitIntersection(type: IntersectionType): Predicate {
    return proposed => type.members.every(member => this.match(proposed, member));
  }

  protected override visitIterable(type: IterableType): Predicate {
    return this.#aggregate(type);
  }

  protected override visitObject(type: ObjectType): Predicate {
    // Width subtyping: the proposed object may carry members the condition does not name.
    return proposed =>
      proposed.kind === 'object'
      && Object.entries(type.members).every(([key, member]) =>
        key in proposed.members && this.match(proposed.members[key]!, member)
      );
  }

  /**
   * Tags match strictly, in both directions: only the same tag over a satisfying inner type
   * satisfies a tagged condition, and — since every other condition kind demands its own kind of
   * the proposed type — a tagged type satisfies no untagged condition. Tagging therefore yields a
   * type distinct from the one it wraps, not a refinement of it.
   */
  protected override visitTag(type: TagType): Predicate {
    return proposed => proposed.kind === 'tag' && proposed.tag === type.tag && this.match(proposed.type, type.type);
  }

  protected override visitTuple(type: TupleType): Predicate {
    return proposed =>
      proposed.kind === 'tuple'
      && proposed.members.length === type.members.length
      && type.members.every((member, index) => this.match(proposed.members[index]!, member));
  }

  protected override visitTypeLiteral(type: TypeLiteralType): Predicate {
    return proposed => proposed.kind === 'literal' && Object.is(proposed.value, type.value);
  }

  protected override visitUnion(type: UnionType): Predicate {
    return proposed => type.members.some(member => this.#attempt(proposed, member));
  }

  /** Binds a label, requiring any earlier binding of the same label to be the same type. */
  protected capture(label: string, captured: Type): boolean {
    const bound = this.captures.get(label);
    if (bound === undefined) {
      this.captures.set(label, captured);
      return true;
    }
    return bound === captured;
  }

  /** One aggregate satisfies another of its own kind, covariantly in the element. */
  #aggregate(type: AggregateType): Predicate {
    return proposed => proposed.kind === type.kind && this.match(proposed.element, type.element);
  }

  /** Generic arguments match one for one, each covariantly. */
  #arguments(condition: readonly Type[], proposed: readonly Type[]): boolean {
    return condition.length === proposed.length && condition.every((arg, index) => this.match(proposed[index]!, arg));
  }

  /**
   * Every condition row needs an answer: each one must be served by some proposed row. Surplus
   * proposed rows are extra capability and never count against the match.
   */
  #rows(proposed: TypeSignatures, condition: TypeSignatures): boolean {
    return condition.every(row => proposed.some(candidate => this.#attemptRow(candidate, row)));
  }

  /** One row against one: same arity, each parameter contravariant. */
  #attemptRow(proposed: readonly Type[], condition: readonly Type[]): boolean {
    if (proposed.length !== condition.length) {
      return false;
    }
    const snapshot = new Map(this.captures);
    // Parameters are contravariant: the condition's parameter must fit the proposed one.
    if (condition.every((arg, index) => this.match(arg, proposed[index]!))) {
      return true;
    }
    this.#restore(snapshot);
    return false;
  }

  /** Tries one branch of a condition union, rolling captures back when it fails. */
  #attempt(proposed: Type, condition: Type): boolean {
    const snapshot = new Map(this.captures);
    if (this.match(proposed, condition)) {
      return true;
    }
    this.#restore(snapshot);
    return false;
  }

  /** Puts the capture map back the way `snapshot` left it, so a failed trial binds nothing. */
  #restore(snapshot: ReadonlyMap<string, Type>): void {
    this.captures.clear();
    for (const [label, type] of snapshot) {
      this.captures.set(label, type);
    }
  }
}

/**
 * The pattern-match sibling of {@link SatisfiesVisitor}: the PROPOSED side is a pattern whose
 * generic holes capture the condition's fragments, while the subtyping direction is unchanged —
 * pattern-instantiated extends condition.
 *
 * @remarks
 * Only the proposed-hole interception is added here. In variance-flipped sub-positions
 * (function/ctor parameters) the recursion swaps the sides, so a pattern hole arrives as
 * the CONDITION of that sub-match — the inherited condition-hole branch captures it, and
 * the shared {@link captures} map keeps repeated labels consistent across both.
 */
class PatternMatchVisitor extends SatisfiesVisitor {
  override match(proposed: Type, condition: Type): boolean {
    if (proposed.kind === 'generic') {
      return this.capture(proposed.label, condition);
    }
    return super.match(proposed, condition);
  }
}

export function satisfiesType(proposed: Type, condition: Type): [satisfied: false] | [satisfied: true,
  generics: Map<string, Type>] {
  if (isOpenType(proposed)) {
    throw new Error(`satisfies: the proposed type may not contain generic holes — got ${stringifyType(proposed)}`);
  }
  const visitor = new SatisfiesVisitor();
  return visitor.match(proposed, condition) ? [true, visitor.captures] : [false];
}

/**
 * Does some instantiation of {@link pattern} extend {@link subject}? Success carries the
 * instantiation: one entry per generic label in the pattern.
 */
export function matchType(pattern: Type, subject: Type): [matched: false] | [matched: true,
  generics: Map<string, Type>] {
  if (isOpenType(subject)) {
    throw new Error(`match: the subject type may not contain generic holes — got ${stringifyType(subject)}`);
  }
  const visitor = new PatternMatchVisitor();
  return visitor.match(pattern, subject) ? [true, visitor.captures] : [false];
}
