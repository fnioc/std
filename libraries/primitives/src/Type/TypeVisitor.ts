import type { ArrayType, AsyncIterableType, AsyncType, CtorType, FuncType, GenericType, IntersectionType, IterableType,
  NamedType, ObjectType, TagType, TupleType, Type, TypeLiteralType, UnionType } from './Type.js';

/**
 * Dispatches a {@link Type} to the handler for its `kind`.
 *
 * `visit` is the entry point; subclasses supply the per-kind methods and call `this.visit(child)`
 * to recurse into a node's own children — a composite's members, a signature's arguments, an
 * aggregate's element, a tag's inner type.
 *
 * @typeParam Return - what each handler produces.
 */
export abstract class TypeVisitor<out Return, in Context = never> {
  public visit(type: Type): Return;
  public visit(type: Type, context: Context): Return;
  public visit(type: Type, context?: any): Return {
    switch (type.kind) {
      case 'array':
        return this.visitArray(type, context);
      case 'async':
        return this.visitAsync(type, context);
      case 'asyncIterable':
        return this.visitAsyncIterable(type, context);
      case 'ctor':
        return this.visitCtor(type, context);
      case 'func':
        return this.visitFunc(type, context);
      case 'generic':
        return this.visitGeneric(type, context);
      case 'intersection':
        return this.visitIntersection(type, context);
      case 'iterable':
        return this.visitIterable(type, context);
      case 'literal':
        return this.visitTypeLiteral(type, context);
      case 'named':
        return this.visitNamed(type, context);
      case 'object':
        return this.visitObject(type, context);
      case 'tag':
        return this.visitTag(type, context);
      case 'tuple':
        return this.visitTuple(type, context);
      case 'union':
        return this.visitUnion(type, context);
      default:
        return assertNever(type);
    }
  }

  protected abstract visitArray(type: ArrayType, context: Context): Return;

  protected abstract visitAsync(type: AsyncType, context: Context): Return;

  protected abstract visitAsyncIterable(type: AsyncIterableType, context: Context): Return;

  protected abstract visitCtor(type: CtorType, context: Context): Return;

  protected abstract visitFunc(type: FuncType, context: Context): Return;

  protected abstract visitGeneric(type: GenericType, context: Context): Return;

  protected abstract visitIntersection(type: IntersectionType, context: Context): Return;

  protected abstract visitIterable(type: IterableType, context: Context): Return;

  protected abstract visitNamed(type: NamedType, context: Context): Return;

  protected abstract visitObject(type: ObjectType, context: Context): Return;

  protected abstract visitTag(type: TagType, context: Context): Return;

  protected abstract visitTuple(type: TupleType, context: Context): Return;

  protected abstract visitTypeLiteral(type: TypeLiteralType, context: Context): Return;

  protected abstract visitUnion(type: UnionType, context: Context): Return;
}

// Local copy — primitives stays free of @rhombus-toolkit/type-guards as a dependency.
function assertNever(x: never): never {
  const kind = (x as { kind?: unknown; })?.kind;
  throw new Error(`unknown Type kind ${JSON.stringify(kind)}`);
}
