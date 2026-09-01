import { type Addon, type AddonInstallation, type Audit, type Behavior, Control, type IEngineHooks, type LifetimeArgument, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { iterable } from '@rhombus-toolkit/obj';
import { isDefined } from '@rhombus-toolkit/type-guards';
import { askForControl } from '../internal/control-recognition.js';

/** One construction enclosing the reading, linked to the construction that reached it. */
interface AuditFrame {
  readonly address: Type;
  readonly parent: AuditFrame | undefined;
}

/** What this addon threads through a resolution: the request that opened it, and the constructions reaching the current position. */
interface AuditCompartment {
  readonly request: Type;
  readonly frame: AuditFrame | undefined;
}

/** Reads a compartment's frame chain on demand, so a reading that never asks gathers nothing. */
class AuditView implements Audit {
  readonly #compartment: AuditCompartment;

  constructor(compartment: AuditCompartment) {
    this.#compartment = compartment;
  }

  get request(): Type {
    return this.#compartment.request;
  }

  get address(): Type | undefined {
    return this.#enclosing().find(isDefined);
  }

  get ancestry(): Iterable<Type> {
    return iterable(() => this.#enclosing().drop(1));
  }

  /** The address of each construction enclosing the reading, innermost first. */
  #enclosing(): IteratorObject<Type, undefined> {
    function* frames(from: AuditFrame | undefined): Generator<AuditFrame> {
      for (let frame = from; frame; frame = frame.parent) {
        yield frame;
      }
    }
    return Iterator.from(frames(this.#compartment.frame)).map(frame => frame.address);
  }
}

/** The hooks this addon plants — contextual typing carries each slot's handler-or-middleware shape. */
const hooks: Behavior<AuditCompartment> = {
  /** Opens each resolution with a fresh compartment, its frame chain empty until a construction pushes onto it. */
  beginResolve(request: Type): AuditCompartment {
    return { request, frame: undefined };
  },

  /**
   * Answers `Audit` for whoever names it — nothing beneath ever sees that construction —
   * and otherwise pushes the enclosing construction's address onto the compartment everything
   * beneath it reads.
   */
  beforeConstruct(construction, next) {
    if (construction.populatedAddress === typefor<Audit>()) {
      return { result: new AuditView(construction.state) };
    }
    const answer = next(construction);
    if ('result' in answer) {
      return answer;
    }
    const frame: AuditFrame = { address: construction.populatedAddress, parent: construction.state.frame };
    return { state: { request: construction.state.request, frame } };
  },
};

/**
 * Answers `Audit` for whoever names it: what the resolve was asked for, the address of the
 * construction holding the audit, and the addresses enclosing that one.
 *
 * @param lifetime - what the registration it files carries; the lifetime model's transient, or
 * nothing at all where the vocabulary admits omission.
 */
export function auditAddon<Lifetime>(...lifetime: LifetimeArgument<Lifetime>): Addon;
export function auditAddon(lifetime?: any): Addon {
  return {
    create(): AddonInstallation {
      return {
        registrations: [
          Registration.factory(
            typefor<Audit>(),
            () => {
              throw new Error(
                `${
                  Type.stringify(typefor<Audit>())
                } is answered by the audit addon's own hooks, and this container never installed them — resolve it from a container built with useAddon(auditAddon())`,
              );
            },
            Type.func(typefor<Audit>(), [[]]),
            lifetime,
          ),
        ],
        // Plants the four hooks permanently, at build, and steps aside: everything downstream of
        // here runs exactly as it would have without this middleware in the chain.
        middleware: next => {
          askForControl<IEngineHooks>({ getService: next }, typefor<Control<IEngineHooks>>()).useHooks(hooks);
          return next;
        },
      };
    },
  };
}
