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
  | NominalType
  | TagType;
/** A type carrying a name to be looked up under — reached through a package, or already in scope. */
export type NominalType =
  | GlobalType
  | ImportType;
/** Types that name every registration of one element type, whatever protocol they hand it back by */
export type AggregateType =
  | ArrayType
  | AsyncIterableType
  | AsyncType
  | IterableType;
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

export interface AsyncIterableType extends AggregateBase<'asyncIterable'> {}

/** A value delivered later — the element awaited rather than enumerated. */
export interface AsyncType extends AggregateBase<'async'> {}

export interface ConstructorType extends TypeBase<'ctor'> {
  readonly args: readonly Type[];
  readonly instanceType: Type;
}

export interface FunctionType extends TypeBase<'func'> {
  readonly args: readonly Type[];
  readonly returnType: Type;
}

/** An open generic argument — a labeled hole standing for a type bound later. */
export interface GenericType extends TypeBase<'generic'> {
  readonly label: string;
}

/** A type the ambient scope already carries — `string`, `Date`, `Promise<T>`; no import reaches it. */
export interface GlobalType extends NominalBase<'global'> {}

/** parallel to `import { ${name} } from "${from}";` */
export interface ImportType extends NominalBase<'import'> {
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

/** The fields a {@link Type.global} call names, whether it passes them positionally or as one object. */
export interface GlobalSpec {
  readonly name: string;
  readonly genericArgs?: readonly Type[];
}

/** The fields a {@link Type.import} call names, whether it passes them positionally or as one object. */
export interface ImportSpec {
  readonly name: string;
  readonly from: string;
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
  readonly type: Exclude<Type, TagType>;
  readonly tag: string;
}

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

/** The node kind one aggregate spelling names. */
type Aggregate<Name extends AggregateName> = Extract<AggregateType, { kind: typeof AGGREGATE_KINDS[Name]; }>;

type SpecArgs<Spec extends GlobalSpec> = Spec extends { genericArgs: infer Args extends readonly Type[]; } ? Args
  : readonly [];

// #endregion

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
function array(element: Type): ArrayType {
  return factory.array(element);
}

/**
 * Names `element` delivered later rather than at once.
 *
 * @remarks
 * The address is spellable and interned; nothing resolves it yet.
 */
function async(element: Type): AsyncType {
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
function asyncIterable(element: Type): AsyncIterableType {
  return factory.asyncIterable(element);
}

/** A constructor signature — `new (...args) => instanceType`, instance type first. */
function ctor(instanceType: Type, ...args: readonly Type[]): ConstructorType;
function ctor(spec: CtorSpec): ConstructorType;
function ctor(first: Type | CtorSpec, ...args: readonly Type[]): ConstructorType {
  return isNode(first) ? factory.ctor(first, args) : factory.ctor(first.instanceType, first.args ?? []);
}

/** Every token that has already been read, so a repeated request skips the lexer. */
const parsedTokens = new Map<string, Type>();

/**
 * Reads a type token back into the {@link Type} it spells — the inverse of {@link stringify}.
 *
 * @remarks
 * Some names carry a reserved meaning, and only unqualified: `Func<Return, ...Args>` and
 * `Ctor<Instance, ...Args>` spell the function and constructor kinds, `ServiceProvider` spells
 * the provider itself, and `Array<E>`, `Iterable<E>`, `AsyncIterable<E>` and `Async<E>` spell
 * the aggregates. Qualify one — `app:Func` — and it names an ordinary type, as do the
 * value-type names `string`, `number` and the rest. An unqualified name is a global one.
 *
 * @throws TypeParseError - when the token is malformed.
 */
function from(token: string): Type {
  return getOrCreate(parsedTokens, token, parseTypeString);
}

/**
 * A function signature — `(...args) => returnType`, return type first.
 *
 * @remarks
 * Identity is the shape alone: two signatures with the same return and argument types are the
 * same type, whichever functions they were read from.
 */
function func(returnType: Type, ...args: readonly Type[]): FunctionType;
function func(spec: FuncSpec): FunctionType;
function func(first: Type | FuncSpec, ...args: readonly Type[]): FunctionType {
  return isNode(first) ? factory.func(first, args) : factory.func(first.returnType, first.args ?? []);
}

/**
 * An open generic argument — a labeled hole standing for a type bound later. An open
 * registration ranges over it, and {@link substitute} or a successful {@link match} fills it.
 */
function generic(label: string): GenericType {
  return factory.generic(label);
}

/**
 * A type the ambient scope already carries, referenced by name. Generic arguments name the
 * constructed type `Name<Args>`; leave one open with {@link generic} to describe the generic type
 * itself.
 *
 * @remarks
 * An aggregate spelling carrying one argument — `Array`, `Iterable`, `AsyncIterable`, `Async` —
 * names that aggregate's own kind, so the kind node is the one identity the spelling has and every
 * door reaches it.
 */
function global<
  const Name extends string,
  const Args extends readonly Type[] = readonly [],
>(name: Name, genericArgs?: Args): Global<Name, Args>;
function global<const Spec extends GlobalSpec>(spec: Spec): Global<Spec['name'], SpecArgs<Spec>>;
function global(first: string | GlobalSpec, genericArgs: readonly Type[] = []): AggregateType | GlobalType {
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
function importType(name: string, from: string, genericArgs?: readonly Type[]): ImportType;
function importType(spec: ImportSpec): ImportType;
function importType(first: string | ImportSpec, from?: string, genericArgs: readonly Type[] = []): ImportType {
  return typeof first === 'string'
    ? factory.importType(first, from!, genericArgs)
    : factory.importType(first.name, first.from, first.genericArgs ?? []);
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
function intersection<Member extends Type>(type: Member): Member;
function intersection(first: Type, second: Type, ...rest: readonly Type[]): IntersectionType;
function intersection(...types: readonly Type[]): Type;
function intersection(...types: readonly Type[]): Type {
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
function iterable(element: Type): IterableType {
  return factory.iterable(element);
}

/**
 * A structural object type — each entry a member name and its type.
 *
 * @remarks
 * Members are keyed in sorted order, so writing them in another order names the same type.
 */
function object(members: Readonly<Record<string, Type>>): ObjectType {
  return factory.object(members);
}

/**
 * The given type wearing a tag — the address a keyed registration lives under. The same type
 * under a different tag is a different type.
 *
 * @throws TypeError - when the type is already tagged; a type wears at most one tag.
 */
function tag(type: Exclude<Type, TagType>, tag: string): TagType;
function tag(spec: TagSpec): TagType;
function tag(first: Type | TagSpec, tag?: string): TagType {
  return isNode(first) ? factory.tag(first, tag!) : factory.tag(first.type, first.tag);
}

/** A fixed-length, ordered list of member types — `[A, B, C]`. */
function tuple(...types: readonly Type[]): TupleType {
  return factory.tuple(types);
}

/** A single literal value as a type — `'on'`, `42`, `true`, `null`. */
function typeLiteral(value: LiteralValue): TypeLiteralType {
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
function union(...types: readonly Type[]): Type {
  return factory.union(types);
}

// #endregion

// #region ops

/**
 * Expands every union into the union-free alternatives it stands for — `(A | B, C)` becomes
 * `(A, C)` and `(B, C)`.
 */
function expand(type: Type): readonly Type[] {
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
function isIdentifier(type: Type): boolean {
  return isIdentifierType(type);
}

/**
 * Does `type` still hold a generic hole anywhere — an open registration, which serves a request
 * by capturing its fragments and so has nothing to build until one arrives?
 */
function isOpen(type: Type): boolean {
  return isOpenType(type);
}

/**
 * Does some instantiation of `pattern` extend `subject`? Success carries the instantiation —
 * one binding per generic label in the pattern.
 *
 * @throws Error - when `subject` itself holds a generic hole.
 */
function match(pattern: Type, subject: Type) {
  return matchType(pattern, subject);
}

/**
 * Does `proposed` satisfy `condition`? Success carries one binding per generic label in
 * the condition.
 *
 * @throws Error - when `proposed` itself holds a generic hole.
 */
function satisfies(proposed: Type, condition: Type) {
  return satisfiesType(proposed, condition);
}

/** Writes the type as its token spelling — the inverse of {@link from}. */
function stringify(type: Type): string {
  return stringifyType(type);
}

/** Replaces each generic hole whose label the map names; other holes stay. */
function substitute(type: Type, substitutions: ReadonlyMap<string, Type>): Type {
  return substituteType(type, substitutions);
}

/** Everything malformed about the type, one message per finding — empty means well-formed. */
function validate(type: Type): readonly string[] {
  return typeValidatorVisitor.visit(type);
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
export const Type = {
  array,
  async,
  asyncIterable,
  ctor,
  from,
  func,
  generic,
  global,
  import: importType,
  intersection,
  iterable,
  object,
  tag,
  tuple,
  typeLiteral,
  union,

  expand,
  isIdentifier,
  isOpen,
  match,
  satisfies,
  stringify,
  substitute,
  validate,
};

/** Tells a node from a spec object: every node carries a `kind`, no spec does. */
function isNode(value: Type | object): value is Type {
  return 'kind' in value;
}
