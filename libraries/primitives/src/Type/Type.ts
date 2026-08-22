import type { DistributiveOmit } from '../utils/index.js';
import * as factory from './factory/factories.js';
import type { LIST_KINDS, ListName } from './grammar.js';
import { parseTypeString } from './parse/parser.js';
import { isOpenType } from './visitor/IsOpenVisitor.js';
import { matchType } from './visitor/MatchVisitor.js';
import { stringifyType } from './visitor/StringifyVisitor.js';
import { substituteType } from './visitor/SubstituteVisitor.js';
import { TypeVisitor } from './visitor/TypeVisitor.js';

// #region types

export type ListType =
  | ArrayType
  | IterableType;

export type NamedType =
  | GlobalType
  | ImportedType;
/** All Types */
export type Type =
  | ListType
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
  | NamedType
  | TagType;

declare const TYPE_BRAND: unique symbol;
type TypeBrand = typeof TYPE_BRAND;

interface TypeBase<Kind extends string> {
  readonly kind: Kind;
  readonly [TYPE_BRAND]: void;
}

export interface ImportedType extends TypeBase<'imported'> {
  /** Literally the 'from' part in the import statement you would use to access this type (package and all). */
  readonly from: string;

  /** The exported name, or 'default' for default exports. */
  readonly name: string;
  readonly genericArgs: readonly Type[];
}

/** A type the ambient scope already carries — `string`, `Date`, `Promise<T>`; no import reaches it. */
export interface GlobalType extends TypeBase<'global'> {
  /** The exported name, or 'default' for default exports. */
  readonly name: string;
  readonly genericArgs: readonly Type[];
}

/** An open generic argument — a labeled hole standing for a type bound later. */
export interface GenericType extends TypeBase<'generic'> {
  readonly label: string;
}

export interface ConstructorType extends TypeBase<'ctor'> {
  readonly signatures: Type.Signatures;
  readonly instance: Type;
  /** Does this constructor build an abstract class — one `new` never targets directly? */
  readonly abstract: boolean;
}

export interface FunctionType extends TypeBase<'func'> {
  readonly signatures: Type.Signatures;
  readonly return: Type;
}

export interface ArrayType extends TypeBase<'array'> {
  readonly element: Type;
}

export interface IterableType extends TypeBase<'iterable'> {
  readonly element: Type;
}

export interface IntersectionType extends TypeBase<'intersection'> {
  readonly members: readonly Type[];
}

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

// #endregion

export namespace Type {
  // #region factories

  /** Tells a node from a spec object: every node carries a `kind`, no spec does. */
  function isNode(value: Type | object): value is Type {
    return 'kind' in value;
  }

  /** An unadopted Type */
  export type RawType<T extends Type = Type> = DistributiveOmit<T, TypeBrand>;

  type Spec<T extends Type> = Omit<RawType<T>, 'kind'>;

  /**
   * Brings a Type into the system, thus guaranteeing referential equality
   *
   * @example
   * ```ts
   * Type.adopt({ kind: 'imported', name: 'IClock', from: 'app', genericArgs: [] });
   * ```
   */
  export function adopt<const Node extends RawType>(node: Node): Extract<Type, { kind: Node['kind']; }>;
  export function adopt(node: RawType): Type {
    return factory.adopt(node as Type);
  }

  /** An indexable array of `element` — `Array<element>`. */
  export function array(element: Type): ArrayType;
  export function array(spec: Spec<ArrayType>): ArrayType;
  export function array(first: Type | Spec<ArrayType>): ArrayType {
    return factory.array(isNode(first) ? first : first.element);
  }

  /**
   * A constructor signature — `new (...args) => instance`.
   *
   * @example
   * ```ts
   * Type.ctor(box, [[string]]);                               // new (string) => box
   * Type.ctor(box, [[string], []]);                           // new (string; ) => box
   * Type.ctor(box, [[]], true);                                // abstract new () => box
   * Type.ctor({ instance: box, signatures: [[]], abstract: false });
   * ```
   */
  export function ctor(instance: Type, signatures: Type.Signatures, abstract?: boolean): ConstructorType;
  export function ctor(spec: Spec<ConstructorType>): ConstructorType;
  export function ctor(...args: any[]): ConstructorType {
    if (args.length > 1) {
      return factory.ctor(args[0], atLeastOneSignature(args[1]), args[2]);
    }
    const spec = args[0] as Spec<ConstructorType>;
    return Type.adopt({ ...spec, signatures: atLeastOneSignature(spec.signatures), kind: 'ctor' });
  }

