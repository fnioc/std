import { expandUnionsVisitor } from './ExpandUnionsVisitor.js';
import * as factory from './internals/factories.js';
import { parseType } from './internals/parser.js';
import { matchType, satisfiesType } from './SatisfiesVisitor.js';
import { stringifyType } from './StringifyVisitor.js';
import { substituteType } from './SubstituteVisitor.js';
import { typeValidatorVisitor } from './TypeValidatorVisitor.js';

// #region types
export type TokenType =
  | UnionType
  | IntersectionType
  | TupleType
  | FunctionType
  | NamedType
  | ObjectType
  | TypeLiteralType
  | PlaceholderType
  | TagType;
export type Type = TokenType | CtorType;
export type ConstructableType = Exclude<Type, NamedType>;

/** Marks a node as one the intern table minted. Declared only — nothing carries it at runtime. */
declare const TYPE_BRAND: unique symbol;

/**
 * The brand's key, so the factories can name the shape they build: a node minus the mark it
 * cannot supply a runtime value for.
 */
export type TypeBrand = typeof TYPE_BRAND;

interface TypeBase<Kind extends string> {
  readonly kind: Kind;
  readonly [TYPE_BRAND]: void;
}

export interface UnionType extends TypeBase<'union'> {
  readonly members: readonly Type[];
}

export interface IntersectionType extends TypeBase<'intersection'> {
  readonly members: readonly Type[];
}

export interface TupleType extends TypeBase<'tuple'> {
  readonly members: readonly Type[];
}
export interface FunctionType extends TypeBase<'function'> {
  readonly args: readonly Type[];
  readonly returnType: Type;
}
export interface CtorType extends TypeBase<'ctor'> {
  readonly args: readonly Type[];
  readonly instanceType: Type;
}

/** parallel to `import { ${name} } from "${from}";` */
export interface NamedType extends TypeBase<'named'> {
  /**
   * Literally the 'from' part in the import statement you would use to access this type (package and all).
   * Use 'global' for built-in types.
   */
  readonly from: string;
  /**
   * The exported name, or 'default' for default exports.
   */
  readonly name: string;
  readonly genericArgs: readonly Type[];
}
export interface ObjectType extends TypeBase<'object'> {
  readonly members: Readonly<Record<string, Type>>;
}

export type LiteralValue = string | number | bigint | boolean | null | undefined;
/** Any type that `typeof` can resolve */
export interface TypeLiteralType extends TypeBase<'literal'> {
  readonly value: LiteralValue;
}

export interface PlaceholderType extends TypeBase<'placeholder'> {
  readonly label: string;
}

export interface TagType extends TypeBase<'tag'> {
  readonly tag: string;
  readonly type: Type;
}

// #endregion

/**
 * Every factory returns the interned node for its spelling: two calls that name the same type
 * return the SAME object, so `===` is type equality.
 */
export namespace Type {
  // #region factories

