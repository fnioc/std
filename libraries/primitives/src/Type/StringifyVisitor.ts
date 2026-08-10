import type { CtorType, FunctionType, IntersectionType, NamedType, ObjectType, PlaceholderType, TagType, TupleType,
  Type, TypeLiteralType, UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

/** Renders a {@link Type} as its source-level spelling — `@rhombus-std/di2.core:Foo<string | [number, pkg:something]>`. */
class StringifyVisitor extends TypeVisitor<string> {
  protected override visitCtor(type: CtorType): string {
    return `new (${type.args.map(t => this.visit(t)).join(', ')}) => ${this.visit(type.instanceType)}`;
  }
  protected override visitUnion(type: UnionType): string {
    return type.types.map(t => this.visit(t)).join(' | ');
  }
  protected override visitIntersection(type: IntersectionType): string {
    return type.types.map(t => this.visit(t)).join(' & ');
  }
  protected override visitTuple(type: TupleType): string {
    return `[${type.types.map(t => this.visit(t)).join(', ')}]`;
  }
  protected override visitFunction(type: FunctionType): string {
    return `(${type.args.map(t => this.visit(t)).join(', ')}) => ${this.visit(type.returnType)}`;
  }
  protected override visitNamed(type: NamedType): string {
    return this.#qualifier(type) + this.#genericTypes(type.genericTypes);
  }
  protected override visitObject(type: ObjectType): string {
    return `{ ${Object.entries(type.members).map(([key, member]) => `${key}: ${this.visit(member)}`).join('; ')} }`;
  }
  protected override visitTypeLiteral(type: TypeLiteralType): string {
    return this.#literal(type.value);
  }
  protected override visitPlaceholder(type: PlaceholderType): string {
    return `%${type.label}`;
  }
  protected override visitTag(type: TagType): string {
    return `${this.visit(type.type)}#${type.tag}`;
  }

  #qualifier(type: NamedType): string {
    return [type.from === 'global' ? undefined : type.from, type.name].filter(Boolean).join(':');
  }
  #genericTypes(types: readonly Type[]): string {
    return types.length ? `<${types.map(t => this.visit(t)).join(', ')}>` : '';
  }

  #literal(value: TypeLiteralType['value']): string {
    if (typeof value === 'string') {
      return JSON.stringify(value);
    }
    if (typeof value === 'bigint') {
      return `${value}n`;
    }
    return String(value);
  }
}

export const stringifyVisitor = new StringifyVisitor();
