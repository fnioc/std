import { CycleError, type IServiceProvider } from '@rhombus-std/di.core';
import { type ArrayType, type ConstructorType, type FunctionType, type GenericType, type GlobalType, type ImportedType, type IntersectionType, type IterableType, type ObjectType, type TagType,
  type TupleType, Type, type TypeLiteralType, type UnionType } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Registry } from '../Registry.js';
import { CallSite } from './CallSite.js';

/**
 * Turns a type expression into the {@link CallSite} that constructs a value for it.
 *
 * @remarks
 * Exact match lookup first, falling back to Type specific synthesis behavior.
 */
export class ToCallSiteVisitor extends Type.Visitor<CallSite | undefined> {
  readonly #registry: Registry;
  /** A latebound caller's argument types, each naming the call position that supplies it. */
  readonly #args: ReadonlyMap<Type, number> | undefined;
  readonly #cycleGuard = new CycleGuard();
  constructor(registry: Registry, args?: ReadonlyMap<Type, number>) {
    super();
    this.#registry = registry;
    this.#args = args;
  }

  public override visit(serviceType: Type): CallSite | undefined {
    if (Type.isOpen(serviceType)) {
      return undefined;
    }
    // A caller's argument outranks every registration, statically: the slot is served by the
    // call itself, so the manifest is never consulted for it.
    const argIndex = this.#args?.get(serviceType);
    if (argIndex !== undefined) {
      return CallSite.lateboundArg(argIndex);
    }
    using _guard = this.#cycleGuard.visiting(serviceType);
    return this.#registry.answering(serviceType)
      .map(answer => CallSite.fromAnswer(serviceType, answer, this))
      .find(Boolean)
      ?? super.visit(serviceType);
  }

  protected override visitImported(type: ImportedType): CallSite | undefined {
    if (type === typefor<IServiceProvider>()) {
      return CallSite.serviceProvider();
    }
    return undefined;
  }

  /** Nothing global is synthesizable: a global name describes none of itself to build from. */
  protected override visitGlobal(_type: GlobalType): CallSite | undefined {
    return undefined;
  }

  protected override visitGeneric(_type: GenericType): CallSite | undefined {
    return undefined;
  }

  /** Parked: composing one from its parameter types on a miss awaits its design ruling. */
  protected override visitCtor(_type: ConstructorType): CallSite | undefined {
    return undefined;
  }

  protected override visitFunc(type: FunctionType): CallSite | undefined {
    return CallSite.latebound(type);
  }

  protected override visitArray(type: ArrayType): CallSite | undefined {
    return CallSite.array(this.#collectionSites(type.element));
  }

  protected override visitIterable(type: IterableType): CallSite | undefined {
    return CallSite.iterable(this.#collectionSites(type.element));
  }

  protected override visitIntersection(_type: IntersectionType): CallSite | undefined {
    // An intersection is satisfiable only by ONE registration matching every member, and the
    // whole-type lookup in `visit` already performed that search: no synthesis can produce a
    // value that is all parts at once, so there is nothing left to decompose.
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
    const members = type.members.map(member => this.visit(member));
    if (members.some(p => !p)) {
      return undefined;
    }
    return CallSite.factory((...args: any[]) => args, members as CallSite[]);
  }

  protected override visitTypeLiteral(type: TypeLiteralType): CallSite | undefined {
    return CallSite.constant(type.value);
  }

  /**
   * Reached only once the union's own address has no buildable answer: the first resolvable
   * member wins, in canonical order. With literals ordered last among members, a literal keeps
   * serving as the fallback of an optional dependency without being a special case.
   */
  protected override visitUnion(type: UnionType): CallSite | undefined {
    return Iterator.from(type.members)
      .map(member => this.visit(member))
      .find(Boolean);
  }

  /**
   * Every way the manifest produces {@link elementType}, in REGISTRATION order — services come
   * out in the order they were authored — with the element's one synthesis, if any, as the tail.
   */
  #collectionSites(elementType: Type): CallSite[] {
    return this.#registry.answering(elementType)
      .map(answer => CallSite.fromAnswer(elementType, answer, this))
      .toArray()
      .reverse()
      .concat(Type.isOpen(elementType) ? undefined : super.visit(elementType))
      .filter(p => p !== undefined);
  }
}

/**
 * Guards the walk against re-entering a type it is still planning: `visiting(type)` throws
 * {@link CycleError} on a repeat, and otherwise tracks the type for the extent of the `using`
 * block holding the returned disposable.
 */
class CycleGuard {
  readonly #visiting: Type[] = [];

  visiting(serviceType: Type): Disposable {
    if (this.#visiting.includes(serviceType)) {
      throw new CycleError([...this.#visiting, serviceType]);
    }
    this.#visiting.push(serviceType);
    return {
      [Symbol.dispose]: () => {
        const left = this.#visiting.pop();
        if (left !== serviceType) {
          throw new Error(
            `the resolution walk unwound out of order — expected to leave "${Type.stringify(serviceType)}" but left "${left ? Type.stringify(left) : '<empty>'}"`,
          );
        }
      },
    };
  }
}
