import { CycleError, type Generic, type Invoker, type IServiceProvider } from '@rhombus-std/di.core';
import { type AbstractConstructorType, type ArrayType, type ConstructorType, type FunctionType, type GenericType, type GlobalType, type ImportedType, type IntersectionType, type IterableType,
  type ObjectType, type TagType, type TupleType, Type, type TypeLiteralType, type UnionType } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { Registry } from '../Registry.js';
import { Plan } from './Plan.js';

/**
 * Turns a type expression into the {@link Plan} that constructs a value for it.
 *
 * @remarks
 * Exact match lookup first, falling back to Type specific synthesis behavior.
 */
export class ToPlanVisitor extends Type.Visitor<Plan | undefined> {
  readonly #registry: Registry;
  /** A latebound caller's argument types, each naming the call position that supplies it. */
  readonly #args: ReadonlyMap<Type, number> | undefined;
  readonly #cycleGuard = new CycleGuard();
  /**
   * The first type this walk found nothing to build from — a true leaf, since a type whose own
   * recursion fails somewhere beneath it never reaches this field: the deeper failure sets it
   * first, and a leaf, having recursed into nothing, always attributes squarely to itself.
   */
  #missingDependency: Type | undefined;

  constructor(registry: Registry, args?: ReadonlyMap<Type, number>) {
    super();
    this.#registry = registry;
    this.#args = args;
  }

  /** The specific type the whole walk could not build from, once {@link visit} has returned `undefined`. */
  get missingDependency(): Type | undefined {
    return this.#missingDependency;
  }

  public override visit(address: Type): Plan | undefined {
    if (Type.isOpen(address)) {
      return undefined;
    }
    // A caller's argument outranks every registration, statically: the slot is served by the
    // call itself, so the manifest is never consulted for it.
    const argIndex = this.#args?.get(address);
    if (argIndex !== undefined) {
      return Plan.lateboundArg(argIndex);
    }
    using _guard = this.#cycleGuard.visiting(address);
    const plan = this.#registry.answering(address)
      .map(answer => Plan.fromAnswer(address, answer, this))
      .find(Boolean)
      ?? super.visit(address);
    if (plan === undefined && this.#missingDependency === undefined) {
      this.#missingDependency = address;
    }
    return plan;
  }

  protected override visitImported(type: ImportedType): Plan | undefined {
    if (type === typefor<IServiceProvider>()) {
      return Plan.serviceProvider();
    }
    const callableType = invokerCallableType(type);
    return callableType && Plan.invoker(callableType);
  }

  /** Nothing global is synthesizable: a global name describes none of itself to build from. */
  protected override visitGlobal(_type: GlobalType): Plan | undefined {
    return undefined;
  }

  protected override visitGeneric(_type: GenericType): Plan | undefined {
    return undefined;
  }

  /** Parked: composing one from its arg types on a miss awaits its design ruling. */
  protected override visitCtor(_type: ConstructorType): Plan | undefined {
    return undefined;
  }

  protected override visitAbstractCtor(_type: AbstractConstructorType): Plan | undefined {
    return undefined;
  }

  protected override visitFunc(type: FunctionType): Plan | undefined {
    return Plan.latebound(type);
  }

  protected override visitArray(type: ArrayType): Plan | undefined {
    return Plan.array(this.#collectionSites(type.element));
  }

  protected override visitIterable(type: IterableType): Plan | undefined {
    return Plan.iterable(this.#collectionSites(type.element));
  }

  protected override visitIntersection(_type: IntersectionType): Plan | undefined {
    // An intersection is satisfiable only by ONE registration matching every member, and the
    // whole-type lookup in `visit` already performed that search: no synthesis can produce a
    // value that is all parts at once, so there is nothing left to decompose.
    return undefined;
  }

  /** Parked: composing one from its property types on a miss awaits its design ruling. */
  protected override visitObject(_type: ObjectType): Plan | undefined {
    return undefined;
  }

  protected override visitTag(_type: TagType): Plan | undefined {
    return undefined;
  }

  protected override visitTuple(type: TupleType): Plan | undefined {
    const members = type.members.map(member => this.visit(member));
    if (members.some(p => !p)) {
      return undefined;
    }
    return Plan.factory((...args: any[]) => args, members as Plan[]);
  }

  protected override visitTypeLiteral(type: TypeLiteralType): Plan | undefined {
    return Plan.constant(type.value);
  }

  /**
   * Reached only once the union's own address has no buildable answer: the first resolvable
   * member wins, in canonical order. With literals ordered last among members, a literal keeps
   * serving as the fallback of an optional dependency without being a special case.
   */
  protected override visitUnion(type: UnionType): Plan | undefined {
    return Iterator.from(type.members)
      .map(member => this.visit(member))
      .find(Boolean);
  }

  /**
   * Every way the manifest produces {@link elementType}, in REGISTRATION order — services come
   * out in the order they were authored — with the element's one synthesis, if any, as the tail.
   */
  #collectionSites(elementType: Type): Plan[] {
    return this.#registry.answering(elementType)
      .map(answer => Plan.fromAnswer(elementType, answer, this))
      .toArray()
      .reverse()
      .concat(Type.isOpen(elementType) ? undefined : super.visit(elementType))
      .filter(p => p !== undefined);
  }
}

/**
 * The callable node `type` names through the value path's marker address — di.core's
 * `resolve(callableType, callable)` closes over it as `Invoker<typeof callableType>` — or
 * `undefined` when `type` is not that address.
 */
function invokerCallableType(type: ImportedType): ConstructorType | FunctionType | undefined {
  const [matched, generics] = Type.bindGenerics(typefor<Invoker<Generic<'C', Ctor | Func>>>(), type);
  const callableType = matched ? generics.get('C') : undefined;
  return callableType?.kind === 'ctor' || callableType?.kind === 'func' ? callableType : undefined;
}

/**
 * Guards the walk against re-entering a type it is still planning: `visiting(type)` throws
 * {@link CycleError} on a repeat, and otherwise tracks the type for the extent of the `using`
 * block holding the returned disposable.
 */
class CycleGuard {
  readonly #visiting: Type[] = [];

  visiting(address: Type): Disposable {
    if (this.#visiting.includes(address)) {
      throw new CycleError([...this.#visiting, address]);
    }
    this.#visiting.push(address);
    return {
      [Symbol.dispose]: () => {
        const left = this.#visiting.pop();
        if (left !== address) {
          throw new Error(
            `the resolution walk unwound out of order — expected to leave "${Type.stringify(address)}" but left "${left ? Type.stringify(left) : '<empty>'}"`,
          );
        }
      },
    };
  }
}
