import { typeEquals } from './EqualsVisitor.js';
import type { CtorType, FunctionType, IntersectionType, NamedType, ObjectType, PlaceholderType, TagType, TupleType,
  Type, TypeLiteralType, UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

/** Failure carries nothing; success carries one entry per placeholder label in the condition. */

type Predicate = (proposed: Type) => boolean;

/** The global type a bare literal widens to, so `33` can satisfy `number`. */
const LITERAL_BASE: Readonly<Record<string, string>> = { string: 'string', number: 'number', bigint: 'bigint',
  boolean: 'boolean' };

/** True when any placeholder appears anywhere in the tree. */
class PlaceholderScanner extends TypeVisitor<boolean> {
  protected override visitPlaceholder(_type: PlaceholderType): boolean {
    return true;
  }
  protected override visitTypeLiteral(_type: TypeLiteralType): boolean {
    return false;
  }
  protected override visitUnion(type: UnionType): boolean {
    return type.types.some(member => this.visit(member));
  }
  protected override visitIntersection(type: IntersectionType): boolean {
    return type.types.some(member => this.visit(member));
  }
  protected override visitTuple(type: TupleType): boolean {
    return type.types.some(member => this.visit(member));
  }
  protected override visitFunction(type: FunctionType): boolean {
    return type.args.some(arg => this.visit(arg)) || this.visit(type.returnType);
  }
  protected override visitCtor(type: CtorType): boolean {
    return type.args.some(arg => this.visit(arg)) || this.visit(type.instanceType);
  }
  protected override visitNamed(type: NamedType): boolean {
    return type.genericTypes.some(arg => this.visit(arg));
  }
  protected override visitObject(type: ObjectType): boolean {
    return Object.values(type.members).some(member => this.visit(member));
  }
  protected override visitTag(type: TagType): boolean {
    return this.visit(type.type);
  }
}

const placeholderScanner = new PlaceholderScanner();

/**
 * Assignability, in the sense of a TypeScript `extends` clause: does `proposed` fit where
 * `condition` is required.
 *
 * @remarks
 * `visit` dispatches on the CONDITION and returns a predicate over the proposed type; the
 * rules that belong to the proposed side (a proposed union must satisfy on every member)
 * are applied by `match` before dispatching.
 *
 * A placeholder in the condition matches anything and records what it matched. A label
 * appearing twice must capture equal types both times, so `Pair<%T, %T>` rejects mismatched
 * arguments.
 */
class SatisfiesVisitor extends TypeVisitor<Predicate> {
  readonly captures = new Map<string, Type>();

  /** Entry point: applies the proposed-side rules, then dispatches on the condition. */
  match(proposed: Type, condition: Type): boolean {
    if (condition.kind === 'placeholder') {
      return this.capture(condition.label, proposed);
    }
    if (proposed.kind === 'union') {
      return proposed.types.every(member => this.match(member, condition));
    }
    if (proposed.kind === 'intersection' && condition.kind !== 'intersection') {
      return proposed.types.some(member => this.match(member, condition));
    }
    return this.visit(condition)(proposed);
  }

  protected override visitPlaceholder(type: PlaceholderType): Predicate {
    return proposed => this.capture(type.label, proposed);
  }

  protected override visitUnion(type: UnionType): Predicate {
    return proposed => type.types.some(member => this.#attempt(proposed, member));
  }

  protected override visitIntersection(type: IntersectionType): Predicate {
    return proposed => type.types.every(member => this.match(proposed, member));
  }

  protected override visitTuple(type: TupleType): Predicate {
    return proposed =>
      proposed.kind === 'tuple'
      && proposed.types.length === type.types.length
      && type.types.every((member, index) => this.match(proposed.types[index]!, member));
  }

  protected override visitFunction(type: FunctionType): Predicate {
    return proposed =>
      proposed.kind === 'function' && proposed.args.length === type.args.length // Parameters are contravariant: the condition's parameter must fit the proposed one.
      && type.args.every((arg, index) => this.match(arg, proposed.args[index]!))
      && this.match(proposed.returnType, type.returnType);
  }

  protected override visitCtor(type: CtorType): Predicate {
    return proposed =>
      proposed.kind === 'ctor' && proposed.args.length === type.args.length // Parameters are contravariant: the condition's parameter must fit the proposed one.
      && type.args.every((arg, index) => this.match(arg, proposed.args[index]!))
      && this.match(proposed.instanceType, type.instanceType);
  }

  protected override visitNamed(type: NamedType): Predicate {
    return proposed => {
      if (proposed.kind === 'literal') {
        return type.from === 'global' && LITERAL_BASE[type.name] === typeof proposed.value;
      }
      return proposed.kind === 'named'
        && proposed.from === type.from
        && proposed.name === type.name
        && proposed.genericTypes.length === type.genericTypes.length
        && type.genericTypes.every((arg, index) => this.match(proposed.genericTypes[index]!, arg));
    };
  }

  protected override visitObject(type: ObjectType): Predicate {
    // Width subtyping: the proposed object may carry members the condition does not name.
    return proposed =>
      proposed.kind === 'object'
      && Object.entries(type.members).every(([key, member]) =>
        key in proposed.members && this.match(proposed.members[key]!, member)
      );
  }

  protected override visitTypeLiteral(type: TypeLiteralType): Predicate {
    return proposed => proposed.kind === 'literal' && Object.is(proposed.value, type.value);
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

  /** Binds a label, requiring any earlier binding of the same label to be the same type. */
  protected capture(label: string, captured: Type): boolean {
    const bound = this.captures.get(label);
    if (bound === undefined) {
      this.captures.set(label, captured);
      return true;
    }
    return typeEquals(bound, captured);
  }

  /** Tries one branch of a condition union, rolling captures back when it fails. */
  #attempt(proposed: Type, condition: Type): boolean {
    const snapshot = new Map(this.captures);
    if (this.match(proposed, condition)) {
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
 * The pattern-match sibling of {@link SatisfiesVisitor}: the PROPOSED side is a pattern whose
 * placeholders capture the condition's fragments, while the subtyping direction is unchanged —
 * pattern-instantiated extends condition.
 *
 * @remarks
 * Only the proposed-placeholder interception is added here. In variance-flipped sub-positions
 * (function/ctor parameters) the recursion swaps the sides, so a pattern placeholder arrives as
 * the CONDITION of that sub-match — the inherited condition-placeholder branch captures it, and
 * the shared {@link captures} map keeps repeated labels consistent across both.
 */
class PatternMatchVisitor extends SatisfiesVisitor {
  override match(proposed: Type, condition: Type): boolean {
    if (proposed.kind === 'placeholder') {
      return this.capture(proposed.label, condition);
    }
    return super.match(proposed, condition);
  }
}

export function satisfiesType(proposed: Type, condition: Type): [satisfied: false] | [satisfied: true,
  placeholders: Map<string, Type>] {
  if (placeholderScanner.visit(proposed)) {
    throw new Error('satisfies: the proposed type may not contain placeholders');
  }
  const visitor = new SatisfiesVisitor();
  return visitor.match(proposed, condition) ? [true, visitor.captures] : [false];
}

/**
 * Does some instantiation of {@link pattern} extend {@link subject}? Success carries the
 * instantiation: one entry per placeholder label in the pattern.
 */
export function matchType(pattern: Type, subject: Type): [matched: false] | [matched: true,
  placeholders: Map<string, Type>] {
  if (placeholderScanner.visit(subject)) {
    throw new Error('match: the subject type may not contain placeholders');
  }
  const visitor = new PatternMatchVisitor();
  return visitor.match(pattern, subject) ? [true, visitor.captures] : [false];
}
