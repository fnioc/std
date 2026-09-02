import type { Behavior } from './Behavior.js';
import type { Handle } from './hooks.js';
import type { Registration } from './Registration/index.js';

/**
 * The engine's own control surface, reached through the door like any service: a middleware asks
 * for it at fold time with `next(new ControlRequest(typefor<ControlService>()))`.
 */
export interface ControlService {
  /**
   * The registrations the engine resolves against, newest first.
   *
   * @remarks
   * The engine's own two rows — `IServiceProvider` and this control — carry a `null` lifetime.
   */
  readonly registry: Iterable<Registration<unknown>>;

  /**
   * Installs `hooks` gated: they run only for an ask that activated the answered handle —
   * a layer writes `next(request.activate(handle))`. Disposing the handle uninstalls them.
   */
  stageHooks(hooks: Partial<Behavior>): Handle;

  /**
   * Installs `hooks` always active: they run for every ask, outermost, ahead of every staged
   * behavior. Disposing the handle uninstalls them.
   */
  installHooks(hooks: Partial<Behavior>): Handle;
}
