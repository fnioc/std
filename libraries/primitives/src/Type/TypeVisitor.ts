import type { CtorType, FunctionType, IntersectionType, NamedType, ObjectType, PlaceholderType, TagType, TupleType,
  Type, TypeLiteralType, UnionType } from './Type.js';

/**
 * Dispatches a {@link Type} to the handler for its `kind`.
 *
 * `visit` is the entry point; subclasses supply the per-kind methods and call
 * `this.visit(child)` to recurse into `types`, `genericTypes`, or a tag's inner
 * type.
 *
 * @typeParam Return - what each handler produces.
 */
export abstract class TypeVisitor<out Return, in Context = never> {
  public visit(type: Type): Return;
  public visit(type: Type, context: Context): Return;
  public visit(type: Type, context?: any): Return {
    switch (type.kind) {
      case 'union':
        return this.visitUnion(type, context);
      case 'intersection':
        return this.visitIntersection(type, context);
      case 'tuple':
        return this.visitTuple(type, context);
      case 'function':
        return this.visitFunction(type, context);
      case 'named':
        return this.visitNamed(type, context);
      case 'object':
        return this.visitObject(type, context);
      case 'literal':
        return this.visitTypeLiteral(type, context);
      case 'placeholder':
        return this.visitPlaceholder(type, context);
      case 'tag':
        return this.visitTag(type, context);
      case 'ctor':
        return this.visitCtor(type, context);
      default:
        return assertNever(type);
    }
  }

  protected abstract visitUnion(type: UnionType, context: Context): Return;
  protected abstract visitIntersection(type: IntersectionType, context: Context): Return;
  protected abstract visitTuple(type: TupleType, context: Context): Return;
  protected abstract visitFunction(type: FunctionType, context: Context): Return;
  protected abstract visitNamed(type: NamedType, context: Context): Return;
  protected abstract visitObject(type: ObjectType, context: Context): Return;
  protected abstract visitTypeLiteral(type: TypeLiteralType, context: Context): Return;
  protected abstract visitPlaceholder(type: PlaceholderType, context: Context): Return;
  protected abstract visitTag(type: TagType, context: Context): Return;
  protected abstract visitCtor(type: CtorType, context: Context): Return;
}

// Local copy — primitives stays free of @rhombus-toolkit/type-guards as a dependency.
function assertNever(x: never): never {
  const kind = (x as { kind?: unknown; })?.kind;
  throw new Error(`unknown Type kind ${JSON.stringify(kind)}`);
}
