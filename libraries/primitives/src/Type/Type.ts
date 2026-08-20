import * as factory from './factory/factories.js';
import type { AGGREGATE_KINDS, AggregateName } from './grammar.js';
import { parseTypeString } from './parse/parser.js';
import { expandUnionsVisitor } from './visitor/ExpandUnionsVisitor.js';
import { isOpenType } from './visitor/IsOpenVisitor.js';
import { matchType, satisfiesType } from './visitor/SatisfiesVisitor.js';
import { stringifyType } from './visitor/StringifyVisitor.js';
import { substituteType } from './visitor/SubstituteVisitor.js';
import { typeValidatorVisitor } from './visitor/TypeValidatorVisitor.js';
import { TypeVisitor } from './visitor/TypeVisitor.js';

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

/** Marks a node as one the intern table minted. Declared only — nothing carries it at runtime. */
declare const TYPE_BRAND: unique symbol;

/**
 * The brand's key, so the factories can name the shape they build: a node minus the mark it
 * cannot supply a runtime value for.
 */
export type TypeBrand = typeof TYPE_BRAND;

/**
 * A node as pure data — every field it publishes, and the mark only the intern table can supply
 * left off. This is the shape {@link Type.adopt} takes.
 */
export type RawType<T extends Type = Type> = T extends Type ? Omit<T, TypeBrand> : never;

/**
 * What a factory's object form names: the node's own fields minus its kind, which the factory
 * being called already decides. Derived from the node, so the two can never drift apart.
 */
type Spec<T extends Type> = Omit<T, 'kind' | TypeBrand>;

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
  readonly args: Type.Signatures;
  readonly instance: Type;
  /** Does this constructor build an abstract class — one `new` never targets directly? */
  readonly abstract: boolean;
}

export interface FunctionType extends TypeBase<'func'> {
  readonly args: Type.Signatures;
  readonly return: Type;
}

/** An open generic argument — a labeled hole standing for a type bound later. */
export interface GenericType extends TypeBase<'generic'> {
  readonly label: string;
}

