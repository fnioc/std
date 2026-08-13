import { getOrCreate } from '../utils/map.js';
import { expandUnionsVisitor } from './ExpandUnionsVisitor.js';
import * as factory from './internals/factories.js';
import { parseTypeString } from './internals/parser.js';
import { matchType, satisfiesType } from './SatisfiesVisitor.js';
import { stringifyType } from './StringifyVisitor.js';
import { substituteType } from './SubstituteVisitor.js';
import { typeValidatorVisitor } from './TypeValidatorVisitor.js';

// #region types

/** Types that are only useful as identifiers */
export type TypeIdentifier =
  | NamedType
  | PlaceholderType
  | TagType;
/** All Types */
export type Type =
  | CtorType
  | FunctionType
  | IntersectionType
  | ObjectType
  | TupleType
  | TypeIdentifier
  | TypeLiteralType
  | UnionType;

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

export interface CtorType extends TypeBase<'ctor'> {
  readonly args: readonly Type[];
  readonly instanceType: Type;
}

export interface FunctionType extends TypeBase<'function'> {
  readonly args: readonly Type[];
  readonly returnType: Type;
}

export interface IntersectionType extends TypeBase<'intersection'> {
  readonly members: readonly Type[];
}

export type LiteralValue = string | number | bigint | boolean | null | undefined;

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

export interface PlaceholderType extends TypeBase<'placeholder'> {
  readonly label: string;
}

export interface TagType extends TypeBase<'tag'> {
  readonly tag: string;
  readonly type: Type;
}

export interface TupleType extends TypeBase<'tuple'> {
  readonly members: readonly Type[];
}

/** Any type that `typeof` can resolve */
export interface TypeLiteralType extends TypeBase<'literal'> {
  readonly value: LiteralValue;
}

export interface UnionType extends TypeBase<'union'> {
  readonly members: readonly Type[];
}

// #endregion

/**
 * Every factory returns the interned node for its spelling: two calls that name the same type
 * return the SAME object, so `===` is type equality.
 */
export namespace Type {
  // #region factories

  /**
   * Names the aggregate of every registration of `element` as one indexable array.
   *
   * @remarks
   * The synthesized aggregate materializes at resolution — a real array, indexable immediately,
   * with nothing left to bind; a registration answering directly under this address is returned
   * as-is instead.
   *
   * The side that registers an element and the side that reads the aggregate must name the same
   * type, and nothing reports it when they don't: the lookup simply finds nothing. Both sides call
   * this, so they cannot drift.
   */
  export function array(element: Type): NamedType {
    return factory.named('Array', 'global', [element]);
  }

  /**
   * Names the aggregate of every registration of `element` as one asynchronous sequence.
   *
   * @remarks
   * The synthesized aggregate is late-bound — each element resolves as the async iteration
   * reaches it, not up front; a registration answering directly under this address is returned
   * as-is instead.
   *
   * The side that registers an element and the side that reads the aggregate must name the same
   * type, and nothing reports it when they don't: the lookup simply finds nothing. Both sides call
   * this, so they cannot drift.
   */
  export function asyncIterable(element: Type): NamedType {
    return factory.named('AsyncIterable', 'global', [element]);
  }

  /** A constructor signature — `new (...args) => instanceType`, instance type first. */
  export function ctor(instanceType: Type, ...args: readonly Type[]): CtorType {
    return factory.ctor(instanceType, args);
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
  export const from = (() => {
    /** Every token that has already been read, so a repeated request skips the lexer. */
    const parsed = new Map<string, Type>();

    return function from(token: string): Type {
      return getOrCreate(parsed, token, parseTypeString);
    };
  })();

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

  /**
   * Names the aggregate of every registration of `element` as one sequence.
   *
   * @remarks
   * The synthesized aggregate is late-bound — each element resolves as the iteration reaches it,
   * not up front; a registration answering directly under this address is returned as-is instead.
   *
   * The side that registers an element and the side that reads the aggregate must name the same
   * type, and nothing reports it when they don't: the lookup simply finds nothing. Both sides call
   * this, so they cannot drift.
   */
  export function iterable(element: Type): NamedType {
    return factory.named('Iterable', 'global', [element]);
  }

  /**
   * A type referenced by export name and home — parallel to `import { name } from '…'`, with
   * `'global'` naming the built-ins. Generic arguments name the constructed type `Name<Args>`;
   * leave one open with {@link placeholder} to describe the generic type itself.
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

  /**
   * An open generic argument — a labeled hole standing for a type bound later. An open
   * registration ranges over it, and {@link substitute} or a successful {@link match} fills it.
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

  /** A fixed-length, ordered list of member types — `[A, B, C]`. */
  export function tuple(...types: readonly Type[]): TupleType {
    return factory.tuple(types);
  }

  /** A single literal value as a type — `'on'`, `42`, `true`, `null`. */
  export function typeLiteral(value: LiteralValue): TypeLiteralType {
    return factory.literal(value);
  }

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

  // #endregion

  // #region ops

  /**
   * Expands every union into the union-free alternatives it stands for — `(A | B, C)` becomes
   * `(A, C)` and `(B, C)`.
   */
  export function expand(type: Type): readonly Type[] {
    return expandUnionsVisitor.visit(type);
  }

  /**
   * Does some instantiation of `pattern` extend `subject`? Success carries the instantiation —
   * one binding per placeholder label in the pattern.
   *
   * @throws Error - when `subject` itself contains a placeholder.
   */
  export function match(pattern: Type, subject: Type) {
    return matchType(pattern, subject);
  }

  /**
   * Does `proposed` satisfy `condition`? Success carries one binding per placeholder label in
   * the condition.
   *
   * @throws Error - when `proposed` itself contains a placeholder.
   */
  export function satisfies(proposed: Type, condition: Type) {
    return satisfiesType(proposed, condition);
  }

  /** Writes the type as its token spelling — the inverse of {@link from}. */
  export function stringify(type: Type): string {
    return stringifyType(type);
  }

  /** Replaces each placeholder whose label the map names; other placeholders stay. */
  export function substitute(type: Type, substitutions: ReadonlyMap<string, Type>): Type {
    return substituteType(type, substitutions);
  }

  /** Everything malformed about the type, one message per finding — empty means well-formed. */
  export function validate(type: Type): readonly string[] {
    return typeValidatorVisitor.visit(type);
  }

  // #endregion
}
