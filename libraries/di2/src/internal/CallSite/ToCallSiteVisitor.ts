import { CycleError, IManifest, ServiceDescriptor } from '@rhombus-std/di2.core';
import { type CtorType, type FunctionType, type IntersectionType, type NamedType, type ObjectType, type PlaceholderType,
  type TagType, type TupleType, Type, type TypeLiteralType, TypeVisitor,
  type UnionType } from '@rhombus-std/primitives';
import { CallSite } from './CallSite.js';
import { first, isAllThere } from './utils.js';

export interface CallSiteContext {
  readonly manifest: IManifest;
}

/** The spellings under which a dependency on the provider itself is recognized. */
const SERVICE_PROVIDER_FROMS: readonly string[] = ['@rhombus-std/primitives', '@rhombus-std/di2.core'];

/**
 * Lowers a type expression into the {@link CallSite} that constructs a value for it.
 *
 * @remarks
 * One instance per walk — {@link CallSite.from} is the entry point. Every node is first checked
 * for a whole-type registration match; the per-kind steps are only the fallback decomposition or
 * synthesis, so a registration for a composite beats its parts. Undefined means the type is
 * unsatisfiable from this manifest; the composite steps use that to fall back — a union tries
 * its next member, a descriptor its next signature. Re-entering a type the walk is still
 * lowering throws {@link CycleError} instead, which ends the walk outright rather than falling
 * back: no later member or signature can undo a loop.
 */
export class ToCallSiteVisitor extends TypeVisitor<CallSite | undefined> {
  readonly #manifest: IManifest;
  /** The types this walk has entered and not yet finished, outermost first. */
  readonly #open: Type[] = [];

  constructor(context: CallSiteContext) {
    super();
    this.#manifest = context.manifest;
  }

  public override visit(type: Type): CallSite | undefined {
    if (type.kind === 'placeholder') {
      return undefined;
    }
    if (this.#open.some(open => Type.equals(open, type))) {
      throw new CycleError([...this.#open, type]);
    }
    this.#open.push(type);
    try {
      return first(this.#candidates(type)) ?? super.visit(type);
    } finally {
      this.#open.pop();
    }
  }

  /**
   * Every registration that can serve {@link type}, newest first, each closed over the
   * placeholders its match captured. The registration is the PATTERN side and must extend the
   * request — its value has to be usable AS the requested type — with its placeholders
   * capturing the request's fragments, so `Box<%T>` serves `Box<Foo>` closed over `T := Foo`.
   */
  #lookup(type: Type) {
    return Iterator.from(this.#manifest)
      .map(desc => [...Type.match(desc.serviceType, type), desc] as const)
      .filter(([matched]) => matched)
      .map(([, placeholders, desc]) => ServiceDescriptor.substitute(desc!, placeholders as Map<string, Type>));
  }

  /** Every {@link #lookup} hit that actually lowers, newest first. */
  #candidates(type: Type) {
    return this.#lookup(type)
      .map(descriptor => CallSite.fromDescriptor(descriptor, this))
      .filter((site): site is CallSite => !!site);
  }

  protected override visitUnion(type: UnionType): CallSite | undefined {
    return Iterator.from(type.types).map(member => this.visit(member)).find(Boolean);
  }

  protected override visitIntersection(_type: IntersectionType): CallSite | undefined {
    // An intersection is satisfiable only by ONE registration matching every member, and the
    // whole-type lookup in `visit` already performed that search: no synthesis can produce a
    // value that is all parts at once, so there is nothing left to decompose.
    return undefined;
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
    if (isServiceProviderType(type)) {
      return CallSite.serviceProvider();
    }
    if (isIterableType(type)) {
      const itemType = type.genericTypes[0]!;
      // Materialized: the iterable callsite must survive repeated realization.
      const collected = [...this.#candidates(itemType)];
      const synthesized = this.#synthesized(itemType);
      if (synthesized) {
        collected.push(synthesized);
      }
      return CallSite.iterable(collected);
    }
    return undefined;
  }

  /**
   * The synthesis route only — registration hits are the collection's other category and must
   * not repeat here, so a union takes its members' syntheses rather than re-running lookups.
   */
  #synthesized(type: Type): CallSite | undefined {
    if (type.kind === 'union') {
      for (const member of type.types) {
        const site = this.#synthesized(member);
        if (site) {
          return site;
        }
      }
      return undefined;
    }
    return super.visit(type);
  }

  protected override visitObject(_type: ObjectType): CallSite | undefined {
    return undefined;
  }

  protected override visitTypeLiteral(type: TypeLiteralType): CallSite | undefined {
    return CallSite.constant(type.value);
  }

  protected override visitPlaceholder(_type: PlaceholderType): CallSite | undefined {
    return undefined;
  }

  protected override visitTag(_type: TagType): CallSite | undefined {
    return undefined;
  }

  protected override visitCtor(_type: CtorType): CallSite | undefined {
    return undefined;
  }
}

function isServiceProviderType(type: NamedType): boolean {
  return type.name === 'IServiceProvider' && SERVICE_PROVIDER_FROMS.includes(type.from)
    && !type.genericTypes.length;
}

function isIterableType(type: NamedType): boolean {
  return type.name === 'Iterable' && type.from === 'global' && type.genericTypes.length === 1;
}
