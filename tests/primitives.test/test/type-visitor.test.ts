// Behaviour tests for the TypeVisitor dispatch machinery itself: visiting a node reaches the
// handler matching its own kind, a context value threads through recursive calls, and a node
// carrying no recognized kind fails loudly rather than being silently skipped.

import { type AbstractConstructorType, type ArrayType, type ConstructorType, type FunctionType, type GenericType, type GlobalType, type ImportedType, type IntersectionType, type IterableType,
  type ObjectType, type TagType, type TupleType, Type, type TypeLiteralType, type UnionType } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');

/** Returns the kind of whatever it visits, so a fixture proves it reached the matching handler. */
class KindVisitor extends Type.Visitor<string> {
  protected override visitArray(type: ArrayType): string {
    return type.kind;
  }
  protected override visitCtor(type: ConstructorType): string {
    return type.kind;
  }
  protected override visitAbstractCtor(type: AbstractConstructorType): string {
    return type.kind;
  }
  protected override visitFunc(type: FunctionType): string {
    return type.kind;
  }
  protected override visitGeneric(type: GenericType): string {
    return type.kind;
  }
  protected override visitGlobal(type: GlobalType): string {
    return type.kind;
  }
  protected override visitImported(type: ImportedType): string {
    return type.kind;
  }
  protected override visitIntersection(type: IntersectionType): string {
    return type.kind;
  }
  protected override visitIterable(type: IterableType): string {
    return type.kind;
  }
  protected override visitObject(type: ObjectType): string {
    return type.kind;
  }
  protected override visitTag(type: TagType): string {
    return type.kind;
  }
  protected override visitTuple(type: TupleType): string {
    return type.kind;
  }
  protected override visitTypeLiteral(type: TypeLiteralType): string {
    return type.kind;
  }
  protected override visitUnion(type: UnionType): string {
    return type.kind;
  }
}

/** Counts every node reachable from the root, recursing into every child position each kind has. */
class CountVisitor extends Type.Visitor<number> {
  protected override visitArray(type: ArrayType): number {
    return 1 + this.visit(type.element);
  }
  protected override visitCtor(type: ConstructorType): number {
    return 1 + this.visit(type.instance) + this.visit(type.signatures);
  }
  protected override visitAbstractCtor(type: AbstractConstructorType): number {
    return 1 + this.visit(type.instance) + this.visit(type.signatures);
  }
  protected override visitFunc(type: FunctionType): number {
    return 1 + this.visit(type.return) + this.visit(type.signatures);
  }
  protected override visitGeneric(_type: GenericType): number {
    return 1;
  }
  protected override visitGlobal(type: GlobalType): number {
    return 1 + this.#sum(type.genericArgs);
  }
  protected override visitImported(type: ImportedType): number {
    return 1 + this.#sum(type.genericArgs);
  }
  protected override visitIntersection(type: IntersectionType): number {
    return 1 + this.#sum(type.members);
  }
  protected override visitIterable(type: IterableType): number {
    return 1 + this.visit(type.element);
  }
  protected override visitObject(type: ObjectType): number {
    return 1 + this.#sum(Object.values(type.members));
  }
  protected override visitTag(type: TagType): number {
    return 1 + this.visit(type.type);
  }
  protected override visitTuple(type: TupleType): number {
    return 1 + this.#sum(type.members) + (type.rest === undefined ? 0 : this.visit(type.rest));
  }
  protected override visitTypeLiteral(_type: TypeLiteralType): number {
    return 1;
  }
  protected override visitUnion(type: UnionType): number {
    return 1 + this.#sum(type.members);
  }

  #sum(types: readonly Type[]): number {
    return types.reduce((total, type) => total + this.visit(type), 0);
  }
}

/** Threads a path string through recursion, proving the context argument reaches every call. */
class PathVisitor extends Type.Visitor<string, string> {
  protected override visitArray(type: ArrayType, path: string): string {
    return this.visit(type.element, `${path}>array`);
  }
  protected override visitCtor(type: ConstructorType, path: string): string {
    return this.visit(type.instance, `${path}>ctor`);
  }
  protected override visitAbstractCtor(type: AbstractConstructorType, path: string): string {
    return this.visit(type.instance, `${path}>abstract-ctor`);
  }
  protected override visitFunc(type: FunctionType, path: string): string {
    return this.visit(type.return, `${path}>func`);
  }
  protected override visitGeneric(_type: GenericType, path: string): string {
    return `${path}>generic`;
  }
  protected override visitGlobal(_type: GlobalType, path: string): string {
    return `${path}>global`;
  }
  protected override visitImported(_type: ImportedType, path: string): string {
    return `${path}>imported`;
  }
  protected override visitIntersection(type: IntersectionType, path: string): string {
    return type.members.map(member => this.visit(member, `${path}>intersection`)).join('|');
  }
  protected override visitIterable(type: IterableType, path: string): string {
    return this.visit(type.element, `${path}>iterable`);
  }
  protected override visitObject(type: ObjectType, path: string): string {
    return Object.entries(type.members).map(([key, member]) => this.visit(member, `${path}>object.${key}`))
      .join('|');
  }
  protected override visitTag(type: TagType, path: string): string {
    return this.visit(type.type, `${path}>tag`);
  }
  protected override visitTuple(type: TupleType, path: string): string {
    return type.members.map((member, index) => this.visit(member, `${path}>tuple${index}`)).join('|');
  }
  protected override visitTypeLiteral(_type: TypeLiteralType, path: string): string {
    return `${path}>literal`;
  }
  protected override visitUnion(type: UnionType, path: string): string {
    return type.members.map(member => this.visit(member, `${path}>union`)).join('|');
  }
}

describe('TypeVisitor dispatch', () => {
  test('dispatches to the handler matching each node kind', () => {
    const visitor = new KindVisitor();
    const cases: ReadonlyArray<[Type, string]> = [
      [Type.array(A), 'array'],
      [Type.ctor(A, [[]]), 'ctor'],
      [Type.func(A, [[]]), 'func'],
      [Type.generic('T'), 'generic'],
      [Type.global('string'), 'global'],
      [A, 'imported'],
      [Type.intersection(A, B) as IntersectionType, 'intersection'],
      [Type.iterable(A), 'iterable'],
      [Type.typeLiteral(5), 'literal'],
      [Type.object({ a: A }), 'object'],
      [Type.tag(A, 'primary'), 'tag'],
      [Type.tuple(A, B), 'tuple'],
      [Type.union(A, B) as UnionType, 'union'],
    ];
    for (const [type, expected] of cases) {
      expect(visitor.visit(type)).toBe(expected);
    }
  });

  test('an unrecognized kind throws rather than being silently skipped', () => {
    const visitor = new KindVisitor();
    const bogus = { kind: 'bogus' } as unknown as Type;
    expect(() => visitor.visit(bogus)).toThrow(/unknown Type kind "bogus"/);
  });

  test('recurses into every child position a composite node has', () => {
    const tree = Type.tuple(A, Type.array(B), Type.union(A, Type.iterable(B)) as UnionType);
    expect(new CountVisitor().visit(tree)).toBe(8);
  });

  test('threads a context value through every recursive call', () => {
    const tree = Type.tuple(A, Type.array(B));
    expect(new PathVisitor().visit(tree, 'root')).toBe('root>tuple0>imported|root>tuple1>array>imported');
  });
});