  /**
   * Reads a type token back into the {@link Type} it spells — the inverse of {@link stringify}.
   *
   * @remarks
   * The token format: `docs/features/type-token-format.md`.
   *
   * @throws TypeParseError - when the token is malformed.
   */
  export const from = (() => {
    /** Every token that has already been read, so a repeated request skips the lexer. */
    const parsed = new Map<string, Type>();

    return function from(type: string | Type): Type {
      return typeof type === 'string' ? parsed.getOrInsertComputed(type, parseTypeString) : Type.adopt(type);
    };
  })();

  /**
   * A function signature — `(...args) => return`.
   *
   * @example
   * ```ts
   * Type.func(box, [[string]]);                             // (string) => box
   * Type.func(box, [[string], []]);                         // (string; ) => box
   * Type.func({ return: box, signatures: [[]] });
   * ```
   */
  export function func(returns: Type, signatures: Type.Signatures): FunctionType;
  export function func(spec: Spec<FunctionType>): FunctionType;
  export function func(...args: any[]): FunctionType {
    if (args.length > 1) {
      return factory.func(args[0], atLeastOneSignature(args[1]));
    }
    const spec = args[0] as Spec<FunctionType>;
    return Type.adopt({ ...spec, signatures: atLeastOneSignature(spec.signatures), kind: 'func' });
  }

  /** An open generic argument — a labeled hole standing for a type bound later. */
  export function generic(label: string): GenericType;
  export function generic(spec: Spec<GenericType>): GenericType;
  export function generic(first: string | Spec<GenericType>): GenericType {
    return factory.generic(typeof first === 'string' ? first : first.label);
  }

  /** The node kind one list spelling names. */
  type List<Name extends ListName> = Extract<ListType, { kind: typeof LIST_KINDS[Name]; }>;

  /**
   * What a {@link Type.global} spelling mints, as narrowly as the call can prove it.
   */
  type Global<Name extends string, Args extends readonly Type[]> = string extends Name ? ListType | GlobalType
    : Name extends ListName ? Args extends readonly [Type] ? List<Name>
      : number extends Args['length'] ? List<Name> | GlobalType
      : GlobalType
    : GlobalType;

  /** A type the ambient scope already carries, referenced by name. */
  export function global<
    const Name extends string,
    const Args extends readonly Type[] = readonly [],
  >(name: Name, genericArgs?: Args): Global<Name, Args>;
  export function global<const Named extends Spec<GlobalType>>(
    spec: Named,
  ): Global<Named['name'], Named['genericArgs']>;
  export function global(first: string | Spec<GlobalType>, genericArgs: readonly Type[] = []):
    | ListType
    | GlobalType {
    return typeof first === 'string'
      ? factory.global(first, genericArgs)
      : factory.global(first.name, first.genericArgs);
  }

  /**
   * A type reached through a package — parallel to `import { name } from '…'`.
   *
   * @throws TypeError - when `from` names the ambient scope rather than a package.
   */
  export function imported(name: string, from: string, genericArgs?: readonly Type[]): ImportedType;
  export function imported(spec: Spec<ImportedType>): ImportedType;
  export function imported(first: string | Spec<ImportedType>, from?: string, genericArgs: readonly Type[] = []): ImportedType {
    return typeof first === 'string'
      ? factory.imported(first, from!, genericArgs)
      : factory.imported(first.name, first.from, first.genericArgs);
  }

  /**
   * An intersection of the given members — satisfied only by satisfying all of them.
   *
   * @remarks
   * Canonicalized exactly as {@link union} is, minus the literal reduction.
   *
   * @throws TypeError - when no member survives.
   */
  export function intersection<Member extends Type>(type: Member): Member;
  export function intersection(first: Type, second: Type, ...rest: readonly Type[]): IntersectionType;
  export function intersection(spec: Spec<IntersectionType>): Type;
  export function intersection(...types: readonly Type[]): Type;
  export function intersection(...args: readonly Type[] | [Spec<IntersectionType>]): Type {
    const [first] = args;
    return first !== undefined && !isNode(first)
      ? factory.intersection(first.members)
      : factory.intersection(args as readonly Type[]);
  }

  /** A lazily-walked sequence of `element` — `Iterable<element>`. */
  export function iterable(element: Type): IterableType;
  export function iterable(spec: Spec<IterableType>): IterableType;
  export function iterable(first: Type | Spec<IterableType>): IterableType {
    return factory.iterable(isNode(first) ? first : first.element);
  }

  /** A structural object type — members keyed in sorted order, so member order never splits identity. */
  export function object(members: Readonly<Record<string, Type>>): ObjectType {
    return factory.object(members);
  }

  /**
   * The given type wearing a tag — a distinct name for the same underlying type, so the same
   * type under a different tag is a different type.
   *
   * @throws TypeError - when the type is already tagged; a type wears at most one tag.
   */
  export const tag = (() => {
    function tag(type: Exclude<Type, TagType>, tag: string): TagType;
    function tag(spec: Spec<TagType>): TagType;
    function tag(first: Type | Spec<TagType>, tag?: string): TagType {
      return isNode(first) ? factory.tag(first, tag!) : factory.tag(first.type, first.tag);
    }
    return tag;
  })();

