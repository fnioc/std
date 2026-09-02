import { type ControlService, type GetService, type IServiceProvider, Registration, type Request, type ServiceRequest, UnsatisfiableError } from '@rhombus-std/di.core';
import { type FunctionType, type ListType, type TupleType, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { concat } from '@rhombus-toolkit/obj';
import { ServiceProvider } from '../ServiceProvider.js';
import { Plan, type VisitorContext } from './Plan/index.js';
import { InstalledHooks } from './Plan/InstalledHooks.js';
import { Registry } from './Registry.js';

/** The resolution orchestrator: one per container. Composed as the innermost middleware element. */
export class Engine {
  readonly #registry: Registry;
  readonly #hooks: InstalledHooks;
  /** The engine's own two rows, by identity — the nodes no hook ever fires at. */
  readonly #seeds: ReadonlySet<Registration<unknown>>;

  constructor(registrations: Iterable<Registration<unknown>>) {
    // A fresh view per handout, forwarding to the provider that opened the ask — provider
    // identity is never a contract, and the view is never the container object itself.
    const provider = (request: ServiceRequest): IServiceProvider => new ServiceProvider(inner => request.serviceProvider.getService(inner.type));
    const control = (): ControlService => this.#hooks;
    // The engine's own rows file after the given ones, so they are the OLDEST and any user
    // registration at the same address shadows them. Both carry a null lifetime — no model
    // governs them, and hooks never fire at their nodes.
    const seeds = [
      Registration.factory(typefor<IServiceProvider>(), provider, typefor(provider), null),
      Registration.factory(typefor<ControlService>(), control, typefor(control), null),
    ];
    this.#registry = new Registry(concat<Registration<unknown>>(registrations, seeds));
    // Read back off the registry so seed identity tracks whatever it filed.
    this.#seeds = new Set(this.#registry.registrations.slice(-seeds.length));
    this.#hooks = new InstalledHooks(this.#registry.registrations);
  }

  // #region resolution

  /**
   * Resolves `request` from its registrations, or hands it to `next`.
   *
   * @remarks
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
    return Plan.realize(plan, { engine: this, context: EMPTY_CONTEXT, request });
  }

  // #endregion

  // #region internals

  /** The registrations this engine resolves against. */
  get registry(): Registry {
    return this.#registry;
  }

  /** The installed behaviors — this engine's `ControlService` implementation. */
  get installedHooks(): InstalledHooks {
    return this.#hooks;
  }

  /** Whether `registration` is one of this engine's own seeded rows. */
  isSeeded(registration: Registration<unknown>): boolean {
    return this.#seeds.has(registration);
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
    return Plan.realize(plan, { engine: this, context: EMPTY_CONTEXT, request });
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

/** What a fresh ask starts from — shared, since a walk only ever derives a new context, never writes one. */
const EMPTY_CONTEXT: VisitorContext = Object.freeze({});

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
    for (let i = count; i < members.length; i++) {
      if (!Type.isOptional(members[i]!)) {
        return undefined;
      }
    }
    return members;
  }
  const element = row.kind === 'tuple' ? row.rest : row.element;
  if (element === undefined) {
    return undefined;
  }
  // Built as an interned tuple so a repeated arity binds the same array identity and the
  // plan memo behind Plan.from can hit.
  return Type.tuple(...members, ...Array.from({ length: count - members.length }, () => element)).members;
}
