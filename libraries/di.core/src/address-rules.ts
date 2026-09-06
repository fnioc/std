import { Type, type TypeRule } from '@rhombus-std/primitives';
import { type Generic, typefor } from '@rhombus-std/primitives.extras';

/** What the aggregate delivers, or `undefined` when the type is not one — a hole anywhere reads as not one, since a matcher cannot close it. */
function getAggregateElement(type: Type): Type | undefined {
  if (Type.isOpen(type)) {
    return undefined;
  }
  for (const pattern of [typefor<Array<Generic<'E'>>>(), typefor<Iterable<Generic<'E'>>>(), typefor<AsyncIterable<Generic<'E'>>>()]) {
    const [isMatch, generics] = Type.extractMatchedGenerics(pattern, type);
    if (isMatch) {
      return generics.E;
    }
  }
  return undefined;
}

/** A key over a keyed type. */
export const tagOfTag: TypeRule = {
  id: 'DI1001',
  level: 'warning',
  check(node: Type): string | undefined {
    return node.kind === 'tag' && node.type.kind === 'tag' ? 'keyed twice, and the two keys have no canonical order to file it under' : undefined;
  },
};

/** A key over a type that admits `undefined`. */
export const tagOfOptional: TypeRule = {
  id: 'DI1002',
  level: 'warning',
  check(node: Type): string | undefined {
    return node.kind === 'tag' && Type.isOptional(node.type) ? 'keyed over an optional, so the key names the absent value as much as the present one' : undefined;
  },
};

/** A key over a literal value. */
export const tagOfLiteral: TypeRule = {
  id: 'DI1003',
  level: 'warning',
  check(node: Type): string | undefined {
    return node.kind === 'tag' && node.type.kind === 'literal' ? 'keyed over a literal value, which names no service for the key to tell apart' : undefined;
  },
};

/** A key that is the empty string. */
export const tagWithEmptyKey: TypeRule = {
  id: 'DI1004',
  level: 'warning',
  check(node: Type): string | undefined {
    return node.kind === 'tag' && !node.tag ? 'keyed with the empty string, which reads as the unkeyed type without being it' : undefined;
  },
};

/** A promise of a promise. */
export const promiseOfPromise: TypeRule = {
  id: 'DI1005',
  level: 'warning',
  check(node: Type): string | undefined {
    return Type.isClosed(node) && Type.isPromise(node) && Type.isPromise(Type.awaited(node))
      ? 'a promise of a promise, which delivers exactly what the inner one delivers'
      : undefined;
  },
};

/** A promise of an asynchronous sequence. */
export const promiseOfAsyncIterable: TypeRule = {
  id: 'DI1006',
  level: 'warning',
  check(node: Type): string | undefined {
    return Type.isClosed(node) && Type.isPromise(node) && Type.isMatch(typefor<AsyncIterable<Generic<'E'>>>(), Type.awaited(node))
      ? 'a promise of an asynchronous sequence, which already arrives one element at a time'
      : undefined;
  },
};

/** A promise of a literal value. */
export const promiseOfLiteral: TypeRule = {
  id: 'DI1007',
  level: 'warning',
  check(node: Type): string | undefined {
    return Type.isClosed(node) && Type.isPromise(node) && Type.awaited(node).kind === 'literal'
      ? 'a promise of a literal value, which has nothing to wait for'
      : undefined;
  },
};

/** An aggregate whose element admits `undefined`. */
export const aggregateOfOptional: TypeRule = {
  id: 'DI1008',
  level: 'warning',
  check(node: Type): string | undefined {
    const element = getAggregateElement(node);
    return element !== undefined && Type.isOptional(element)
      ? 'an aggregate of an optional, so the optional fallback arrives as a phantom undefined element'
      : undefined;
  },
};

/** A union carrying a keyed type beside the same type unkeyed. */
export const unionOfTaggedBesideBare: TypeRule = {
  id: 'DI1009',
  level: 'warning',
  check(node: Type): string | undefined {
    return node.kind === 'union' && node.members.some(member => member.kind === 'tag' && node.members.includes(member.type))
      ? 'a keyed member beside the same type unkeyed, so the key decides nothing about which arm answers'
      : undefined;
  },
};

/** A union of two aggregates. */
export const unionOfAggregates: TypeRule = {
  id: 'DI1010',
  level: 'warning',
  check(node: Type): string | undefined {
    return node.kind === 'union' && node.members.filter(member => getAggregateElement(member) !== undefined).length > 1
      ? 'two aggregates in one union, so the arm that answers is whichever the union tries first'
      : undefined;
  },
};

/** A union carrying a promise beside the value it settles to. */
export const unionOfPromiseBesideSettled: TypeRule = {
  id: 'DI1011',
  level: 'warning',
  check(node: Type): string | undefined {
    return node.kind === 'union' && node.members.some(member => Type.isClosed(member) && Type.isPromise(member) && node.members.includes(Type.awaited(member)))
      ? 'a promise beside the value it settles to, so the caller cannot tell which arm answered'
      : undefined;
  },
};

/** An ask for `undefined` itself. */
export const askForUndefinedLiteral: TypeRule = {
  id: 'DI1012',
  level: 'warning',
  check(node: Type): string | undefined {
    return node === Type.undefinedLiteral ? 'an ask for undefined itself, which no registration produces' : undefined;
  },
};

/** A registration filed under a union. */
export const registrationUnderUnion: TypeRule = {
  id: 'DI1013',
  level: 'warning',
  check(node: Type): string | undefined {
    return node.kind === 'union' ? 'filed under a union, which answers only an ask spelling that whole union' : undefined;
  },
};

/** A registration filed under a literal value. */
export const registrationUnderLiteral: TypeRule = {
  id: 'DI1014',
  level: 'warning',
  check(node: Type): string | undefined {
    return node.kind === 'literal' ? 'filed under a literal value, which answers only an ask spelling that literal' : undefined;
  },
};

/** The rules both sides read: shapes that are suspect wherever they are spelled. */
const SHARED_RULES: readonly TypeRule[] = [
  tagOfTag,
  tagOfOptional,
  tagOfLiteral,
  tagWithEmptyKey,
  promiseOfPromise,
  promiseOfAsyncIterable,
  promiseOfLiteral,
  aggregateOfOptional,
  unionOfTaggedBesideBare,
  unionOfAggregates,
  unionOfPromiseBesideSettled,
];

/**
 * The address rules, grouped by the side of the door that reads them.
 *
 * @remarks
 * Every rule is a warning: an address spelled this way is legal and matched by identity like any
 * other, and the report says only that the spelling is more likely a slip than an intention.
 */
export const addressRules = Object.freeze({
  /** What every registration address is read by. */
  registration: Object.freeze([...SHARED_RULES, registrationUnderUnion, registrationUnderLiteral]),

  /** What every ask's address is read by. */
  ask: Object.freeze([...SHARED_RULES, askForUndefinedLiteral]),

  /** Every rule under its own id — what a suppression names. */
  byId: Object.freeze(
    Object.fromEntries(
      Iterator.from([...SHARED_RULES, askForUndefinedLiteral, registrationUnderUnion, registrationUnderLiteral]).map(rule => [rule.id, rule] as const),
    ),
  ) as Readonly<Record<string, TypeRule>>,
});
