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
  public constructor(options: BrowserLifetimeOptions, applicationLifetime: IHostApplicationLifetime,
    loggerFactory: ILoggerFactory, pageLifecycleEvents: PageLifecycleEvents)
  {
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
        // The page may be restored from the bfcache — never stops the host.
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
