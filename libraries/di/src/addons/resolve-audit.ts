import { type Addon, type AddonInstallation, type Behavior, Control, type IEngineHooks, type LifetimeArgument, Registration, type ResolveAudit } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { askForControl } from '../internal/control-recognition.js';

/** One construction enclosing the reading, linked to the construction that reached it. */
interface AuditFrame {
  readonly address: Type;
  readonly parent: AuditFrame | undefined;
}

/** What this addon carries through a resolution: the request that opened it, and the constructions reaching the current position. */
interface AuditCompartment {
  readonly request: Type;
  readonly frame: AuditFrame | undefined;
}

/** The state shape this addon threads: its own compartment paired with whatever state sits beneath it. */
type AuditState = readonly [compartment: AuditCompartment, inner: unknown];

/** Every state this addon has minted, so a re-entering resolution's injected state is recognizable as its own. */
const packs = new WeakSet<AuditState>();

function pack(compartment: AuditCompartment, inner: unknown): AuditState {
  const state: AuditState = [compartment, inner];
  packs.add(state);
  return state;
}

/** Whether `state` is a pack this addon minted itself, rather than something injected by whoever resolved under it. */
function isOwnPack(state: unknown): state is AuditState {
  return Array.isArray(state) && packs.has(state as unknown as AuditState);
}

/** Reads a compartment's frame chain on demand, so a reading that never asks gathers nothing. */
class AuditView implements ResolveAudit {
  readonly #compartment: AuditCompartment;

  constructor(compartment: AuditCompartment) {
    this.#compartment = compartment;
  }

  get request(): Type {
    return this.#compartment.request;
  }

  get address(): Type | undefined {
    return this.#enclosing().next().value;
  }

  get ancestry(): Iterable<Type> {
    return { [Symbol.iterator]: () => this.#enclosing().drop(1) };
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

/** The four hooks this addon plants, together — contextual typing carries each slot's handler-or-middleware shape. */
const hooks: Behavior<unknown> = {
  /**
   * Opens each resolution with a fresh compartment, its frame chain empty until a construction
   * pushes onto it. A re-entering resolution injects a state this addon already packed, and only
   * the state beneath the compartment belongs to everyone else.
   */
  beginResolve(request, injected, next) {
    return pack({ request, frame: undefined }, next(request, isOwnPack(injected) ? injected[1] : injected));
  },

  /**
   * Answers `ResolveAudit` for whoever names it, pushing the enclosing construction's address onto
   * the compartment for everything beneath it. A construction whose state isn't this addon's own
   * pack passes through unchanged — nothing here to contribute, and nothing safe to unwrap.
   */
  beforeConstruct(construction, next) {
    if (!isOwnPack(construction.state)) {
      return next(construction);
    }
    const [compartment, inner] = construction.state;
    if (construction.populatedAddress === typefor<ResolveAudit>()) {
      return { result: new AuditView(compartment) };
    }
    const answer = next({ ...construction, state: inner });
    if ('result' in answer) {
      return answer;
    }
    const frame: AuditFrame = { address: construction.populatedAddress, parent: compartment.frame };
    return { state: pack({ request: compartment.request, frame }, answer.state) };
  },

  /** Hands canonicalize the state beneath this addon's compartment, since it runs on the same construction {@link beforeConstruct} received rather than what it answered. */
  canonicalize(construction, instance, next) {
    if (!isOwnPack(construction.state)) {
      return next(construction, instance);
    }
    const [, inner] = construction.state;
    return next({ ...construction, state: inner }, instance);
  },

  /** Hands afterConstruct the state beneath this addon's compartment, since it runs on the same construction {@link beforeConstruct} received rather than what it answered. */
  afterConstruct(construction, instance, next) {
    if (!isOwnPack(construction.state)) {
      next(construction, instance);
      return;
    }
    const [, inner] = construction.state;
    next({ ...construction, state: inner }, instance);
  },
};

/**
 * Answers `ResolveAudit` for whoever names it: what the resolve was asked for, the address of the
 * construction holding the audit, and the addresses enclosing that one.
 *
 * @param lifetime - what the registration it files carries; the lifetime model's transient, or
 * nothing at all where the vocabulary admits omission.
 */
export function resolveAudit<Lifetime>(...lifetime: LifetimeArgument<Lifetime>): Addon;
export function resolveAudit(lifetime?: any): Addon {
  return {
    create(): AddonInstallation {
      const address = typefor<ResolveAudit>();
      return {
        registrations: [
          Registration.factory(
            address,
            () => {
              throw new Error('the resolve-audit addon answers this at construction; install it through useAddon so its middleware stands behind the registration');
            },
            Type.func(address, [[]]),
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
