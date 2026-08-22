import { CycleError, type IServiceProvider, type IServiceScopeFactory } from '@rhombus-std/di.core';
import { type ArrayType, type ConstructorType, type FunctionType, type GenericType, type GlobalType, type ImportedType, type IntersectionType, type IterableType, type ObjectType, type TagType,
  type TupleType, Type, type TypeLiteralType, type UnionType } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Registry } from '../Registry.js';
import { CallSite } from './CallSite.js';

export interface CallSiteContext {
  readonly registry: Registry;
}

/**
 * Guards a walk against re-entering a type it is still building: `visiting(type)` throws
 * {@link CycleError} on a repeat, and otherwise pushes the type for the extent of the `using`
 * block that holds the returned disposable.
 */
function makeVisitingGuard() {
  const stack: Type[] = [];
  class VisitDisposer implements Disposable {
    readonly #visiting: Type;
    constructor(visiting: Type) {
      stack.push(this.#visiting = visiting);
    }
    [Symbol.dispose](): void {
      const popped = stack.pop();
      if (popped !== this.#visiting) {
        throw new Error(
          `the resolution walk unwound out of order — expected to leave "${Type.stringify(this.#visiting)}" but left "${popped ? Type.stringify(popped) : '<empty>'}"`,
        );
      }
    }
  }
  return function visiting(type: Type): Disposable {
    if (stack.includes(type)) {
      throw new CycleError([...stack, type]);
    }
    return new VisitDisposer(type);
  };
}

/**
 * Turns a type expression into the {@link CallSite} that constructs a value for it.
 *
 * @remarks
 * One instance per walk — {@link CallSite.from} is the entry point. Every node first runs the
 * exact-answer loop: the registrations answering the type's own address, newest first, and the
 * first one that builds wins — an unbuildable answer falls through to the next. Only when none
 * builds does the per-kind step run, as decomposition or synthesis, so a registration for a
 * composite beats its parts. Undefined means the type is unsatisfiable from this manifest; the
 * composite steps use that to fall back — a union tries its next member, a descriptor its next
 * signature. Re-entering a type the walk is still building throws {@link CycleError} instead,
 * which ends the walk outright rather than falling back: no later member or signature can undo
 * a loop.
 */
export class ToCallSiteVisitor extends Type.Visitor<CallSite | undefined> {
  readonly #registry: Registry;
  /** Guards against re-entering a type this walk is still building. */
  readonly #visiting = makeVisitingGuard();
  constructor(context: CallSiteContext) {
    super();
    this.#registry = context.registry;
  }

  public override visit(type: Type): CallSite | undefined {
    // An open type stands for a family rather than a value, so there is nothing to build until a
    // request closes its holes.
    if (Type.isOpen(type)) {
      return undefined;
    }
    using guard = this.#visiting(type);
    return this.#firstAnswerBuilt(type) ?? super.visit(type);
  }

  protected override visitArray(type: ArrayType): CallSite | undefined {
    return CallSite.array(this.#collectionSites(type.element));
  }

  /** Parked: composing one from its parameter types on a miss awaits its design ruling. */
  protected override visitCtor(_type: ConstructorType): CallSite | undefined {
    return undefined;
  }

  protected override visitFunc(type: FunctionType): CallSite | undefined {
    return CallSite.latebound(type.return, type.args);
  }

  protected override visitGeneric(_type: GenericType): CallSite | undefined {
    return undefined;
  }

  protected override visitIntersection(_type: IntersectionType): CallSite | undefined {
    // An intersection is satisfiable only by ONE registration matching every member, and the
    // whole-type lookup in `visit` already performed that search: no synthesis can produce a
    // value that is all parts at once, so there is nothing left to decompose.
    return undefined;
  }

  protected override visitIterable(type: IterableType): CallSite | undefined {
    return CallSite.iterable(this.#collectionSites(type.element));
  }

  /** Nothing global is synthesizable: a global name describes none of itself to build from. */
  protected override visitGlobal(_type: GlobalType): CallSite | undefined {
    return undefined;
  }

  protected override visitImported(type: ImportedType): CallSite | undefined {
    if (type === typefor<IServiceProvider>()) {
      return CallSite.serviceProvider();
    }
    if (type === typefor<IServiceScopeFactory>()) {
      return CallSite.serviceScopeFactory();
    }
    return undefined;
  }

  /** Parked: composing one from its property types on a miss awaits its design ruling. */
  protected override visitObject(_type: ObjectType): CallSite | undefined {
    return undefined;
  }

  protected override visitTag(_type: TagType): CallSite | undefined {
    return undefined;
  }

  protected override visitTuple(type: TupleType): CallSite | undefined {
    const members: CallSite[] = [];
    for (const member of type.members) {
      const site = this.visit(member);
      if (site === undefined) {
        return undefined;
      }
      members.push(site);
    }
    return CallSite.factory((...args: any[]) => args, members);
  }

  protected override visitTypeLiteral(type: TypeLiteralType): CallSite | undefined {
    return CallSite.constant(type.value);
  }

  /**
   * Reached only once the union's own address has no buildable answer. Two phases over the
   * members in canonical order, because a registration outranks synthesis here as everywhere:
   * first the members' own registrations, then the members' syntheses. The first member that
   * delivers wins either phase — with literals ordered last among members, a literal keeps
   * serving as the fallback of an optional dependency without being a special case, while a
   * registration for a nullish member wins the first phase like any other.
   */
  protected override visitUnion(type: UnionType): CallSite | undefined {
    for (const member of type.members) {
      const registered = this.#firstAnswerBuilt(member);
      if (registered !== undefined) {
        return registered;
      }
    }
    for (const member of type.members) {
      const synthesized = super.visit(member);
      if (synthesized !== undefined) {
        return synthesized;
      }
    }
    return undefined;
  }

  /**
   * The newest registration answering {@link type}'s own address that actually builds; an
   * unbuildable answer falls through to the next.
   */
  #firstAnswerBuilt(type: Type): CallSite | undefined {
    for (const answer of this.#registry.answering(type)) {
      const site = CallSite.fromAnswer(answer, this);
      if (site !== undefined) {
        return site;
      }
    }
    return undefined;
  }

  /**
   * Every way the manifest produces {@link elementType}, in REGISTRATION order — services come
   * out in the order they were authored — with the element's one synthesis, if any, as the tail.
   */
  #collectionSites(elementType: Type): CallSite[] {
    const sites: CallSite[] = [];
    for (const answer of this.#registry.answering(elementType)) {
      const site = CallSite.fromAnswer(answer, this);
      if (site !== undefined) {
        sites.push(site);
      }
    }
    sites.reverse();
    const synthesized = Type.isOpen(elementType) ? undefined : super.visit(elementType);
    if (synthesized !== undefined) {
      sites.push(synthesized);
    }
    return sites;
  }
}
