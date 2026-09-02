/**
 * The only place a {@link Type} node is built. Each factory canonicalizes its slots, then hands
 * them to {@link intern}, so two spellings of one type yield the same object and `===` decides
 * equality everywhere downstream.
 */

import type { Func } from '@rhombus-toolkit/func';
import { GLOBAL_QUALIFIER, isListName, type ListName } from '../grammar.js';
import type { AbstractConstructorType, ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType, IntersectionType, IterableType, ListType, LiteralValue, ObjectType, TagType,
  TupleType, Type, TypeLiteralType, UnionType } from '../Type.js';
import { stringifyType } from '../visitor/StringifyVisitor.js';
import { TypeVisitor } from '../visitor/TypeVisitor.js';
import { id, intern, isInterned } from './intern.js';
import { LITERAL_BASES } from './literal-base.js';

type Composite = 'union' | 'intersection';

/**
 * Stamps a built node as a {@link Type}. The brand exists only in the type system, so there is no
 * value to supply for it and no way to state that in an assertion; this is the one place that gap
 * is crossed, leaving every factory below fully checked against the shape it claims to build.
 */
function node<T extends Type>(raw: Type.RawType<T>): T {
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

export function tuple(members: readonly Type[], rest: Type | undefined): TupleType {
  const slots = members.map(adopt);
  const restSlot = rest === undefined ? undefined : adopt(rest);
  return intern(
    `tuple\0${restSlot === undefined ? '' : id(restSlot)}\0${slots.map(id).join(',')}`,
    () => node<TupleType>({ kind: 'tuple', members: slots, rest: restSlot }),
  );
}

/**
 * The signatures a callable answers to, as one node. Each row is a {@link TupleType} (a fixed
 * argument list, open-length when it carries a rest slot) or a {@link ListType} (a signature that
 * is entirely a rest), and several rows are a {@link UnionType} of those.
 *
 * @remarks
 * Delegates to {@link union} for canonicalization, so a callable with one signature yields that
 * row directly, two yield a union, and identical rows collapse.
 *
 * @throws TypeError - when no row is given (a callable answers to at least one call), or a row is
 * neither a tuple nor a list.
 */
export function signatures(rows: readonly (TupleType | ListType)[]): TupleType | ListType | UnionType {
  if (!rows.length) {
    throw new TypeError('a callable answers to at least one call — pass at least one signature row');
  }
  const slots = rows.map(row => adopt(row));
  for (const slot of slots) {
    if (slot.kind !== 'tuple' && slot.kind !== 'array' && slot.kind !== 'iterable') {
      throw new TypeError(`a signature row is a tuple or a list — got ${stringifyType(slot)}`);
    }
  }
  return union(slots) as TupleType | ListType | UnionType;
}

/**
 * The slot form of a callable's second argument: a pre-built slot passes through, and the
 * fixed-arity rows spelling — one array of arg types per overload — builds one tuple per row
 * through {@link signatures}.
 */
export function toSignatureSlot(input: TupleType | ListType | UnionType | readonly (readonly Type[])[]): TupleType | ListType | UnionType {
  if (Array.isArray(input)) {
    const rows = input as readonly (readonly Type[])[];
    return signatures(rows.map(row => tuple(row, undefined)));
  }
  return input as TupleType | ListType | UnionType;
}

export function func(returns: Type, slot: TupleType | ListType | UnionType): FunctionType {
  const result = adopt(returns);
  const adopted = adopt(slot as Type) as TupleType | ListType | UnionType;
  return intern(
    `func\0${id(result)}\0${id(adopted)}`,
    () => node<FunctionType>({ kind: 'func', signatures: adopted, return: result }),
  );
}

export function ctor(instance: Type, slot: TupleType | ListType | UnionType): ConstructorType {
  const head = adopt(instance);
  const adopted = adopt(slot as Type) as TupleType | ListType | UnionType;
  return intern(
    `ctor\0${id(head)}\0${id(adopted)}`,
    () => node<ConstructorType>({ kind: 'ctor', signatures: adopted, instance: head }),
  );
}

export function abstractCtor(instance: Type, slot: TupleType | ListType | UnionType): AbstractConstructorType {
  const head = adopt(instance);
  const adopted = adopt(slot as Type) as TupleType | ListType | UnionType;
  return intern(
    `abstract-ctor\0${id(head)}\0${id(adopted)}`,
    () => node<AbstractConstructorType>({ kind: 'abstract-ctor', signatures: adopted, instance: head }),
  );
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
 * The aggregate each reserved spelling mints. Keyed by {@link ListName}, so a spelling added
 * to the grammar without a factory here is a compile error rather than a name that reads as an
 * ordinary type.
 */
const LISTS: Readonly<Record<ListName, Func<[Type], ListType>>> = {
  Array: array,
  Iterable: iterable,
};

/**
 * A reserved aggregate spelling carrying one argument mints that aggregate's own kind — the same
 * canonicalization {@link union} performs, so every door that can spell an aggregate lands on the
 * one interned node and a global spelling of an aggregate never exists.
 */
export function global(name: string, genericArgs: readonly Type[]): ListType | GlobalType {
  if (genericArgs.length === 1 && isListName(name)) {
    return LISTS[name](genericArgs[0]!);
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
  return [...reduced].sort(compareTypes);
}

/**
 * The canonical member order: a rank per kind, holes first and literals last — which is what
 * leaves a literal member as a union's last resort — then the kind's own scalars, then children
 * pairwise. Everything downstream iterates members as stored and stays agnostic of this rule.
 */
const KIND_RANK: Readonly<Record<Type['kind'], number>> = {
  generic: 0,
  global: 1,
  imported: 2,
  tag: 3,
  object: 4,
  tuple: 5,
  array: 6,
  iterable: 7,
  func: 8,
  ctor: 9,
  'abstract-ctor': 10,
  union: 11,
  intersection: 12,
  literal: 13,
};

function compareTypes(left: Type, right: Type): number {
  if (left === right) {
    return 0;
  }
  return KIND_RANK[left.kind] - KIND_RANK[right.kind] || compareScalars(left, right) || compareChildren(left, right);
}

/** The fields that name a node rather than compose it, compared kind against same kind. */
function compareScalars(left: Type, right: Type): number {
  switch (left.kind) {
    case 'generic': {
      return compare(left.label, (right as GenericType).label);
    }
    case 'global': {
      return compare(left.name, (right as GlobalType).name);
    }
    case 'imported': {
      const other = right as ImportedType;
      return compare(left.from, other.from) || compare(left.name, other.name);
    }
    case 'tag': {
      return compare(left.tag, (right as TagType).tag);
    }
    case 'literal': {
      return compareLiterals(left, right as TypeLiteralType);
    }
    default: {
      return 0;
    }
  }
}

/** Literal values order by category, then by value within one category. */
const LITERAL_CATEGORY_RANK: Readonly<Record<string, number>> = {
  boolean: 0,
  number: 1,
  bigint: 2,
  string: 3,
  object: 4,
  undefined: 5,
};

function compareLiterals(left: TypeLiteralType, right: TypeLiteralType): number {
  const category = LITERAL_CATEGORY_RANK[typeof left.value]! - LITERAL_CATEGORY_RANK[typeof right.value]!;
  if (category || Object.is(left.value, right.value)) {
    return category;
  }
  if (typeof left.value === 'number' && typeof right.value === 'number') {
    if (Number.isNaN(left.value) || Number.isNaN(right.value)) {
      return Number.isNaN(left.value) ? 1 : -1;
    }
    if (left.value === right.value) {
      return Object.is(left.value, -0) ? -1 : 1;
    }
    return left.value < right.value ? -1 : 1;
  }
  if (typeof left.value === 'bigint' && typeof right.value === 'bigint') {
    return left.value < right.value ? -1 : 1;
  }
  return compare(String(left.value), String(right.value));
}

function compareChildren(left: Type, right: Type): number {
  switch (left.kind) {
    case 'global':
    case 'imported': {
      return comparePairwise(left.genericArgs, (right as GlobalType | ImportedType).genericArgs);
    }
    case 'array':
    case 'iterable': {
      return compareTypes(left.element, (right as ListType).element);
    }
    case 'tag': {
      return compareTypes(left.type, (right as TagType).type);
    }
    case 'union':
    case 'intersection': {
      return comparePairwise(left.members, (right as UnionType | IntersectionType).members);
    }
    case 'tuple': {
      const other = right as TupleType;
      return comparePairwise(left.members, other.members) || compareRestSlot(left.rest, other.rest);
    }
    case 'object': {
      return compareObjectMembers(left, right as ObjectType);
    }
    case 'func': {
      const other = right as FunctionType;
      return compareTypes(left.signatures, other.signatures) || compareTypes(left.return, other.return);
    }
    case 'ctor':
    case 'abstract-ctor': {
      const other = right as ConstructorType | AbstractConstructorType;
      return compareTypes(left.signatures, other.signatures) || compareTypes(left.instance, other.instance);
    }
    default: {
      return 0;
    }
  }
}

/** No rest sorts before a rest of any type; two rests compare by their own type. */
function compareRestSlot(left: Type | undefined, right: Type | undefined): number {
  if (left === undefined || right === undefined) {
    return (left === undefined ? 0 : 1) - (right === undefined ? 0 : 1);
  }
  return compareTypes(left, right);
}

/** Fewer children first, then position `i` against position `i`. */
function comparePairwise(left: readonly Type[], right: readonly Type[]): number {
  if (left.length !== right.length) {
    return left.length - right.length;
  }
  for (let index = 0; index < left.length; index++) {
    const order = compareTypes(left[index]!, right[index]!);
    if (order) {
      return order;
    }
  }
  return 0;
}

/** Member names lead — both sides key them sorted — and the member types break the tie. */
function compareObjectMembers(left: ObjectType, right: ObjectType): number {
  const leftEntries = Object.entries(left.members);
  const rightEntries = Object.entries(right.members);
  if (leftEntries.length !== rightEntries.length) {
    return leftEntries.length - rightEntries.length;
  }
  for (let index = 0; index < leftEntries.length; index++) {
    const [leftName, leftMember] = leftEntries[index]!;
    const [rightName, rightMember] = rightEntries[index]!;
    const order = compare(leftName, rightName) || compareTypes(leftMember, rightMember);
    if (order) {
      return order;
    }
  }
  return 0;
}

/**
 * Drops each literal whose primitive base stands beside it, so `string | "fast"` is `string`.
 * Nothing subsumes `undefined` or `null`, which is what keeps a nullish member available as the
 * fallback of an optional dependency.
 */
function withoutSubsumedLiterals(members: readonly Type[]): readonly Type[] {
  const bases = new Set(members.filter(member => member.kind === 'global').map(member => member.name).filter(name => LITERAL_BASES.has(name)));
  if (!bases.size) {
    return members;
  }
  return members.filter(member => member.kind !== 'literal' || !bases.has(typeof member.value));
}

function literalKey(value: LiteralValue): string {
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
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
  ctor: ['instance', 'signatures'],
  'abstract-ctor': ['instance', 'signatures'],
  func: ['return', 'signatures'],
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
    return ctor(type.instance, type.signatures);
  }
  protected override visitAbstractCtor(type: AbstractConstructorType): Type {
    return abstractCtor(type.instance, type.signatures);
  }
  protected override visitFunc(type: FunctionType): Type {
    return func(type.return, type.signatures);
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
    return tuple(type.members, type.rest);
  }
  protected override visitTypeLiteral(type: TypeLiteralType): Type {
    return literal(type.value);
  }
  protected override visitUnion(type: UnionType): Type {
    return union(type.members);
  }
}

const adoptVisitor = new AdoptVisitor();
