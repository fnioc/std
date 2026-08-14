/**
 * The only place a {@link Type} node is built. Each factory canonicalizes its slots, then hands
 * them to {@link intern}, so two spellings of one type yield the same object and `===` decides
 * equality everywhere downstream.
 */

import type { Func } from '@rhombus-toolkit/func';
import { stringifyType } from '../StringifyVisitor.js';
import type { AggregateType, ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType,
  IntersectionType, IterableType, LiteralValue, ObjectType, TagType, TupleType, Type, TypeBrand, TypeLiteralType,
  TypeSignatures, UnionType } from '../Type.js';
import { TypeVisitor } from '../TypeVisitor.js';
import { type AggregateName, GLOBAL_QUALIFIER, isAggregateName } from './grammar.js';
import { id, intern, isInterned } from './intern.js';
import { LITERAL_BASE } from './literal-base.js';

type Composite = 'union' | 'intersection';

/**
 * Stamps a built node as a {@link Type}. The brand exists only in the type system, so there is no
 * value to supply for it and no way to state that in an assertion; this is the one place that gap
 * is crossed, leaving every factory below fully checked against the shape it claims to build.
 */
function node<T extends Type>(raw: Omit<T, TypeBrand>): T {
  return raw as unknown as T;
}

/**
 * Members flattened, deduped, literal-subsumed and sorted, then collapsed when one member is left —
 * the readings TypeScript itself gives a union, where `A | (B | A)` and `B | A` are one type.
 *
 * @throws TypeError - when no member survives; a composite of nothing has no spelling.
 */
export function union(members: readonly Type[]): Type {
  return composite('union', members);
}

export function intersection(members: readonly Type[]): Type {
  return composite('intersection', members);
}

export function tuple(members: readonly Type[]): TupleType {
  const slots = members.map(adopt);
  return intern(`tuple\0${slots.map(id).join(',')}`, () => node<TupleType>({ kind: 'tuple', members: slots }));
}

export function func(returnType: Type, args: TypeSignatures): FunctionType {
  const result = adopt(returnType);
  const rows = adoptRows(args);
  return intern(
    `func\0${id(result)}\0${rowsKey(rows)}`,
    () => node<FunctionType>({ kind: 'func', args: rows, returnType: result }),
  );
}

export function ctor(instanceType: Type, args: TypeSignatures): ConstructorType {
  const instance = adopt(instanceType);
  const rows = adoptRows(args);
  return intern(
    `ctor\0${id(instance)}\0${rowsKey(rows)}`,
    () => node<ConstructorType>({ kind: 'ctor', args: rows, instanceType: instance }),
  );
}

/**
 * @throws TypeError - when no row survives; a callable answering to no call has no spelling, and
 * `[]` is the shape an author reaches for meaning the one call that takes nothing.
 */
function adoptRows(args: TypeSignatures): TypeSignatures {
  if (!args.length) {
    throw new TypeError('a callable answers to at least one call — write `[[]]` for one taking no parameters');
  }
  return args.map(row => row.map(adopt));
}

/**
 * The parameter rows as one key fragment. Each row is delimited by its own brackets rather than
 * joined with a separator, so a callable answering to one empty call and one answering to no call
 * at all are told apart.
 */
function rowsKey(rows: TypeSignatures): string {
  return rows.map(row => `(${row.map(id).join(',')})`).join('');
}

export function array(element: Type): ArrayType {
  const slot = adopt(element);
  return intern(`array\0${id(slot)}`, () => node<ArrayType>({ kind: 'array', element: slot }));
}

export function iterable(element: Type): IterableType {
  const slot = adopt(element);
  return intern(`iterable\0${id(slot)}`, () => node<IterableType>({ kind: 'iterable', element: slot }));
}

/**
 * The aggregate each reserved spelling mints. Keyed by {@link AggregateName}, so a spelling added
 * to the grammar without a factory here is a compile error rather than a name that reads as an
 * ordinary type.
 */
