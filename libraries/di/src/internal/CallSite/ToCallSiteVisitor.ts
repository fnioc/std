import { AmbiguousUnionError, CycleError, Manifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { type CtorType, first, type FunctionType, type IntersectionType, isAllThere, type NamedType, type ObjectType,
  type PlaceholderType, type TagType, type TupleType, Type, type TypeLiteralType, TypeVisitor,
  type UnionType } from '@rhombus-std/primitives';
import { CallSite } from './CallSite.js';

export interface CallSiteContext {
  readonly manifest: Manifest;
  /** What to do when a union has more than one suppliable member; raising is the default. */
  readonly unionAmbiguity?: 'error' | 'newest';
}

/** A union member the manifest can supply, paired with what it lowered to. */
interface Suppliable {
  readonly member: Type;
  readonly site: CallSite;
}

/** The spellings under which a dependency on the provider itself is recognized. */
const SERVICE_PROVIDER_FROMS: readonly string[] = ['@rhombus-std/primitives', '@rhombus-std/di.core'];

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
  readonly #manifest: Manifest;
  readonly #unionAmbiguity: NonNullable<CallSiteContext['unionAmbiguity']>;
  /** The types this walk has entered and not yet finished, outermost first. */
  readonly #open: Type[] = [];

  constructor(context: CallSiteContext) {
    super();
    this.#manifest = context.manifest;
    this.#unionAmbiguity = context.unionAmbiguity ?? 'error';
  }

  public override visit(type: Type): CallSite | undefined {
    if (type.kind === 'placeholder') {
      return undefined;
    }
    if (this.#open.includes(type)) {
      throw new CycleError([...this.#open, type]);
    }
    this.#open.push(type);
    try {
      return this.#chosen(type) ?? super.visit(type);
    } finally {
      this.#open.pop();
    }
  }

  /**
   * The registration answering {@link type}, newest first, or undefined when none does.
   *
   * @remarks
   * A union asks which of several types is meant, and every registration serving any member
   * answers the whole union — so several answers are a contradiction rather than a preference.
   * Two registrations of ONE service type are not that: they are the ordinary newest-wins case.
   * A registration naming the union itself is an exact answer and settles it outright.
   *
   * @throws {AmbiguousUnionError} when several service types answer a union and the provider was
   * built to raise rather than take the newest.
   */
  #chosen(type: Type): CallSite | undefined {
    if (type.kind !== 'union') {
      return first(this.#candidates(type));
    }
    const answers = this.#lookup(type)
      .map(descriptor => [descriptor.serviceType, CallSite.fromDescriptor(descriptor, this)] as const)
      .filter((answer): answer is [Type, CallSite] => answer[1] !== undefined)
      .toArray();
    const exact = answers.find(([serviceType]) => serviceType === type);
    if (exact) {
      return exact[1];
    }
    const competing = [...new Set(answers.map(([serviceType]) => serviceType))];
    if (competing.length > 1 && this.#unionAmbiguity === 'error') {
      throw new AmbiguousUnionError(type, competing.toSorted(bySpelling));
    }
    return answers[0]?.[1];
  }

  /**
   * Every registration that can serve {@link type}, newest first, each closed over the
   * placeholders its match captured.
   *
   * @remarks
   * The registration is the PATTERN side and must extend the
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

  /**
   * Reached only once {@link #chosen} finds no registration for the union — and since a
   * registration for any member answers the whole union, that means no member has one either.
   * What remains is synthesis, where the same one-answer rule holds: a member that supplies
   * itself, a literal and so `undefined`, is the union's fallback rather than a competitor, which
   * is what leaves an optional dependency resolving to nothing when its service is absent.
   *
   * @throws {AmbiguousUnionError} when several members synthesize and the provider was built to
   * raise rather than take one.
   */
  protected override visitUnion(type: UnionType): CallSite | undefined {
    const synthesized: Suppliable[] = [];
    for (const member of type.members) {
      if (member.kind === 'literal') {
        continue;
      }
      const site = this.visit(member);
      if (site !== undefined) {
        synthesized.push({ member, site });
      }
    }
    if (synthesized.length > 1 && this.#unionAmbiguity === 'error') {
      throw new AmbiguousUnionError(type, synthesized.map(candidate => candidate.member));
    }
    if (synthesized.length) {
      return synthesized[0]!.site;
    }
    const fallback = type.members.find(member => member.kind === 'literal');
    if (fallback === undefined) {
      return undefined;
    }
    return this.visit(fallback);
  }

  protected override visitIntersection(_type: IntersectionType): CallSite | undefined {
    // An intersection is satisfiable only by ONE registration matching every member, and the
    // whole-type lookup in `visit` already performed that search: no synthesis can produce a
    // value that is all parts at once, so there is nothing left to decompose.
    return undefined;
  }

  protected override visitTuple(type: TupleType): CallSite | undefined {
    const members = type.members.map(member => this.visit(member));
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
      return CallSite.iterable(this.#collection(type.genericArgs[0]!));
    }
    if (isAsyncIterableType(type)) {
      return CallSite.asyncIterable(this.#collection(type.genericArgs[0]!));
    }
    if (isArrayType(type)) {
      return CallSite.array(this.#collection(type.genericArgs[0]!));
    }
    return undefined;
  }

  /**
   * Every way the manifest can produce {@link itemType}, in REGISTRATION order, materialized so
   * the call site survives repeated realization.
   *
   * @remarks
   * Registration order is what a consumer walking the collection expects — services come out in
   * the order they were authored. It also puts the newest registration last, which is the one a
   * request for a single {@link itemType} resolves to, so "the collection ends with the singular
   * answer" holds without being arranged for separately.
   *
   * Synthesis leads because a registration outranks it: {@link visit} consults the manifest before
   * falling back to synthesis, so the synthesized member is the weakest answer and belongs at the
   * end newest-wins never reaches.
   */
  #collection(itemType: Type): CallSite[] {
    const registered = [...this.#candidates(itemType)].reverse();
    const synthesized = this.#synthesized(itemType);
    return synthesized ? [synthesized, ...registered] : registered;
  }

  /**
   * The synthesis route only — registration hits are the collection's other category and must
   * not repeat here, so a union takes its members' syntheses rather than re-running lookups.
   *
   * @remarks
   * A union here takes the first member that synthesizes, in canonical order, rather than the
   * one-answer rule {@link visitUnion} applies. Its caller is assembling a collection, where
   * several answers are the point rather than a contradiction.
   */
  #synthesized(type: Type): CallSite | undefined {
    if (type.kind === 'union') {
      for (const member of type.members) {
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

/** Orders competing service types by their canonical spelling, so a message reads the same twice. */
function bySpelling(left: Type, right: Type): number {
  return Type.stringify(left).localeCompare(Type.stringify(right));
}

function isServiceProviderType(type: NamedType): boolean {
  return type.name === 'IServiceProvider' && SERVICE_PROVIDER_FROMS.includes(type.from)
    && !type.genericArgs.length;
}

function isIterableType(type: NamedType): boolean {
  return type.name === 'Iterable' && type.from === 'global' && type.genericArgs.length === 1;
}

function isAsyncIterableType(type: NamedType): boolean {
  return type.name === 'AsyncIterable' && type.from === 'global' && type.genericArgs.length === 1;
}

/** `T[]` and `Array<T>` derive the same type, so one recognition covers both spellings. */
function isArrayType(type: NamedType): boolean {
  return type.name === 'Array' && type.from === 'global' && type.genericArgs.length === 1;
}
