// BrowserLifetime — the browser analog of hosting's ConsoleLifetime: instead
// of POSIX signals, the shutdown trigger is the Page Lifecycle API. The
// lifetime does NOT touch document/window itself; the single DOM-listening
// component is PageLifecycleEvents, and this lifetime consumes it as its event
// SOURCE — subscribing to its phase snapshot in `waitForStart`, which then
// resolves immediately (browser applications, like console ones, start at once).
//
// The `terminated` phase (a non-persisted `pagehide` — the page is being
// DISCARDED) is the shutdown trigger: with `stopOnPagehide` (the default) the
// lifetime calls `IHostApplicationLifetime.stopApplication()`, whose synchronous
// abort dispatch runs every `applicationStopping` listener before the event
// handler returns (the last-chance flush backstop — sendBeacon / keepalive
// fetch live there). The async stop pipeline that runs hosted services' `stop`
// is driven by `runAsync` (see `BrowserHost.run()`), not this lifetime.
//
// A `frozen` phase (an explicit `freeze`, or a persisted `pagehide` entering the
// back/forward cache) NEVER stops: the page may be restored and the host is
// non-restartable. suspend ≠ stop.
//
// The RECURRING persistence point is visibilitychange -> hidden (surfaced as
// PageLifecycleEvents' `onFlush` signal), not this lifetime's stop — see
// PageLifecycleEvents.

import type { IHostApplicationLifetime, IHostLifetime } from '@rhombus-std/hosting.core';
import { type ILogger, type ILoggerFactory, logDebug, logInformation } from '@rhombus-std/logging.core';
import type { AbortSignal } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { BrowserLifetimeOptions } from './BrowserLifetimeOptions';
import type { PageLifecycleEvents } from './PageLifecycleEvents';

/** The logging category the browser lifetime writes its lifecycle messages under. */
export const BROWSER_LIFETIME_CATEGORY = 'Rhombus.Hosting.Lifetime';

/**
 * An {@link IHostLifetime} driven by the Page Lifecycle API via
 * {@link PageLifecycleEvents}: a terminal (`terminated`) phase requests a
 * graceful shutdown; a `frozen` (bfcache/freeze) phase never does. The async
 * stop pipeline is driven by `runAsync` (see `BrowserHost.run()`).
 */
export class BrowserLifetime implements IHostLifetime, Disposable {
  readonly #options: BrowserLifetimeOptions;
  readonly #applicationLifetime: IHostApplicationLifetime;
  readonly #logger: ILogger;
  readonly #pageLifecycleEvents: PageLifecycleEvents;

  #unsubscribePhase?: Func<[], void>;
  #unsubscribeRestore?: Func<[], void>;

  /**
   * @param pageLifecycleEvents The single DOM-listening component; this lifetime
   *   consumes it as its event source. It is registered as an unowned value the
   *   container never disposes, so this lifetime — its host-scoped consumer —
   *   disposes it on `stop`/dispose, preventing a listener leak across host
   *   cycles over a shared document.
   */
  public constructor(
    options: BrowserLifetimeOptions,
    applicationLifetime: IHostApplicationLifetime,
    loggerFactory: ILoggerFactory,
    pageLifecycleEvents: PageLifecycleEvents,
  ) {
    this.#options = options;
    this.#applicationLifetime = applicationLifetime;
    this.#logger = loggerFactory.createLogger(BROWSER_LIFETIME_CATEGORY);
    this.#pageLifecycleEvents = pageLifecycleEvents;
  }

  /** Subscribes to the page-lifecycle bridge; browser applications start immediately. */
  public waitForStart(_abortSignal: AbortSignal): Promise<void> {
    this.#unsubscribePhase = this.#pageLifecycleEvents.subscribe(() => {
      this.#onPhase();
    });
    this.#unsubscribeRestore = this.#pageLifecycleEvents.onRestore(() => {
      logInformation(this.#logger, 'Page restored from the back/forward cache; host continues.');
    });

    // Browser applications start immediately.
    return Promise.resolve();
  }

  /** Unsubscribes from the bridge and disposes it (its listeners and this lifetime's). */
  public stop(_abortSignal: AbortSignal): Promise<void> {
    this.#detach();
    return Promise.resolve();
  }

  /** Unsubscribes from the bridge and disposes it (its listeners and this lifetime's). */
  public [Symbol.dispose](): void {
    this.#detach();
  }

  #onPhase(): void {
    switch (this.#pageLifecycleEvents.phase) {
      case 'visible':
      case 'hidden': {
        logDebug(this.#logger, `Page phase: ${this.#pageLifecycleEvents.phase}.`);
        break;
      }
      case 'frozen': {
        // Entering the bfcache (or an explicit freeze): the page may be
        // restored, and the host is non-restartable — bridge only, never stop.
        logInformation(this.#logger, 'Page entering the back/forward cache; host continues.');
        break;
      }
      case 'terminated': {
        this.#requestStop();
        break;
      }
    }
  }

  #requestStop(): void {
    if (!this.#options.stopOnPagehide) {
      return;
    }
    logInformation(this.#logger, 'Page terminating; application is shutting down...');
    // The synchronous abort dispatch inside stopApplication runs every
    // applicationStopping listener before this handler returns — the flush
    // backstop. Driving the async stop pipeline is runAsync's job (see
    // BrowserHost.run()).
    this.#applicationLifetime.stopApplication();
  }

  #detach(): void {
    this.#unsubscribePhase?.();
    this.#unsubscribePhase = undefined;
    this.#unsubscribeRestore?.();
    this.#unsubscribeRestore = undefined;
    // The bridge is the single DOM-listening component, registered as an unowned
    // value the container never disposes — its teardown rides this lifetime's.
    this.#pageLifecycleEvents[Symbol.dispose]();
  }
}