const AGGREGATES: Readonly<Record<AggregateName, Func<[Type], AggregateType>>> = {
  Array: array,
  Iterable: iterable,
};

/**
 * A reserved aggregate spelling carrying one argument mints that aggregate's own kind — the same
 * canonicalization {@link union} performs, so every door that can spell an aggregate lands on the
 * one interned node and a global spelling of an aggregate never exists.
 */
export function global(name: string, genericArgs: readonly Type[]): AggregateType | GlobalType {
  if (genericArgs.length === 1 && isAggregateName(name)) {
    return AGGREGATES[name](genericArgs[0]!);
  }
  const slots = genericArgs.map(adopt);
  return intern(
    `global\0${JSON.stringify(name)}\0${slots.map(id).join(',')}`,
    () => node<GlobalType>({ kind: 'global', name, genericArgs: slots }),
  );
}

/**
 * @throws TypeError - when `from` is the ambient scope, which no import reaches.
 */
export function imported(name: string, from: string, genericArgs: readonly Type[]): ImportedType {
  if (from === GLOBAL_QUALIFIER) {
    throw new TypeError(
      `'${GLOBAL_QUALIFIER}' is the ambient scope, not a package — spell ${name} as a global type instead`,
    );
  }
  const slots = genericArgs.map(adopt);
  return intern(
    `imported\0${JSON.stringify(from)}\0${JSON.stringify(name)}\0${slots.map(id).join(',')}`,
    () => node<ImportedType>({ kind: 'imported', from, name, genericArgs: slots }),
  );
}

/** Members keyed in sorted order, so the two spellings of one object type are one node. */
export function object(members: Readonly<Record<string, Type>>): ObjectType {
  const entries = Object.entries(members)
    .map(([key, member]) => [key, adopt(member)] as const)
    .sort(([left], [right]) => compare(left, right));
  const key = entries.map(([name, member]) => `${JSON.stringify(name)}:${id(member)}`).join(',');
  return intern(
    `object\0${key}`,
    () => node<ObjectType>({ kind: 'object', members: Object.fromEntries(entries) }),
  );
}

export function literal(value: LiteralValue): TypeLiteralType {
  return intern(literalKey(value), () => node<TypeLiteralType>({ kind: 'literal', value }));
}

export function generic(label: string): GenericType {
  return intern(
    `generic\0${JSON.stringify(label)}`,
    () => node<GenericType>({ kind: 'generic', label }),
  );
}

/**
 * @throws TypeError - when the type already carries a tag.
 */
export function tag(type: Type, name: string): TagType {
  const inner = adopt(type);
  if (inner.kind === 'tag') {
    throw new TypeError(`${stringifyType(inner)} already carries a tag — a type wears at most one`);
  }
  return intern(
    `tag\0${JSON.stringify(name)}\0${id(inner)}`,
    () => node<TagType>({ kind: 'tag', tag: name, type: inner }),
  );
}

function composite(kind: Composite, members: readonly Type[]): Type {
  const slots = canonicalMembers(kind, members);
  if (!slots.length) {
    throw new TypeError(`a ${kind} needs at least one member`);
  }
  if (slots.length === 1) {
    return slots[0]!;
  }
  return intern(
    `${kind}\0${slots.map(id).join(',')}`,
    () => node<UnionType | IntersectionType>({ kind, members: slots }),
  );
}

function canonicalMembers(kind: Composite, members: readonly Type[]): readonly Type[] {
  const flattened: Type[] = [];
  for (const member of members) {
    const slot = adopt(member);
    if (slot.kind === kind) {
      flattened.push(...slot.members);
    } else {
      flattened.push(slot);
    }
  }
  const distinct = [...new Set(flattened)];
  const reduced = kind === 'union' ? withoutSubsumedLiterals(distinct) : distinct;
  return [...reduced].sort((left, right) => compare(stringifyType(left), stringifyType(right)));
}

/**
 * Drops each literal whose primitive base stands beside it, so `string | "fast"` is `string`.
 * Nothing subsumes `undefined` or `null`, which is what keeps a nullish member available as the
 * fallback of an optional dependency.
 */
