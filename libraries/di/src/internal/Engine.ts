import { Control, controlLifetime, type GetService, type Registration, type Request, UnsatisfiableError } from '@rhombus-std/di.core';
import { type FunctionType, type ListType, type TupleType, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { Plan } from './Plan/index.js';
import { Registry } from './Registry.js';

/** The resolution orchestrator: one per container. Composed as the innermost middleware element. */
export class Engine {
  readonly #registry: Registry;
  /** Addresses whose registrations carry the engine-owned {@link controlLifetime}, precomputed at construction. */
  readonly #controlLifetimeAddresses: ReadonlySet<Type>;

  constructor(registrations: Iterable<Registration<unknown>>) {
    this.#registry = new Registry(registrations);
    this.#controlLifetimeAddresses = new Set(
      Iterator.from(this.#registry.registrations)
        .filter(r => 'lifetime' in r && r.lifetime === controlLifetime)
        .map(r => r.address),
    );
  }

  // #region resolution

  /**
   * Resolves `request` from its registrations, or hands it to `next`.
   *
   * @remarks
   * The roster ask, `Control<Iterable<Registration<unknown>>>`, is answered by the engine itself
   * with the registrations it resolves against — how a middleware sweeping the manifest at build
   * reads it.
   *
   * A registration carrying {@link controlLifetime} is answered directly — its factory receives
   * the request and nothing else, bypassing the plan infrastructure.
   *
   * An address no registration matches is not the engine's to refuse: it flows through `next`,
   * and whatever stands beneath answers or refuses it.
   *
   * @throws {UnsatisfiableError} when the address is registered but something it needs is not.
   */
  getService(request: Request, next: GetService): any {
    const address = request.type;
    if (address === undefined) {
      throw new TypeError('getService received no address — the caller resolved without a service type');
    }
    if (address === typefor<Control<Iterable<Registration<unknown>>>>()) {
      return new Control(this.#registry.registrations);
    }

    if (this.#controlLifetimeAddresses.has(address)) {
      return this.#resolveControlLifetime(request);
    }

    // Planning must run before delegating: it answers unregistered object and tuple asks by
    // synthesis, which a registration check up front would turn away.
    let plan: Plan;
    try {
      plan = Plan.from(address, this.#registry);
    } catch (error) {
      if (error instanceof UnsatisfiableError && !this.#registry.hasMatch(address)) {
        return next(request);
      }
      throw error;
    }
    return Plan.realize(plan, { engine: this, context: {}, request });
  }

  /**
   * Answers a {@link controlLifetime} registration directly: the factory receives the request
   * with no planning and no caching.
   */
  #resolveControlLifetime(request: Request): unknown {
    const match = Iterator.from(this.#registry.getMatches(request.type))
      .find(m => 'lifetime' in m.registration && m.registration.lifetime === controlLifetime);
    if (!match) {
      throw new UnsatisfiableError(request.type, 'control-lifetime address has no registration');
    }
    const { registration } = match;
    if ('factory' in registration) {
      return registration.factory(request);
    }
    if ('value' in registration) {
      return registration.value;
    }
    throw new TypeError(`control-lifetime registration for ${Type.stringify(request.type)} has an unsupported implementer kind`);
  }

  // #endregion

  // #region internals

  /** The registrations this engine resolves against. */
  get registry(): Registry {
    return this.#registry;
  }

  /**
   * @param request - the request that opened the ask the caller was minted under.
   * @throws {UnsatisfiableError} when no signature of {@link registration} can be satisfied.
   */
  resolveFrame(registration: Registration<unknown>, request: Request): unknown {
    const plan = Plan.fromRegistration(registration, this.#registry);
    if (plan === undefined) {
      throw new UnsatisfiableError(registration.address, 'no signature of the invoked callable can be satisfied');
    }
    return Plan.realize(plan, { engine: this, context: {}, request });
  }

  /**
   * A latebound call: binds each arg to the first signature whose arity fits, positionally.
   * A call may stop short of the full signature wherever the remaining slots admit `undefined`.
   *
   * @param request - the request that opened the ask the callable was minted under.
   */
  resolveLatebound(funcType: FunctionType, providedArgs: readonly unknown[], request: Request): unknown {
    const signature = Iterator.from(Type.signatureRows(funcType.signatures))
      .map(row => boundArgTypes(row, providedArgs.length))
      .find(candidate => candidate !== undefined);

    if (signature === undefined) {
      throw new TypeError(`${Type.stringify(funcType)} has no signature accepting ${providedArgs.length} arg(s)`);
    }
    return Plan.realize(Plan.from(funcType.return, this.#registry, signature), { engine: this, context: { args: providedArgs }, request });
  }

  // #endregion
}

/**
 * The arg types a call of `count` args binds against one signature row, or undefined when the
 * arity does not fit: one fixed slot per position — a call may stop short wherever every
 * remaining slot admits `undefined` — and a rest slot absorbing every surplus position as its
 * element.
 */
function boundArgTypes(row: TupleType | ListType, count: number): readonly Type[] | undefined {
  // A list row's fixed slots are the interned empty tuple's members, never a fresh [], so a
  // zero-arg call binds the same array identity every time and the plan memo can hit.
  const members = row.kind === 'tuple' ? row.members : Type.tuple().members;
  if (count <= members.length) {
    return members.slice(count).every(Type.isOptional) ? members : undefined;
  }
  const element = row.kind === 'tuple' ? row.rest : row.element;
  if (element === undefined) {
    return undefined;
  }
  // Built as an interned tuple so a repeated arity binds the same array identity and the
  // plan memo behind Plan.from can hit.
  return Type.tuple(...members, ...Array.from({ length: count - members.length }, () => element)).members;
}
