import type { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { IServiceProvider } from './IServiceProvider.js';
import type { Registration } from './Registration/index.js';

/**
 * What one addon contributes to the container being built.
 *
 * @typeParam Lifetime - the vocabulary of lifetime data the container's registrations carry.
 */
export interface AddonInstallation<Lifetime = unknown> {
  /** Registrations filed beneath the user's own, above the lifetime model's floor. */
  readonly registrations?: Iterable<Registration<Lifetime>>;

  /**
   * Wraps the container's resolve function once, at build; addons wrap outside the lifetime model.
   *
   * @remarks
   * This is also where an addon files its handlers through the door: resolve the given function
   * with `typefor<Starfish>()` to reach it, since the container passed alongside cannot yet answer.
   */
  readonly wrapResolve?: Func<[Func<[Type], unknown>, IServiceProvider], Func<[Type], unknown>>;

  /** Runs once every installation's registrations are in place, handed the provider the build resolves through; a throw aborts the build. */
  readonly atBuild?: Func<[IServiceProvider], void>;
}

/**
 * An addon a container builder installs beside the lifetime model.
 *
 * @typeParam Lifetime - the vocabulary of lifetime data the container's registrations carry.
 */
export interface ChainAddon<Lifetime = unknown> {
  /** Mints this addon's contribution to one container; called once per build. */
  install(): AddonInstallation<Lifetime>;
}
