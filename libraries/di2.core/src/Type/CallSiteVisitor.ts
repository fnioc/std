import { Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { CallSite } from '../CallSite/CallSite.js';
import { IManifest } from '../IManifest.js';
import { IServiceProvider } from '../IServiceProvider.js';
import { ServiceDescriptor } from '../ServiceDescriptor.js';
import { first, isAllThere } from '../utils.js';
import { type CtorType, type IntersectionType, type LateBoundType, type NamedType, type ObjectType,
  type PlaceholderType, type TagType, type TupleType, Type, type TypeLiteralType, type UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

interface ScopeCache {
  has(type: Type): boolean;
  get<T = any>(type: Type): T;
  set<T>(type: Type, value: T): T;
  getOrAdd<T>(type: Type, factory: Func<[Type], T>): T;
}
export interface CallSiteContext {
  readonly manifest: IManifest;
  readonly serviceProvider: IServiceProvider;
  readonly scope: ScopeCache;
}

/**
 * Lowers a type expression into the {@link CallSite} that constructs a value for it.
 *
 * @remarks
 * One instance per walk — {@link callSiteFor} is the entry point. Each step reads the
 * node it is given plus the walk-wide {@link CallSiteContext} fixed at construction.
 */
class CallSiteVisitor extends TypeVisitor<CallSite | undefined> {
  readonly #manifest: IManifest;
  readonly #serviceProvider: IServiceProvider;

  constructor(context: CallSiteContext) {
    super();
    this.#manifest = context.manifest;
    this.#serviceProvider = context.serviceProvider;
  }

  #lookup(type: Type) {
    return Iterator.from(this.#manifest)
      .map(desc => [...Type.satisfies(desc.serviceType, type), desc] as const)
      .filter(([status]) => status)
      .map(([isSuccess, placeholders, desc]) => ServiceDescriptor.substitute(desc!, placeholders as Map<string, Type>));
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
    return CallSite.make.factory((...args: any[]) => args, members);
  }

  protected override visitLateBound(type: LateBoundType): CallSite | undefined {
    return CallSite.make.latebound(type.returnType, type.args);
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

export function callSiteFor(type: Type, context: CallSiteContext): CallSite | undefined {
  return new CallSiteVisitor(context).visit(type);
}
