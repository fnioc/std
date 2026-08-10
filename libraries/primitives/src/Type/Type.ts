import { expandUnionsVisitor } from './ExpandUnionsVisitor.js';
import * as factory from './internals/factories.js';
import { parseType } from './internals/parser.js';
import { matchType, satisfiesType } from './SatisfiesVisitor.js';
import { stringifyType } from './StringifyVisitor.js';
import { substituteType } from './SubstituteVisitor.js';
import { typeValidatorVisitor } from './TypeValidatorVisitor.js';

export type TokenType =
  | UnionType
  | IntersectionType
  | TupleType
  | FunctionType
  | NamedType
  | ObjectType
  | TypeLiteralType
  | PlaceholderType
  | TagType;
export type Type = TokenType | CtorType;
export type ConstructableType = Exclude<Type, NamedType>;

/** Every token that has already been read, so a repeated request skips the lexer. */
const parsed = new Map<string, Type>();

export namespace Type {
  /**
   * @remarks
   * Members are flattened, deduped and ordered canonically, and a literal standing beside its
   * primitive base is dropped — the readings TypeScript gives a union, under which `A | B` and
   * `B | A` are one type. A lone surviving member is returned in place of the union it would
   * have formed.
   *
   * @throws TypeError - when no member survives.
   */
  export function union(...types: readonly Type[]): Type {
    return factory.union(types);
  }
  /**
   * @remarks
   * Canonicalized exactly as {@link union} is, minus the literal reduction.
   *
   * @throws TypeError - when no member survives.
   */
  export function intersection(...types: readonly Type[]): Type {
    return factory.intersection(types);
  }
  export function tuple(...types: readonly Type[]): TupleType {
    return factory.tuple(types);
  }
  export function func(returnType: Type, ...args: readonly Type[]): FunctionType {
    return factory.func(returnType, args);
  }
  export function ctor(instanceType: Type, ...args: readonly Type[]): CtorType {
    return factory.ctor(instanceType, args);
  }
  export function named(name: string, from: string = 'global', genericTypes: readonly Type[] = []): NamedType {
    return factory.named(name, from, genericTypes);
  }
  /** Members are keyed in sorted order, so writing them in another order names the same type. */
  export function object(members: Readonly<Record<string, Type>>): ObjectType {
    return factory.object(members);
  }
  export function typeLiteral(value: LiteralValue): TypeLiteralType {
    return factory.literal(value);
  }
  export function placeholder(label: string): PlaceholderType {
    return factory.placeholder(label);
  }
  export function tag(type: Type, tag: string): TagType {
    return factory.tag(type, tag);
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
  export function from(token: string): Type {
    const read = parsed.get(token);
    if (read !== undefined) {
      return read;
    }
    const type = parseType(token);
    parsed.set(token, type);
    return type;
  }

  export function stringify(type: Type): string {
    return stringifyType(type);
  }
  export function validate(type: Type): readonly string[] {
    return typeValidatorVisitor.visit(type);
  }
  export function expand(type: Type): readonly Type[] {
    return expandUnionsVisitor.visit(type);
  }
  export function substitute(type: Type, substitutions: ReadonlyMap<string, Type>): Type {
    return substituteType(type, substitutions);
  }
  export function satisfies(proposed: Type, condition: Type) {
    return satisfiesType(proposed, condition);
  }
  export function match(pattern: Type, subject: Type) {
    return matchType(pattern, subject);
  }
}

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

export interface UnionType extends TypeBase<'union'> {
  readonly members: readonly Type[];
}

export interface IntersectionType extends TypeBase<'intersection'> {
  readonly members: readonly Type[];
}

export interface TupleType extends TypeBase<'tuple'> {
  readonly members: readonly Type[];
}
export interface FunctionType extends TypeBase<'function'> {
  readonly args: readonly Type[];
  readonly returnType: Type;
}
export interface CtorType extends TypeBase<'ctor'> {
  readonly args: readonly Type[];
  readonly instanceType: Type;
}

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

type LiteralValue = string | number | bigint | boolean | null | undefined;
/** Any type that `typeof` can resolve */
export interface TypeLiteralType extends TypeBase<'literal'> {
  readonly value: LiteralValue;
}

export interface PlaceholderType extends TypeBase<'placeholder'> {
  readonly label: string;
}

export interface TagType extends TypeBase<'tag'> {
  readonly tag: string;
  readonly type: Type;
}
