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

/** Types that name every registration of one element type, whatever protocol they hand it back by */
export type AggregateType =
  | ArrayType
  | IterableType;
/** A type carrying a name to be looked up under — reached through a package, or already in scope. */
export type NominalType =
  | GlobalType
  | ImportedType;
/** All Types */
export type Type =
  | AggregateType
  | ConstructorType
  | FunctionType
  | IntersectionType
  | ObjectType
  | TupleType
  | TypeIdentifier
  | TypeLiteralType
  | UnionType;
/** Types that are only useful as identifiers */
export type TypeIdentifier =
  | GenericType
  | NominalType
  | TagType;

/**
 * The parameter lists a callable answers to — one row per overload, in declaration order, each row
 * holding that overload's parameter types in order.
 *
 * @remarks
 * A callable that is not overloaded carries exactly one row, and one taking no parameters carries
 * one EMPTY row: a callable with no rows at all answers to no call.
 */
export type TypeSignatures = ReadonlyArray<readonly Type[]>;

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

/** A member of {@link NominalType}: an exported name, and the generic arguments closing it. */
interface NominalBase<Kind extends string> extends TypeBase<Kind> {
  /**
   * The exported name, or 'default' for default exports.
   */
  readonly name: string;
  readonly genericArgs: readonly Type[];
}

export interface ArrayType extends AggregateBase<'array'> {}

export interface ConstructorType extends TypeBase<'ctor'> {
  readonly args: TypeSignatures;
  readonly instanceType: Type;
  /**
   * The holes this signature quantifies, in declaration order — empty for a concrete one. A request
   * closes them positionally, exactly as a nominal type's arguments close. Quantifying a hole is
   * part of the type: `<%T>() => app:Box<%T>` and a signature that merely mentions `%T` are
   * different types.
   */
  readonly genericArgs: readonly Type[];
}

/**
 * The fields a {@link Type.ctor} call names, whether it passes them positionally or as one object.
 *
 * @remarks
 * `args` is the overload-shaped door: the object form spells every row, where the positional form
 * spells the one row its rest arguments make up.
 */
export interface CtorSpec {
  readonly instanceType: Type;
  readonly args?: TypeSignatures;
  readonly genericArgs?: readonly Type[];
}

/**
 * The fields a {@link Type.func} call names, whether it passes them positionally or as one object.
 *
 * @remarks
 * `args` is the overload-shaped door: the object form spells every row, where the positional form
 * spells the one row its rest arguments make up.
 */
export interface FuncSpec {
  readonly returnType: Type;
  readonly args?: TypeSignatures;
  readonly genericArgs?: readonly Type[];
}

export interface FunctionType extends TypeBase<'func'> {
  readonly args: TypeSignatures;
  readonly returnType: Type;
  /**
   * The holes this signature quantifies, in declaration order — empty for a concrete one. A request
   * closes them positionally, exactly as a nominal type's arguments close. Quantifying a hole is
   * part of the type: `<%T>() => app:Box<%T>` and a signature that merely mentions `%T` are
   * different types.
   */
  readonly genericArgs: readonly Type[];
}

/** An open generic argument — a labeled hole standing for a type bound later. */
export interface GenericType extends TypeBase<'generic'> {
  readonly label: string;
}

/** The fields a {@link Type.global} call names, whether it passes them positionally or as one object. */
export interface GlobalSpec {
  readonly name: string;
  readonly genericArgs?: readonly Type[];
}

/** A type the ambient scope already carries — `string`, `Date`, `Promise<T>`; no import reaches it. */
export interface GlobalType extends NominalBase<'global'> {}

/** The fields a {@link Type.imported} call names, whether it passes them positionally or as one object. */
export interface ImportedSpec {
  readonly name: string;
  readonly from: string;
  readonly genericArgs?: readonly Type[];
}

/** parallel to `import { ${name} } from "${from}";` */
export interface ImportedType extends NominalBase<'imported'> {
  /**
   * Literally the 'from' part in the import statement you would use to access this type (package and all).
   */
  readonly from: string;
}

export interface IntersectionType extends TypeBase<'intersection'> {
  readonly members: readonly Type[];
}

export interface IterableType extends AggregateBase<'iterable'> {}

export type LiteralValue = string | number | bigint | boolean | null | undefined;

export interface ObjectType extends TypeBase<'object'> {
  readonly members: Readonly<Record<string, Type>>;
}

/** The fields a {@link Type.tag} call names, whether it passes them positionally or as one object. */
export interface TagSpec {
  readonly type: Exclude<Type, TagType>;
  readonly tag: string;
}

export interface TagType extends TypeBase<'tag'> {
  readonly tag: string;
  readonly type: Exclude<Type, TagType>;
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
   * A constructor signature — `new (...args) => instanceType`, instance type first.
   *
   * @remarks
   * The positional form spells ONE parameter row, which is every non-overloaded constructor; a
   * constructor answering to several calls passes its rows as the spec's `args`, and one that
   * quantifies holes of its own passes them as the spec's `genericArgs`.
   *
   * @example
   * ```ts
   * Type.ctor(box, string);                                 // new (string) => box
   * Type.ctor({ instanceType: box, args: [[string], []] }); // new (string; ) => box
   * ```
   */
  export function ctor(instanceType: Type, ...args: readonly Type[]): ConstructorType;
  export function ctor(spec: CtorSpec): ConstructorType;
  export function ctor(first: Type | CtorSpec, ...args: readonly Type[]): ConstructorType {
    return isNode(first)
      ? factory.ctor(first, [args], [])
      : factory.ctor(first.instanceType, first.args ?? [[]], first.genericArgs ?? []);
  }

