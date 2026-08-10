import { IManifest, ScopeCache, ServiceDescriptor } from '@rhombus-std/di2.core';
import { type CtorType, type FunctionType, type IntersectionType, IServiceProvider, type NamedType, type ObjectType,
  type PlaceholderType, type TagType, type TupleType, Type, type TypeLiteralType, TypeVisitor,
  type UnionType } from '@rhombus-std/primitives';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { CallSite } from './CallSite.js';
import { first, isAllThere } from './utils.js';

export interface CallSiteContext {
  readonly manifest: IManifest;
  readonly serviceProvider: IServiceProvider;
  readonly scope: ScopeCache;
}

/**
 * Lowers a type expression into the {@link CallSite} that constructs a value for it.
 *
 * @remarks
 * One instance per walk — {@link toCallSiteFor} is the entry point. Each step reads the
 * node it is given plus the walk-wide {@link CallSiteContext} fixed at construction.
 */
class ToCallSiteVisitor extends TypeVisitor<CallSite | undefined> {
  readonly #manifest: IManifest;
  readonly #serviceProvider: IServiceProvider;

  constructor(context: CallSiteContext) {
    super();
    this.#manifest = context.manifest;
    this.#serviceProvider = context.serviceProvider;
  }

  #lookup(type: Type) {
    return Iterator.from(this.#manifest)
      .map(desc => [...Type.op.satisfies(desc.serviceType, type), desc] as const)
      .filter(([status]) => status)
      .map(([isSuccess, placeholders, desc]) =>
        ServiceDescriptor.op.substitute(desc!, placeholders as Map<string, Type>)
      );
  }
  #lookupSingle(type: Type) {
    return this.#lookup(type).find(Boolean);
  }

  protected override visitUnion(type: UnionType) {
    return type.types.map(member => this.visit(member)).find(Boolean);
  }

  protected override visitIntersection(type: IntersectionType): CallSite | undefined {
  }

  protected override visitTuple(type: TupleType): CallSite | undefined {
    const members = type.types.map(member => this.visit(member));
    if (!isAllThere(members)) {
      return undefined;
    }
    return CallSite.factory((...args: any[]) => args, members);
  }

  protected override visitFunction(type: FunctionType): CallSite | undefined {
    return CallSite.latebound(type.returnType, type.args);
  }

  protected override visitNamed(type: NamedType): CallSite | undefined {
    const descriptor = this.#lookupSingle(type);
    if (!descriptor) {
      return undefined;
    }
    return CallSite.fromDescriptor(descriptor, this);
  }

  protected override visitObject(type: ObjectType): CallSite | undefined {
  }

  protected override visitTypeLiteral(type: TypeLiteralType): CallSite | undefined {
  }

  protected override visitPlaceholder(type: PlaceholderType): CallSite | undefined {
  }

  protected override visitTag(type: TagType): CallSite | undefined {
  }

  protected override visitCtor(type: CtorType): CallSite | undefined {
  }
}

export function toCallSiteFor(type: Type, context: CallSiteContext): CallSite | undefined {
  return new ToCallSiteVisitor(context).visit(type);
}
