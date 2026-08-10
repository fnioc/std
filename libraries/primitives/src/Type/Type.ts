import { Func } from '@rhombus-toolkit/func';
import { memo, UnionToTuple } from '../utils.js';
import { typeEquals } from './EqualsVisitor.js';
import { expandUnionsVisitor } from './ExpandUnionsVisitor.js';
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

export namespace Type {
  export function union(...types: readonly Type[]): UnionType {
    return { kind: 'union', members: types };
  }
  export function intersection(...types: readonly Type[]): IntersectionType {
    return { kind: 'intersection', members: types };
  }
  export function tuple(...types: readonly Type[]): TupleType {
    return { kind: 'tuple', members: types };
  }
  export function func(returnType: Type, ...args: readonly Type[]): FunctionType {
    return { kind: 'function', args, returnType };
  }
  export function ctor(instanceType: Type, ...args: readonly Type[]): CtorType {
    return { kind: 'ctor', args, instanceType };
  }
  export function named(name: string, from: string = 'global', genericTypes: readonly Type[] = []): NamedType {
    return { kind: 'named', from, name, genericArgs: genericTypes };
  }
  export function object(members: Readonly<Record<string, Type>>): ObjectType {
    return { kind: 'object', members };
  }
  export function typeLiteral(value: LiteralValue): TypeLiteralType {
    return { kind: 'literal', value };
  }
  export function placeholder(label: string): PlaceholderType {
    return { kind: 'placeholder', label };
  }
  export function tag(type: Type, tag: string): TagType {
    return { kind: 'tag', tag, type };
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
  export const from = memo(function from(token: string): Type {
    return parseType(token);
  });

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
  export function equals(left: Type | string, right: Type | string): boolean {
    if (typeof left === 'string') {
      return equals(Type.from(left), right);
    }
    if (typeof right === 'string') {
      return equals(left, Type.from(right));
    }
    return typeEquals(left, right);
  }
}

interface TypeBase<Kind extends string> {
  readonly kind: Kind;
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

export type LiteralValue = string | number | bigint | boolean | null | undefined;
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
