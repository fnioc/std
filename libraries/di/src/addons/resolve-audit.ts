import { type AddonInstallation, type AfterConstructMiddleware, type BeforeConstructMiddleware, type BeginResolveMiddleware, type CanonicalizeMiddleware, type ChainAddon, type LifetimeArgument,
  Registration, type ResolveAudit, type Starfish } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

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

/** The context shape this addon threads: its own compartment paired with whatever context sits beneath it. */
type AuditContext = readonly [compartment: AuditCompartment, inner: unknown];

/** Every context this addon has minted, so a re-entering resolution's injected context is recognizable as its own. */
const packs = new WeakSet<AuditContext>();

function pack(compartment: AuditCompartment, inner: unknown): AuditContext {
  const context: AuditContext = [compartment, inner];
  packs.add(context);
  return context;
}

function unpack(context: unknown): AuditContext {
  return context as AuditContext;
}

/** Whether `context` is a pack this addon minted itself, rather than something injected by whoever resolved under it. */
function isOwnPack(context: unknown): context is AuditContext {
  return Array.isArray(context) && packs.has(context as unknown as AuditContext);
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

/**
 * Opens each resolution with a fresh compartment, its frame chain empty until a construction
 * pushes onto it. A re-entering resolution injects a context this addon already packed, and only
 * the context beneath the compartment belongs to everyone else.
 */
const beginResolve: BeginResolveMiddleware<unknown> = (request, injected, next) => pack({ request, frame: undefined }, next(request, isOwnPack(injected) ? injected[1] : injected));

/**
 * Answers `ResolveAudit` for whoever names it, pushing the enclosing construction's address onto
 * the compartment for everything beneath it.
 */
const beforeConstruct: BeforeConstructMiddleware<unknown, unknown> = (construction, next) => {
  const [compartment, inner] = unpack(construction.context);
  if (construction.populatedAddress === typefor<ResolveAudit>()) {
    return { instance: new AuditView(compartment) };
  }
  const answer = next({ ...construction, context: inner });
  if ('instance' in answer) {
    return answer;
  }
  const frame: AuditFrame = { address: construction.populatedAddress, parent: compartment.frame };
  return { within: pack({ request: compartment.request, frame }, answer.within) };
};

/** Hands canonicalize the context beneath this addon's compartment, since it runs on the same construction {@link beforeConstruct} received rather than what it answered. */
const canonicalize: CanonicalizeMiddleware<unknown, unknown> = (construction, instance, next) => {
  const [, inner] = unpack(construction.context);
  return next({ ...construction, context: inner }, instance);
};

/** Hands afterConstruct the context beneath this addon's compartment, since it runs on the same construction {@link beforeConstruct} received rather than what it answered. */
const afterConstruct: AfterConstructMiddleware<unknown, unknown> = (construction, instance, next) => {
  const [, inner] = unpack(construction.context);
  next({ ...construction, context: inner }, instance);
};

/**
 * Answers `ResolveAudit` for whoever names it: what the resolve was asked for, the address of the
 * construction holding the audit, and the addresses enclosing that one.
 *
 * @param lifetime - what the registration it files carries; the lifetime model's transient, or
 * nothing at all where the vocabulary admits omission.
 */
export function resolveAudit<Lifetime>(...lifetime: LifetimeArgument<Lifetime>): ChainAddon<Lifetime>;
export function resolveAudit(lifetime?: any): ChainAddon<any> {
  return {
    install(): AddonInstallation<any> {
      const address = typefor<ResolveAudit>();
      return {
        registrations: [
          Registration.factory(
            address,
            () => {
              throw new Error('the resolve-audit addon answers this at construction; install it through withAddon so its hooks stand behind the registration');
            },
            Type.func(address, [[]]),
            lifetime,
          ),
        ],
        wrapResolve: next => {
          const door = next(typefor<Starfish>()) as Starfish;
          door.onBeginResolve(beginResolve);
          door.onBeforeConstruct(beforeConstruct);
          door.onCanonicalize(canonicalize);
          door.onAfterConstruct(afterConstruct);
          return next;
        },
      };
    },
  };
}