  /**
   * A union of the given members — satisfied by satisfying any one of them.
   *
   * @remarks
   * Members are flattened, deduped and ordered canonically, so `union(a, b)` and `union(b, a)`
   * name the same type; a literal standing beside its own primitive base is dropped, and a lone
   * surviving member is returned as itself rather than as a one-member union.
   *
   * @throws TypeError - when no member survives.
   */
  export function union(...types: readonly Type[]): Type {
    return factory.union(types);
  }
  /**
   * An intersection of the given members — satisfied only by satisfying all of them.
   *
   * @remarks
   * Canonicalized exactly as {@link union} is, minus the literal reduction.
   *
   * @throws TypeError - when no member survives.
   */
  export function intersection(...types: readonly Type[]): Type {
    return factory.intersection(types);
  }
  /** A fixed-length, ordered list of member types — `[A, B, C]`. */
  export function tuple(...types: readonly Type[]): TupleType {
    return factory.tuple(types);
  }
  /**
   * A function signature — `(...args) => returnType`, return type first.
   *
   * @remarks
   * Identity is the shape alone: two signatures with the same return and argument types are the
   * same type, whichever functions they were read from.
   */
  export function func(returnType: Type, ...args: readonly Type[]): FunctionType {
    return factory.func(returnType, args);
  }
  /** A constructor signature — `new (...args) => instanceType`, instance type first. */
  export function ctor(instanceType: Type, ...args: readonly Type[]): CtorType {
    return factory.ctor(instanceType, args);
  }
  /**
   * A type referenced by export name and home — parallel to `import { name } from '…'`, with
   * `'global'` naming the built-ins. Generic arguments name the constructed type `Name<Args>`.
   */
  export function named(name: string, from: string = 'global', genericTypes: readonly Type[] = []): NamedType {
    return factory.named(name, from, genericTypes);
  }
  /**
   * A structural object type — each entry a member name and its type.
   *
   * @remarks
   * Members are keyed in sorted order, so writing them in another order names the same type.
   */
  export function object(members: Readonly<Record<string, Type>>): ObjectType {
    return factory.object(members);
  }
  /** A single literal value as a type — `'on'`, `42`, `true`, `null`. */
  export function typeLiteral(value: LiteralValue): TypeLiteralType {
    return factory.literal(value);
  }
  /**
   * A labeled hole standing for a type bound later — an open registration ranges over it, and
   * {@link substitute} or a successful {@link match} fills it.
   */
  export function placeholder(label: string): PlaceholderType {
    return factory.placeholder(label);
  }
  /**
   * The given type wearing a tag — the address a keyed registration lives under. The same type
   * under a different tag is a different type.
   */
  export function tag(type: Type, tag: string): TagType {
    return factory.tag(type, tag);
  }

  /**
   * The aggregate of every registration of `element` — the type a container reads to collect them
   * all, rather than to resolve one.
   *
   * @remarks
   * The side that registers an element and the side that reads the aggregate must name the same
   * type, and nothing reports it when they don't: the lookup simply finds nothing. Both sides call
   * this, so they cannot drift.
   */
  export function collection(element: Type): NamedType {
    return factory.named('Iterable', 'global', [element]);
  }

  /**
   * Reads a type token back into the {@link Type} it spells — the inverse of {@link stringify}.
   *
   * @remarks
   * Three names carry a reserved meaning, and only unqualified: `Func<Return, ...Args>` and
   * `Ctor<Instance, ...Args>` spell the function and constructor kinds, and `ServiceProvider`
   * spells the provider itself. Qualify one — `app:Func` — and it names an ordinary type, as do
   * the value-type names `string`, `number` and the rest. An absent qualifier means `global`.
   *
   * @throws TypeParseError - when the token is malformed.
   */
  export function from(token: string): Type {
    const read = parsed.get(token);
    if (read !== undefined) {
      return read;
    }
    const type = parseType(token);
    parsed.set(token, type);
    return type;
  }
  /** Every token that has already been read, so a repeated request skips the lexer. */
  const parsed = new Map<string, Type>();
  // #endregion

  // #region ops
  /** Writes the type as its token spelling — the inverse of {@link from}. */
  export function stringify(type: Type): string {
    return stringifyType(type);
  }
  /** Everything malformed about the type, one message per finding — empty means well-formed. */
  export function validate(type: Type): readonly string[] {
    return typeValidatorVisitor.visit(type);
  }
  /**
   * Expands every union into the union-free alternatives it stands for — `(A | B, C)` becomes
   * `(A, C)` and `(B, C)`.
   */
  export function expand(type: Type): readonly Type[] {
    return expandUnionsVisitor.visit(type);
  }
  /** Replaces each placeholder whose label the map names; other placeholders stay. */
  export function substitute(type: Type, substitutions: ReadonlyMap<string, Type>): Type {
    return substituteType(type, substitutions);
  }
  /**
   * Does `proposed` satisfy `condition`? Success carries one binding per placeholder label in
   * the condition.
   */
  export function satisfies(proposed: Type, condition: Type) {
    return satisfiesType(proposed, condition);
  }
  /**
   * Does some instantiation of `pattern` extend `subject`? Success carries the instantiation —
   * one binding per placeholder label in the pattern.
   */
  export function match(pattern: Type, subject: Type) {
    return matchType(pattern, subject);
  }
  // #endregion
}
