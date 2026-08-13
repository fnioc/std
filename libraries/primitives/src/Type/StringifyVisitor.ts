import { escapeSegment } from './internals/grammar.js';
import type { CtorType, FunctionType, IntersectionType, NamedType, ObjectType, PlaceholderType, TagType, TupleType,
  Type, TypeLiteralType, UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

/**
 * How tightly a spelling binds. A child rendered at a level below the one its position demands is
 * parenthesized, so nesting survives the round trip through {@link Type.from}.
 */
const Precedence = {
  /** `(a) => b` and `new (a) => b`, both of which run to the end of whatever follows. */
  arrow: 0,
  union: 1,
  intersection: 2,
  tag: 3,
  /** Anything self-delimiting: names, tuples, object types, literals, placeholders. */
  primary: 4,
} as const;
type Precedence = typeof Precedence[keyof typeof Precedence];

/** Renders a {@link Type} as its source-level spelling — `@rhombus-std/di.core:Foo<string | [number, pkg:something]>`. */
class StringifyVisitor extends TypeVisitor<string, Precedence> {
  protected override visitCtor(type: CtorType, minimum: Precedence): string {
    return this.#parenthesize(
      `new (${this.#list(type.args)}) => ${this.visit(type.instanceType, Precedence.arrow)}`,
      Precedence.arrow,
      minimum,
    );
  }
  protected override visitUnion(type: UnionType, minimum: Precedence): string {
    const members = type.members.map(member => this.visit(member, Precedence.intersection));
    return this.#parenthesize(members.join(' | '), Precedence.union, minimum);
  }
  protected override visitIntersection(type: IntersectionType, minimum: Precedence): string {
    const members = type.members.map(member => this.visit(member, Precedence.tag));
    return this.#parenthesize(members.join(' & '), Precedence.intersection, minimum);
  }
  protected override visitTuple(type: TupleType): string {
    return `[${this.#list(type.members)}]`;
  }
  protected override visitFunction(type: FunctionType, minimum: Precedence): string {
    return this.#parenthesize(
      `(${this.#list(type.args)}) => ${this.visit(type.returnType, Precedence.arrow)}`,
      Precedence.arrow,
      minimum,
    );
  }
  protected override visitNamed(type: NamedType): string {
    return this.#qualifier(type) + this.#genericTypes(type.genericArgs);
  }
  protected override visitObject(type: ObjectType): string {
    const members = Object.entries(type.members)
      .map(([key, member]) => `${escapeSegment(key)}: ${this.visit(member, Precedence.arrow)}`);
    return members.length ? `{ ${members.join('; ')} }` : '{}';
  }
  protected override visitTypeLiteral(type: TypeLiteralType): string {
    return this.#literal(type.value);
  }
  protected override visitPlaceholder(type: PlaceholderType): string {
    return `%${escapeSegment(type.label)}`;
  }
  protected override visitTag(type: TagType, minimum: Precedence): string {
    const tagged = `${this.visit(type.type, Precedence.tag)}#${escapeSegment(type.tag)}`;
    return this.#parenthesize(tagged, Precedence.tag, minimum);
  }

  #parenthesize(spelling: string, own: Precedence, minimum: Precedence): string {
    return own < minimum ? `(${spelling})` : spelling;
  }
  /** Comma-separated, in a position the surrounding brackets already delimit. */
  #list(types: readonly Type[]): string {
    return types.map(member => this.visit(member, Precedence.arrow)).join(', ');
  }
  #qualifier(type: NamedType): string {
    const name = escapeSegment(type.name, type.from === 'global');
    return type.from === 'global' ? name : `${escapeSegment(type.from)}:${name}`;
  }
  #genericTypes(types: readonly Type[]): string {
    return types.length ? `<${this.#list(types)}>` : '';
  }

  #literal(value: TypeLiteralType['value']): string {
    if (typeof value === 'string') {
      return JSON.stringify(value);
    }
    if (typeof value === 'bigint') {
      return `${value}n`;
    }
    if (Object.is(value, -0)) {
      return '-0';
    }
    return String(value);
  }
}

const stringifyVisitor = new StringifyVisitor();

/** A node is immutable once interned, so its spelling is computed once and kept. */
const spellings = new WeakMap<Type, string>();

export function stringifyType(type: Type): string {
  const known = spellings.get(type);
  if (known !== undefined) {
    return known;
  }
  const spelling = stringifyVisitor.visit(type, Precedence.arrow);
  spellings.set(type, spelling);
  return spelling;
}