  /**
   * Reads a type token back into the {@link Type} it spells — the inverse of {@link stringify}.
   *
   * @remarks
   * Some names carry a reserved meaning, and only unqualified: `Func<Return, ...Args>` and
   * `Ctor<Instance, ...Args>` spell the function and constructor kinds, `ServiceProvider` spells
   * the provider itself, and `Array<E>` and `Iterable<E>` spell the aggregates. Qualify one —
   * `app:Func` — and it names an ordinary type, as do the value-type names `string`, `number` and
   * the rest. An unqualified name is a global one.
   *
   * A callable carrying its own quantifiers is written with them in front: `<%T>(%T) => app:Box<%T>`.
   * One answering to several calls writes its parameter rows semicolon-separated, in the one
   * parameter position — `(string; ) => app:Box` takes a string or nothing.
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
   * Identity is the shape alone: two signatures with the same return type, parameter rows and
   * quantifiers are the same type, whichever functions they were read from.
   *
   * The positional form spells ONE parameter row, which is every non-overloaded function; a
   * function answering to several calls passes its rows as the spec's `args`, and one that
   * quantifies holes of its own passes them as the spec's `genericArgs`.
   *
   * @example
   * ```ts
   * Type.func(box, string);                                // (string) => box
   * Type.func({ returnType: box, args: [[string], []] });  // (string; ) => box
   * ```
   */
  export function func(returnType: Type, ...args: readonly Type[]): FunctionType;
  export function func(spec: FuncSpec): FunctionType;
  export function func(first: Type | FuncSpec, ...args: readonly Type[]): FunctionType {
    return isNode(first)
      ? factory.func(first, [args], [])
      : factory.func(first.returnType, first.args ?? [[]], first.genericArgs ?? []);
  }

  /**
   * An open generic argument — a labeled hole standing for a type bound later. An open
   * registration ranges over it, and {@link substitute} or a successful {@link match} fills it.
   */
  export function generic(label: string): GenericType {
    return factory.generic(label);
  }

  /** The node kind one aggregate spelling names. */
  type Aggregate<Name extends AggregateName> = Extract<AggregateType, { kind: typeof AGGREGATE_KINDS[Name]; }>;

  /**
   * What a {@link Type.global} spelling mints, as narrowly as the call can prove it: an aggregate
   * spelling carrying one argument is that aggregate's own kind, anything else is a
   * {@link GlobalType}, and a name or argument list only known at runtime widens to the honest union
   * of both readings.
   */
  type Global<Name extends string, Args extends readonly Type[]> = string extends Name ? AggregateType | GlobalType
    : Name extends AggregateName ? Args extends readonly [Type] ? Aggregate<Name>
      : number extends Args['length'] ? Aggregate<Name> | GlobalType
      : GlobalType
    : GlobalType;

  /** The generic arguments a {@link GlobalSpec} names, or none when it leaves them out. */
  type SpecArgs<Spec extends GlobalSpec> = Spec extends { genericArgs: infer Args extends readonly Type[]; } ? Args
    : readonly [];

  /**
   * A type the ambient scope already carries, referenced by name. Generic arguments name the
   * constructed type `Name<Args>`; leave one open with {@link generic} to describe the generic type
   * itself.
   *
   * @remarks
   * An aggregate spelling carrying one argument — `Array` or `Iterable` — names that aggregate's own
   * kind, so the kind node is the one identity the spelling has and every door reaches it.
   */
  export function global<
    const Name extends string,
    const Args extends readonly Type[] = readonly [],
  >(name: Name, genericArgs?: Args): Global<Name, Args>;
  export function global<const Spec extends GlobalSpec>(spec: Spec): Global<Spec['name'], SpecArgs<Spec>>;
  export function global(first: string | GlobalSpec, genericArgs: readonly Type[] = []): AggregateType | GlobalType {
    return typeof first === 'string'
      ? factory.global(first, genericArgs)
      : factory.global(first.name, first.genericArgs ?? []);
  }

  /**
   * A type reached through a package — parallel to `import { name } from '…'`, `from` spelled as the
   * import statement spells it. Generic arguments name the constructed type `Name<Args>`; leave one
   * open with {@link generic} to describe the generic type itself.
   *
   * @throws TypeError - when `from` names the ambient scope rather than a package.
   */
  export function imported(name: string, from: string, genericArgs?: readonly Type[]): ImportedType;
  export function imported(spec: ImportedSpec): ImportedType;
  export function imported(first: string | ImportedSpec, from?: string,
    genericArgs: readonly Type[] = []): ImportedType {
    return typeof first === 'string'
      ? factory.imported(first, from!, genericArgs)
      : factory.imported(first.name, first.from, first.genericArgs ?? []);
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
   *
   * @throws TypeError - when the type is already tagged; a type wears at most one tag.
   */
  export function tag(type: Exclude<Type, TagType>, tag: string): TagType;
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

  /**
   * Replaces each generic hole whose label the map names; other holes stay.
   *
   * @remarks
   * A callable comes back a callable of the same kind — substitution reaches into its return or
   * instance type, its parameter rows and its quantifiers, none of which can change what it is —
   * so a caller holding one keeps its narrower type across the call.
   */
  export function substitute(type: ConstructorType, substitutions: ReadonlyMap<string, Type>): ConstructorType;
  export function substitute(type: FunctionType, substitutions: ReadonlyMap<string, Type>): FunctionType;
  export function substitute(type: Type, substitutions: ReadonlyMap<string, Type>): Type;
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
