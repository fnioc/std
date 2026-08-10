/**
 * The only place a {@link Type} node is built. Each factory canonicalizes its slots, then hands
 * them to {@link intern}, so two spellings of one type yield the same object and `===` decides
 * equality everywhere downstream.
 */

import { stringifyType } from '../StringifyVisitor.js';
import type { CtorType, FunctionType, IntersectionType, NamedType, ObjectType, PlaceholderType, TagType, TupleType,
  Type, TypeBrand, TypeLiteralType, UnionType } from '../Type.js';
import { TypeVisitor } from '../TypeVisitor.js';
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

export function func(returnType: Type, args: readonly Type[]): FunctionType {
  const result = adopt(returnType);
  const slots = args.map(adopt);
  return intern(
    `function\0${id(result)}\0${slots.map(id).join(',')}`,
    () => node<FunctionType>({ kind: 'function', args: slots, returnType: result }),
  );
}

export function ctor(instanceType: Type, args: readonly Type[]): CtorType {
  const instance = adopt(instanceType);
  const slots = args.map(adopt);
  return intern(
    `ctor\0${id(instance)}\0${slots.map(id).join(',')}`,
    () => node<CtorType>({ kind: 'ctor', args: slots, instanceType: instance }),
  );
}

export function named(name: string, from: string, genericArgs: readonly Type[]): NamedType {
  const slots = genericArgs.map(adopt);
  return intern(
    `named\0${JSON.stringify(from)}\0${JSON.stringify(name)}\0${slots.map(id).join(',')}`,
    () => node<NamedType>({ kind: 'named', from, name, genericArgs: slots }),
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

export function literal(value: TypeLiteralType['value']): TypeLiteralType {
  return intern(literalKey(value), () => node<TypeLiteralType>({ kind: 'literal', value }));
}

export function placeholder(label: string): PlaceholderType {
  return intern(
    `placeholder\0${JSON.stringify(label)}`,
    () => node<PlaceholderType>({ kind: 'placeholder', label }),
  );
}

export function tag(type: Type, name: string): TagType {
  const inner = adopt(type);
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
      .filter(member => member.kind === 'named' && member.from === 'global')
      .map(member => LITERAL_BASE[(member as NamedType).name])
      .filter(base => base !== undefined),
  );
  if (!bases.size) {
    return members;
  }
  return members.filter(member => member.kind !== 'literal' || !bases.has(typeof member.value));
}

function literalKey(value: TypeLiteralType['value']): string {
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
 * Rebuilds a node the table did not mint, so anything arriving from outside — a cast, an untyped
 * caller, a tree revived from JSON — joins the interned graph before its identity is read. Each
 * factory adopts its own slots, so the walk reaches the whole subtree.
 */
function adopt(type: Type): Type {
  return isInterned(type) ? type : adoptVisitor.visit(type);
}

class AdoptVisitor extends TypeVisitor<Type> {
  protected override visitUnion(type: UnionType): Type {
    return union(type.members);
  }
  protected override visitIntersection(type: IntersectionType): Type {
    return intersection(type.members);
  }
  protected override visitTuple(type: TupleType): Type {
    return tuple(type.members);
  }
  protected override visitFunction(type: FunctionType): Type {
    return func(type.returnType, type.args);
  }
  protected override visitCtor(type: CtorType): Type {
    return ctor(type.instanceType, type.args);
  }
  protected override visitNamed(type: NamedType): Type {
    return named(type.name, type.from, type.genericArgs);
  }
  protected override visitObject(type: ObjectType): Type {
    return object(type.members);
  }
  protected override visitTypeLiteral(type: TypeLiteralType): Type {
    return literal(type.value);
  }
  protected override visitPlaceholder(type: PlaceholderType): Type {
    return placeholder(type.label);
  }
  protected override visitTag(type: TagType): Type {
    return tag(type.type, type.tag);
  }
}

const adoptVisitor = new AdoptVisitor();
