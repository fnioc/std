import { memo } from '../../toolkit/memo.js';
import { escapeSegment } from '../grammar.js';
import type { AbstractConstructorType, ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType, IntersectionType, IterableType, ObjectType, TagType, TupleType, Type,
  TypeLiteralType, UnionType } from '../Type.js';
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
  /** Anything self-delimiting: names, tuples, object types, literals, generic holes. */
  primary: 4,
} as const;
type Precedence = typeof Precedence[keyof typeof Precedence];

/** Renders a {@link Type} as its source-level spelling — `@rhombus-std/di.core:Foo<string | [number, pkg:something]>`. */
class StringifyVisitor extends TypeVisitor<string, Precedence> {
  protected override visitArray(type: ArrayType): string {
    return this.#listKind('Array', type);
  }
  protected override visitCtor(type: ConstructorType, minimum: Precedence): string {
    return this.#newArrow('', type, minimum);
  }
  protected override visitAbstractCtor(type: AbstractConstructorType, minimum: Precedence): string {
    return this.#newArrow('abstract ', type, minimum);
  }
  #newArrow(prefix: string, type: ConstructorType | AbstractConstructorType, minimum: Precedence): string {
    return this.#parenthesize(
      `${prefix}new (${this.#signatures(type.signatures)}) => ` + this.visit(type.instance, Precedence.arrow),
      Precedence.arrow,
      minimum,
    );
  }
  protected override visitFunc(type: FunctionType, minimum: Precedence): string {
    return this.#parenthesize(
      `(${this.#signatures(type.signatures)}) => ` + this.visit(type.return, Precedence.arrow),
      Precedence.arrow,
      minimum,
    );
  }
  protected override visitGeneric(type: GenericType): string {
    return `%${escapeSegment(type.label)}`;
  }
  /** The reserved names carry their reserved meaning here, so one used as a name is escaped. */
  protected override visitGlobal(type: GlobalType): string {
    return escapeSegment(type.name, true) + this.#genericTypes(type.genericArgs);
  }
  protected override visitImported(type: ImportedType): string {
    return `${escapeSegment(type.from)}:${escapeSegment(type.name)}${this.#genericTypes(type.genericArgs)}`;
  }
  protected override visitIntersection(type: IntersectionType, minimum: Precedence): string {
    const members = type.members.map(member => this.visit(member, Precedence.tag));
    return this.#parenthesize(members.join(' & '), Precedence.intersection, minimum);
  }
  protected override visitIterable(type: IterableType): string {
    return this.#listKind('Iterable', type);
  }
  protected override visitObject(type: ObjectType): string {
    const members = Object.entries(type.members)
      .map(([key, member]) => `${escapeSegment(key)}: ${this.visit(member, Precedence.arrow)}`);
    return members.length ? `{ ${members.join('; ')} }` : '{}';
  }
  protected override visitTag(type: TagType, minimum: Precedence): string {
    const tagged = `${this.visit(type.type, Precedence.tag)}#${escapeSegment(type.tag)}`;
    return this.#parenthesize(tagged, Precedence.tag, minimum);
  }
  protected override visitTuple(type: TupleType): string {
    return `[${this.#list(type.members)}]`;
  }
  protected override visitTypeLiteral(type: TypeLiteralType): string {
    return this.#literal(type.value);
  }
  protected override visitUnion(type: UnionType, minimum: Precedence): string {
    const members = type.members.map(member => this.visit(member, Precedence.intersection));
    return this.#parenthesize(members.join(' | '), Precedence.union, minimum);
  }

  /** The reserved spelling, unescaped: the name reads back as this kind rather than as a type. */
  #listKind(name: string, type: { readonly element: Type; }): string {
    return `${name}<${this.visit(type.element, Precedence.arrow)}>`;
  }
  #parenthesize(spelling: string, own: Precedence, minimum: Precedence): string {
    return own < minimum ? `(${spelling})` : spelling;
  }
  /** Comma-separated, in a position the surrounding brackets already delimit. */
  #list(types: readonly Type[]): string {
    return types.map(member => this.visit(member, Precedence.arrow)).join(', ');
  }
  /**
   * A callable's parameter signatures, semicolons between them — the same separator an overload set is
   * written with. One signature therefore spells as its parameters alone.
   */
  #signatures(signatures: Type.Signatures): string {
    return signatures.map(signature => this.#list(signature)).join('; ');
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

/** A node is immutable once interned, so its spelling is written once and kept. */
export const stringifyType = (() => {
  const visitor = new StringifyVisitor();

  return memo(function stringifyType(type: Type): string {
    return visitor.visit(type, Precedence.arrow);
  });
})();
