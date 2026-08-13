import { getOrCreate } from '../utils/map.js';
import { isIdentifierType, isOpenType } from './analyzers.js';
import { expandUnionsVisitor } from './ExpandUnionsVisitor.js';
import * as factory from './internals/factories.js';
import type { AGGREGATE_KINDS, AggregateName } from './internals/grammar.js';
import { parseTypeString } from './internals/parser.js';
import { matchType, satisfiesType } from './SatisfiesVisitor.js';
import { stringifyType } from './StringifyVisitor.js';
import { substituteType } from './SubstituteVisitor.js';
import { typeValidatorVisitor } from './TypeValidatorVisitor.js';

// #region types

/** Types that are only useful as identifiers */
export type TypeIdentifier =
  | GenericType
  | NamedType
  | TagType;
/** Types that name every registration of one element type, whatever protocol they hand it back by */
export type AggregateType =
  | ArrayType
  | AsyncIterableType
  | AsyncType
  | IterableType;
/** All Types */
export type Type =
  | AggregateType
  | CtorType
  | FuncType
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

/** A member of {@link AggregateType}: one element type, handed back many times. */
interface AggregateBase<Kind extends string> extends TypeBase<Kind> {
  readonly element: Type;
}

export interface ArrayType extends AggregateBase<'array'> {}

export interface AsyncIterableType extends AggregateBase<'asyncIterable'> {}

/** A value delivered later — the element awaited rather than enumerated. */
export interface AsyncType extends AggregateBase<'async'> {}

export interface CtorType extends TypeBase<'ctor'> {
  readonly args: readonly Type[];
  readonly instanceType: Type;
}

export interface FuncType extends TypeBase<'func'> {
  readonly args: readonly Type[];
  readonly returnType: Type;
}

/** An open generic argument — a labeled hole standing for a type bound later. */
export interface GenericType extends TypeBase<'generic'> {
  readonly label: string;
}

export interface IntersectionType extends TypeBase<'intersection'> {
  readonly members: readonly Type[];
}

export interface IterableType extends AggregateBase<'iterable'> {}

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

/** The fields a {@link Type.named} call names, whether it passes them positionally or as one object. */
export interface NamedSpec {
  readonly name: string;
  readonly from?: string;
  readonly genericArgs?: readonly Type[];
}

export interface CtorSpec {
  readonly instanceType: Type;
  readonly args?: readonly Type[];
}

export interface FuncSpec {
  readonly returnType: Type;
  readonly args?: readonly Type[];
}

export interface TagSpec {
  readonly type: Type;
  readonly tag: string;
}

/**
 * What a {@link Type.named} spelling mints, as narrowly as the call can prove it: an aggregate
 * spelling under `global` carrying one argument is that aggregate's own kind, anything else is a
 * {@link NamedType}, and a name or argument list only known at runtime widens to the honest union
 * of both readings.
 */
type Named<Name extends string, From extends string, Args extends readonly Type[]> = string extends Name
  ? NamedType | AggregateType
  : Name extends AggregateName ? string extends From ? NamedType | Aggregate<Name>
    : From extends 'global' ? Args extends readonly [Type] ? Aggregate<Name>
      : number extends Args['length'] ? NamedType | Aggregate<Name>
      : NamedType
    : NamedType
  : NamedType;

/** The node kind one aggregate spelling names. */
type Aggregate<Name extends AggregateName> = Extract<AggregateType, { kind: typeof AGGREGATE_KINDS[Name]; }>;

type SpecFrom<Spec extends NamedSpec> = Spec extends { from: infer From extends string; } ? From : 'global';

type SpecArgs<Spec extends NamedSpec> = Spec extends { genericArgs: infer Args extends readonly Type[]; } ? Args
  : readonly [];

// #endregion