function withoutSubsumedLiterals(members: readonly Type[]): readonly Type[] {
  const bases = new Set(
    members
      .filter(member => member.kind === 'global')
      .map(member => LITERAL_BASE[member.name])
      .filter(base => base !== undefined),
  );
  if (!bases.size) {
    return members;
  }
  return members.filter(member => member.kind !== 'literal' || !bases.has(typeof member.value));
}

function literalKey(value: LiteralValue): string {
  switch (typeof value) {
    case 'string': {
      return `literal\0s${JSON.stringify(value)}`;
    }
    case 'bigint': {
      return `literal\0b${value}`;
    }
    case 'number': {
      return `literal\0n${Object.is(value, -0) ? '-0' : value}`;
    }
    default: {
      return `literal\0o${String(value)}`;
    }
  }
}

function compare(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/**
 * The canonical node for `type`, minting one when the table has not seen it: anything arriving
 * from outside — a cast, an untyped caller, a tree revived from JSON — joins the interned graph
 * before its identity is read. Each factory adopts its own slots, so the walk reaches the whole
 * subtree.
 */
export function adopt(type: Type): Type {
  if (isInterned(type)) {
    return type;
  }
  validate(type);
  return adoptVisitor.visit(type);
}

/** The fields each kind's factory reads, so a literal missing one is named rather than followed. */
const REQUIRED: Readonly<Record<Type['kind'], readonly string[]>> = {
  array: ['element'],
  ctor: ['instanceType', 'args'],
  func: ['returnType', 'args'],
  generic: ['label'],
  global: ['name', 'genericArgs'],
  imported: ['name', 'from', 'genericArgs'],
  intersection: ['members'],
  iterable: ['element'],
  literal: ['value'],
  object: ['members'],
  tag: ['tag', 'type'],
  tuple: ['members'],
  union: ['members'],
};

/**
 * Checks a literal names a kind and carries that kind's fields, before the walk reads any of them.
 * Presence alone — a field's own contents are checked by the factory that adopts it, one level down.
 *
 * @throws TypeError - when the kind is unknown, or a field the kind needs is absent.
 */
function validate(type: Type): void {
  if (typeof type !== 'object' || type === null) {
    throw new TypeError(`a type is written as an object naming its kind — got ${typeof type}`);
  }
  const required = REQUIRED[type.kind];
  if (required === undefined) {
    throw new TypeError(`${JSON.stringify(type.kind)} names no kind of type`);
  }
  for (const field of required) {
    if (!(field in type)) {
      throw new TypeError(`a ${type.kind} type carries ${required.join(', ')} — ${field} is missing`);
    }
  }
}

class AdoptVisitor extends TypeVisitor<Type> {
  protected override visitArray(type: ArrayType): Type {
    return array(type.element);
  }
  protected override visitCtor(type: ConstructorType): Type {
    return ctor(type.instanceType, type.args);
  }
  protected override visitFunc(type: FunctionType): Type {
    return func(type.returnType, type.args);
  }
  protected override visitGeneric(type: GenericType): Type {
    return generic(type.label);
  }
  protected override visitGlobal(type: GlobalType): Type {
    return global(type.name, type.genericArgs);
  }
  protected override visitImported(type: ImportedType): Type {
    return imported(type.name, type.from, type.genericArgs);
  }
  protected override visitIntersection(type: IntersectionType): Type {
    return intersection(type.members);
  }
  protected override visitIterable(type: IterableType): Type {
    return iterable(type.element);
  }
  protected override visitObject(type: ObjectType): Type {
    return object(type.members);
  }
  protected override visitTag(type: TagType): Type {
    return tag(type.type, type.tag);
  }
  protected override visitTuple(type: TupleType): Type {
    return tuple(type.members);
  }
  protected override visitTypeLiteral(type: TypeLiteralType): Type {
    return literal(type.value);
  }
  protected override visitUnion(type: UnionType): Type {
    return union(type.members);
  }
}

const adoptVisitor = new AdoptVisitor();
