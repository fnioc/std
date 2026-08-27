import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import type { IServiceProvider } from './IServiceProvider.js';
import type { AfterConstructHandler, AfterConstructMiddleware, BeforeConstructHandler, BeforeConstructMiddleware, BeginResolveHandler, BeginResolveMiddleware, CanonicalizeHandler,
  CanonicalizeMiddleware, HookOptions } from './LifetimeModel/index.js';

/** What a provider registers as it is minted: the context its resolutions run under, and who answers them. */
export interface Binding {
  /** The context every resolution through this binding starts from, absent to start it under none. */
  readonly context?: object;
  /** The provider a service resolving under {@link context} receives where it names `IServiceProvider`. */
  readonly provider?: IServiceProvider;
}

/**
 * The hookable door: a provider binds itself through it as it is minted, and a model or an addon
 * files its handlers through it as the container is built.
 *
 * @remarks
 * Synthesized by the engine, not registered — reached by resolving `typefor<Starfish>()` through a
 * provider's `getService`, and nowhere else.
 *
 * Every `on*` member takes either a plain handler or middleware for that hook — the same signature
 * with a trailing `next`, the composed handler downstream of it. The two are told apart by how many
 * parameters the function declares, so middleware has to declare all of them, `next` included.
 * Handlers file in call order and the last one filed sits innermost.
 */
export interface Starfish {
  /** The function a provider bound to `binding` diverts its resolutions through. */
  bind(binding: Binding): Func<[Type], unknown>;

  /**
   * Files what opens each resolution: the handler is handed the context injected by the provider
   * being asked and answers the context the resolution runs under.
   *
   * @remarks
   * A resolution stands behind no registration, so there is no `interested` predicate to gate
   * on — this hook takes no options at all.
   */
  onBeginResolve<Context = unknown>(handler: BeginResolveHandler<Context>): void;
  onBeginResolve<Context = unknown>(middleware: BeginResolveMiddleware<Context>): void;

  /** Files what runs before each construction: an instance in place of constructing, or the context the dependencies resolve under. */
  onBeforeConstruct<Lifetime = unknown, Context = unknown>(handler: BeforeConstructHandler<Lifetime, Context>, options?: HookOptions<Lifetime>): void;
  onBeforeConstruct<Lifetime = unknown, Context = unknown>(middleware: BeforeConstructMiddleware<Lifetime, Context>, options?: HookOptions<Lifetime>): void;

  /** Files what the constructed instance passes through before anything downstream reads it. */
  onCanonicalize<Lifetime = unknown, Context = unknown>(handler: CanonicalizeHandler<Lifetime, Context>, options?: HookOptions<Lifetime>): void;
  onCanonicalize<Lifetime = unknown, Context = unknown>(middleware: CanonicalizeMiddleware<Lifetime, Context>, options?: HookOptions<Lifetime>): void;

  /** Files what runs once each construction has settled on its instance. */
  onAfterConstruct<Lifetime = unknown, Context = unknown>(handler: AfterConstructHandler<Lifetime, Context>, options?: HookOptions<Lifetime>): void;
  onAfterConstruct<Lifetime = unknown, Context = unknown>(middleware: AfterConstructMiddleware<Lifetime, Context>, options?: HookOptions<Lifetime>): void;
}

export namespace Starfish {
  /** The function a provider bound to `binding` resolves through, taken from the door `resolve` reaches. */
  export function bind(resolve: Func<[Type], unknown>, binding: Binding): Func<[Type], unknown> {
    // A resolve function answers `unknown` for every address it is handed; the one address whose
    // answer the types cannot state is this one, so the assertion lives here and nowhere else.
    const door = resolve(typefor<Starfish>()) as Starfish;
    return door.bind(binding);
  }
}