/** A type the ambient scope already carries — `string`, `Date`, `Promise<T>`; no import reaches it. */
export interface GlobalType extends NominalBase<'global'> {}

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
  /**
   * The parameter lists a callable answers to — one row per overload, in declaration order, each row
   * holding that overload's parameter types in order.
   *
   * @remarks
   * A callable that is not overloaded carries exactly one row, and one taking no parameters carries
   * one EMPTY row — `[[]]`, never `[]`, which names no call at all and so has no spelling.
   */
  export type Signatures = ReadonlyArray<readonly Type[]>;
  export namespace Signatures {
    /** Parameter rows as the node takes them, each token read into the type it spells. */
    export function from(signatures: ReadonlyArray<ReadonlyArray<Type | string>>): Signatures {
      return signatures.map(row => row.map(param => typeof param === 'string' ? Type.from(param) : adopt(param)));
    }
  }
  /**
   * The dispatch surface over the node kinds — subclass it and implement the `visit*` member for
   * each kind the walk cares about.
   *
   * @remarks
   * `Return` is what a walk produces and `Context` what it threads through, defaulting to nothing.
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

  // #region factories

  /**
   * The canonical node for a type written out as plain data — every field the node publishes, its
   * `kind` included. Two literals describing one type adopt to the SAME object, so `===` decides
   * their equality exactly as it does for a node any other factory returned.
   *
   * @remarks
   * This is the door every other factory ends at, and the one a tree arriving from outside takes:
   * a value revived from JSON, or one a cast produced. The walk reaches the whole subtree, so a
   * literal nested inside a literal is adopted too.
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
   * A constructor signature — `new (...args) => instance`, instance type first.
   *
   * @remarks
   * `args` is one ROW per call the constructor answers to, so a constructor taking one dependency
   * is `[[dep]]` and one taking nothing is `[[]]`. `abstract` names a constructor that builds an
   * abstract class — one nothing constructs with `new` directly — and defaults to `false` when
   * omitted. The object form names the node's own fields.
   *
   * @example
   * ```ts
   * Type.ctor(box, [[string]]);                               // new (string) => box
   * Type.ctor(box, [[string], []]);                           // new (string; ) => box
   * Type.ctor(box, [[]], true);                                // abstract new () => box
   * Type.ctor({ instance: box, args: [[]], abstract: false });
   * ```
   */
  export function ctor(instance: Type, args: Type.Signatures, abstract?: boolean): ConstructorType;
  export function ctor(spec: Spec<ConstructorType>): ConstructorType;
  export function ctor(...args: any[]): ConstructorType {
    return args.length > 1
      ? factory.ctor(args[0], args[1], args[2])
      : adopt({ ...args[0] as Spec<ConstructorType>, kind: 'ctor' });
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
   * A callable answering to several calls writes its parameter rows semicolon-separated, in the one
   * parameter position — `(string; ) => app:Box` takes a string or nothing.
   *
   * @throws TypeParseError - when the token is malformed.
   */
  export const from = (() => {
    /** Every token that has already been read, so a repeated request skips the lexer. */
    const parsed = new Map<string, Type>();

    return function from(type: string | Type): Type {
      return typeof type === 'string' ? parsed.getOrInsertComputed(type, parseTypeString) : adopt(type);
    };
  })();

  /**
   * A function signature — `(...args) => return`, return type first.
   *
   * @remarks
   * Identity is the shape alone: two signatures with the same return type and parameter rows are
   * the same type, whichever functions they were read from.
   *
   * `args` is one ROW per call the function answers to, so a function taking one dependency is
   * `[[dep]]` and one taking nothing is `[[]]`. The object form names the node's own fields.
   *
   * @example
   * ```ts
   * Type.func(box, [[string]]);                             // (string) => box
   * Type.func(box, [[string], []]);                         // (string; ) => box
   * Type.func({ return: box, args: [[]] });
   * ```
   */
  export function func(returns: Type, args: Type.Signatures): FunctionType;
  export function func(spec: Spec<FunctionType>): FunctionType;
  export function func(...args: any[]): FunctionType {
    return args.length > 1
      ? factory.func(args[0], args[1])
      : adopt({ ...args[0] as Spec<FunctionType>, kind: 'func' });
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
  export function global<const Named extends Spec<GlobalType>>(
    spec: Named,
  ): Global<Named['name'], Named['genericArgs']>;
  export function global(first: string | Spec<GlobalType>, genericArgs: readonly Type[] = []):
    | AggregateType
    | GlobalType {
    return typeof first === 'string'
      ? factory.global(first, genericArgs)
      : factory.global(first.name, first.genericArgs);
  }

  /**
   * A type reached through a package — parallel to `import { name } from '…'`, `from` spelled as the
   * import statement spells it. Generic arguments name the constructed type `Name<Args>`; leave one
   * open with {@link generic} to describe the generic type itself.
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
  export const tag = (() => {
    /** Tells a node from a spec object: every node carries a `kind`, no spec does. */
    function isNode(value: Type | object): value is Type {
      return 'kind' in value;
    }
    function tag(type: Exclude<Type, TagType>, tag: string): TagType;
    function tag(spec: Spec<TagType>): TagType;
    function tag(first: Type | Spec<TagType>, tag?: string): TagType {
      return isNode(first) ? factory.tag(first, tag!) : factory.tag(first.type, first.tag);
    }
    return tag;
  })();

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
   * resolved parts instead. A tag is address-only whatever it wraps: keying is registration
   * intent, so an unregistered keyed request fails rather than constructs.
   *
   * The answer is the node's own discriminant, so there is nothing to walk and nothing to
   * remember.
   */
  export const isIdentifier = (() => {
    /**
     * The kinds that name a type without describing one, keyed by {@link TypeIdentifier}'s own
     * discriminants: a member added to that union without a key here fails to compile, as does a
     * key naming a kind the union does not carry. The two cannot drift.
     */
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
   * instance type and its parameter rows, neither of which can change what it is — so a caller
   * holding one keeps its narrower type across the call.
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