  /** A fixed-length, ordered list of member types — `[A, B, C]`. */
  export function tuple(...types: readonly Type[]): TupleType;
  export function tuple(spec: Spec<TupleType>): TupleType;
  export function tuple(...args: readonly Type[] | [Spec<TupleType>]): TupleType {
    const [first] = args;
    return first !== undefined && !isNode(first)
      ? factory.tuple(first.members)
      : factory.tuple(args as readonly Type[]);
  }

  /** A single literal value as a type — `'on'`, `42`, `true`, `null`. */
  export function typeLiteral(value: LiteralValue): TypeLiteralType;
  export function typeLiteral(spec: Spec<TypeLiteralType>): TypeLiteralType;
  export function typeLiteral(first: LiteralValue | Spec<TypeLiteralType>): TypeLiteralType {
    return factory.literal(first !== null && typeof first === 'object' ? first.value : first);
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
  export function union(...types: readonly Type[]): Type;
  export function union(spec: Spec<UnionType>): Type;
  export function union(...args: readonly Type[] | [Spec<UnionType>]): Type {
    const [first] = args;
    return first !== undefined && !isNode(first)
      ? factory.union(first.members)
      : factory.union(args as readonly Type[]);
  }

  // #endregion

  // #region ops

  /**
   * Is `type` address-only — a pure reference, with nothing of its own to build from?
   *
   * @remarks
   * A tag is address-only whatever it wraps — the tag exists to be a distinct name.
   */
  export const isIdentifier = (() => {
    /** Keyed by {@link TypeIdentifier}'s own discriminants, so this table and the union cannot drift. */
    const IDENTIFIER_KINDS = {
      generic: true,
      global: true,
      imported: true,
      tag: true,
    } satisfies Record<TypeIdentifier['kind'], true>;

    return function isIdentifier(type: Type): type is TypeIdentifier {
      return Object.hasOwn(IDENTIFIER_KINDS, type.kind);
    };
  })();

  /** Does `type` still hold a generic hole anywhere? */
  export function isOpen(type: Type): boolean {
    return isOpenType(type);
  }

  /** Does the type admit `undefined` — the `undefined` literal itself, or a union carrying it? */
  export function isOptional(type: Type): boolean {
    return type === Type.typeLiteral(undefined) || type.kind === 'union' && type.members.includes(Type.typeLiteral(undefined));
  }

  /**
   * Does some instantiation of `{@link candidate}` equal `{@link constraint}`? Success carries the
   * instantiation — one binding per generic label in the candidate.
   *
   * @remarks
   * Matching is identity modulo holes: outside a hole, the two sides must be the same interned
   * node — there is no assignability, so no width subtyping, no literal widening to its primitive
   * base, and no member search.
   *
   * @throws Error - when `constraint` itself holds a generic hole.
   */
  export function match(candidate: Type, constraint: Type) {
    return matchType(candidate, constraint);
  }

  /** Writes the type as its token spelling — the inverse of {@link from}. */
  export function stringify(type: Type): string {
    return stringifyType(type);
  }

  /** Replaces each generic hole whose label the map names; other holes stay. */
  export function substitute(type: ConstructorType, substitutions: ReadonlyMap<string, Type>): ConstructorType;
  export function substitute(type: FunctionType, substitutions: ReadonlyMap<string, Type>): FunctionType;
  export function substitute(type: Type, substitutions: ReadonlyMap<string, Type>): Type;
  export function substitute(type: Type, substitutions: ReadonlyMap<string, Type>): Type {
    return substituteType(type, substitutions);
  }

  /** The lenient no-parameter spelling: `[]` names no call, so it reads as one empty signature. */
  function atLeastOneSignature(signatures: Type.Signatures): Type.Signatures {
    return signatures.length ? signatures : [[]];
  }

  // #endregion

  // #region types

  /**
   * The parameter lists a callable answers to — one signature per overload, in declaration order, each signature
   * holding that overload's parameter types in order.
   *
   * @remarks
   * An un-overloaded callable carries exactly one signature and a parameterless one carries one EMPTY
   * signature — a node never holds `[]`, which the factories accept only as a lenient spelling of `[[]]`.
   */
  export type Signatures = ReadonlyArray<readonly Type[]>;

  /**
   * The dispatch surface over the node kinds — subclass it and implement the `visit*` member for
   * each kind the walk cares about.
   *
   * @example
   * ```ts
   * class Depth extends Type.Visitor<number> {
   *   protected override visitUnion(type: UnionType): number { … }
   * }
   * ```
   */
  export const Visitor = TypeVisitor;
  export type Visitor<Return, Context = never> = TypeVisitor<Return, Context>;

  // #endregion
}
