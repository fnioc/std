import { Func } from '@rhombus-toolkit/func';
import { memo, UnionToTuple } from '../utils.js';
import { typeEquals } from './EqualsVisitor.js';
import { expandUnionsVisitor } from './ExpandUnionsVisitor.js';
import { satisfiesType } from './SatisfiesVisitor.js';
import { substituteType } from './SubstituteVisitor.js';
import { toStringVisitor } from './ToStringVisitor.js';
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
    return { kind: 'union', types };
  }
  export function intersection(...types: readonly Type[]): IntersectionType {
    return { kind: 'intersection', types };
  }
  export function tuple(...types: readonly Type[]): TupleType {
    return { kind: 'tuple', types };
  }
  export function func(returnType: Type, ...args: readonly Type[]): FunctionType {
    return { kind: 'function', args, returnType };
  }
  export function ctor(instanceType: Type, ...args: readonly Type[]): CtorType {
    return { kind: 'ctor', args, instanceType };
  }
  export function named(name: string, from: string = 'global', genericTypes: readonly Type[] = []): NamedType {
    return { kind: 'named', from, name, genericTypes };
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

  export const parse = memo(function parse(token: string): Type {
    /**
     * Special cases of named types:
     * ============================
     * Func => FunctionType
     * Ctor => CtorType
     * ServiceProvider => ServiceProviderType
     * value types e.g. string, number => error
     */
    throw 'not implemented';
  }, p => p);

  export namespace op {
    export function toString(type: Type): string {
      return toStringVisitor.visit(type);
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
    export function equals(left: Type | string, right: Type | string): boolean {
      if (typeof left === 'string') {
        return equals(Type.parse(left), right);
      }
      if (typeof right === 'string') {
        return equals(left, Type.parse(right));
      }
      return typeEquals(left, right);
    }
  }
}

interface TypeBase<Kind extends string> {
  readonly kind: Kind;
}

export interface UnionType extends TypeBase<'union'> {
  readonly types: readonly Type[];
}

export interface IntersectionType extends TypeBase<'intersection'> {
  readonly types: readonly Type[];
}

export interface TupleType extends TypeBase<'tuple'> {
  readonly types: readonly Type[];
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
  readonly genericTypes: readonly Type[];
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