/**
 * Every factory returns the interned node for its spelling: two calls that name the same type
 * return the SAME object, so `===` is type equality.
 *
 * @remarks
 * A factory taking more than one field accepts its arguments either positionally or as one object
 * keyed by the node's own published fields — the same vocabulary, labeled at every nesting level,
 * with each default skippable on its own.
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
  export function array(element: Type): ArrayType {
    return factory.array(element);
  }

  /**
   * Names `element` delivered later rather than at once.
   *
   * @remarks
   * The address is spellable and interned; nothing resolves it yet.
   */
  export function async(element: Type): AsyncType {
    return factory.async(element);
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
  export function asyncIterable(element: Type): AsyncIterableType {
    return factory.asyncIterable(element);
  }

  /** A constructor signature — `new (...args) => instanceType`, instance type first. */
  export function ctor(instanceType: Type, ...args: readonly Type[]): CtorType;
  export function ctor(spec: CtorSpec): CtorType;
  export function ctor(first: Type | CtorSpec, ...args: readonly Type[]): CtorType {
    return isNode(first) ? factory.ctor(first, args) : factory.ctor(first.instanceType, first.args ?? []);
  }

  /**
   * Reads a type token back into the {@link Type} it spells — the inverse of {@link stringify}.
   *
   * @remarks
   * Some names carry a reserved meaning, and only unqualified: `Func<Return, ...Args>` and
   * `Ctor<Instance, ...Args>` spell the function and constructor kinds, `ServiceProvider` spells
   * the provider itself, and `Array<E>`, `Iterable<E>`, `AsyncIterable<E>` and `Async<E>` spell
   * the aggregates. Qualify one — `app:Func` — and it names an ordinary type, as do the
   * value-type names `string`, `number` and the rest. An absent qualifier means `global`.
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
  export function func(returnType: Type, ...args: readonly Type[]): FuncType;
  export function func(spec: FuncSpec): FuncType;
  export function func(first: Type | FuncSpec, ...args: readonly Type[]): FuncType {
    return isNode(first) ? factory.func(first, args) : factory.func(first.returnType, first.args ?? []);
  }

  /**
   * An open generic argument — a labeled hole standing for a type bound later. An open
   * registration ranges over it, and {@link substitute} or a successful {@link match} fills it.
   */
  export function generic(label: string): GenericType {
    return factory.generic(label);
  }

  /**
   * An intersection of the given members — satisfied only by satisfying all of them.
   *
   * @remarks
   * Canonicalized exactly as {@link union} is, minus the literal reduction: members are
   * flattened, deduped and ordered canonically, and a lone survivor is returned as itself rather
   * than as a one-member intersection. One member written therefore types as that member, and two
   * or more as an intersection — the exception being the same member written twice, which dedupes
   * to one node under a type saying otherwise. A member list only known at runtime types as the
   * whole of {@link Type}, since nothing can be counted.
   *
   * {@link union} narrows no further than `Type` for its own reason: a literal standing beside its
   * primitive base is dropped, so two written members routinely reduce to one.
   *
   * @throws TypeError - when no member survives.
   */
  export function intersection<Member extends Type>(type: Member): Member;
  export function intersection(first: Type, second: Type, ...rest: readonly Type[]): IntersectionType;
  export function intersection(...types: readonly Type[]): Type;
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
  export function iterable(element: Type): IterableType {
    return factory.iterable(element);
  }

  /**
   * A type referenced by export name and home — parallel to `import { name } from '…'`, with
   * `'global'` naming the built-ins. Generic arguments name the constructed type `Name<Args>`;
   * leave one open with {@link generic} to describe the generic type itself.
   *
   * @remarks
   * An aggregate spelling under `global` carrying one argument — `Array`, `Iterable`,
   * `AsyncIterable`, `Async` — names that aggregate's own kind, so the kind node is the one
   * identity the spelling has and every door reaches it.
   */
  export function named<
    const Name extends string,
    const From extends string = 'global',
    const Args extends readonly Type[] = readonly [],
  >(name: Name, from?: From, genericArgs?: Args): Named<Name, From, Args>;
  export function named<const Spec extends NamedSpec>(
    spec: Spec,
  ): Named<Spec['name'], SpecFrom<Spec>, SpecArgs<Spec>>;
  export function named(
    first: string | NamedSpec,
    from = 'global',
    genericArgs: readonly Type[] = [],
  ): NamedType | AggregateType {
    return typeof first === 'string'
      ? factory.named(first, from, genericArgs)
      : factory.named(first.name, first.from ?? 'global', first.genericArgs ?? []);
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
   * The given type wearing a tag — the address a keyed registration lives under. The same type
   * under a different tag is a different type.
   */
  export function tag(type: Type, tag: string): TagType;
  export function tag(spec: TagSpec): TagType;
  export function tag(first: Type | TagSpec, tag?: string): TagType {
    return isNode(first) ? factory.tag(first, tag!) : factory.tag(first.type, first.tag);
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
   * Is `type` address-only — a pure reference, with nothing of its own to build from?
   *
   * @remarks
   * An identifier can be registered and resolved like any other type, and misses when no
   * registration answers. Every other kind describes enough of itself to be composed from its
   * resolved parts instead.
   */
  export function isIdentifier(type: Type): boolean {
    return isIdentifierType(type);
  }

  /**
   * Does `type` still hold a generic hole anywhere — an open registration, which serves a request
   * by capturing its fragments and so has nothing to build until one arrives?
   */
  export function isOpen(type: Type): boolean {
    return isOpenType(type);
  }

  /**
   * Does some instantiation of `pattern` extend `subject`? Success carries the instantiation —
   * one binding per generic label in the pattern.
   *
   * @throws Error - when `subject` itself holds a generic hole.
   */
  export function match(pattern: Type, subject: Type) {
    return matchType(pattern, subject);
  }

  /**
   * Does `proposed` satisfy `condition`? Success carries one binding per generic label in
   * the condition.
   *
   * @throws Error - when `proposed` itself holds a generic hole.
   */
  export function satisfies(proposed: Type, condition: Type) {
    return satisfiesType(proposed, condition);
  }

  /** Writes the type as its token spelling — the inverse of {@link from}. */
  export function stringify(type: Type): string {
    return stringifyType(type);
  }

  /** Replaces each generic hole whose label the map names; other holes stay. */
  export function substitute(type: Type, substitutions: ReadonlyMap<string, Type>): Type {
    return substituteType(type, substitutions);
  }

  /** Everything malformed about the type, one message per finding — empty means well-formed. */
  export function validate(type: Type): readonly string[] {
    return typeValidatorVisitor.visit(type);
  }

  // #endregion
}

/** Tells a node from a spec object: every node carries a `kind`, no spec does. */
function isNode(value: Type | object): value is Type {
  return 'kind' in value;
}
