// BrowserLifetime — the browser analog of hosting's ConsoleLifetime: instead
// of POSIX signals, the shutdown trigger is the Page Lifecycle API. The five
// lifecycle events (visibilitychange/freeze/resume on document,
// pagehide/pageshow on window) are attached in `waitForStart`, which then
// resolves immediately — browser applications, like console ones, start at
// once.
//
// NEVER `unload`/`beforeunload`: registering either disqualifies the page from
// the back/forward cache. `pagehide` is the only reliable end-of-page signal,
// and its `persisted` flag discriminates the two futures:
//
//   - persisted === false — the page is being DISCARDED. With
//     `stopOnPagehide` (the default) the lifetime calls
//     `IHostApplicationLifetime.stopApplication()`: its synchronous abort
//     dispatch runs every `applicationStopping` listener before the event
//     handler returns — the last-chance flush backstop (sendBeacon / keepalive
//     fetch live there). The built host is NOT resolvable from the container
//     (verified against host-composition's `resolveHost`, which constructs the
//     internal Host AFTER `build()` and never registers it), so the lifetime
//     cannot drive the async stop pipeline itself; wire that one line in
//     main.ts:
//
//       const host = BrowserHost.createApplicationBuilder({ ... }).build();
//       const lifetime = host.services.resolve<IHostApplicationLifetime>(
//         HOST_APPLICATION_LIFETIME_TOKEN,
//       );
//       lifetime.applicationStopping.addEventListener("abort", () => {
//         void host.stop();
//       }, { once: true });
//       await host.start();
//
//   - persisted === true — the page is being FROZEN into the bfcache and may
//     be restored. The host MUST NOT stop (it is non-restartable); the event
//     is bridged (logged, and surfaced via PageLifecycleEvents) and nothing
//     else happens.
//
// The RECURRING persistence point is visibilitychange -> hidden (surfaced as
// PageLifecycleEvents' flush signal), not this lifetime's stop — see
// PageLifecycleEvents.

import type { IHostApplicationLifetime, IHostLifetime } from '@rhombus-std/hosting.core';
import { type ILogger, type ILoggerFactory, logDebug, logInformation } from '@rhombus-std/logging.core';
import type { AbortSignal } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { BrowserLifetimeOptions } from './BrowserLifetimeOptions';
import { defaultPageContext, type PageContext, type PageTransitionEventLike } from './page-context';

/** The logging category the browser lifetime writes its lifecycle messages under. */
export const BROWSER_LIFETIME_CATEGORY = 'Rhombus.Hosting.Lifetime';

/**
 * An {@link IHostLifetime} driven by the Page Lifecycle API: a terminal
 * `pagehide` requests a graceful shutdown; a bfcache (`persisted`) pagehide
 * never does. See the module documentation for the main.ts stop wiring.
 */
export class BrowserLifetime implements IHostLifetime, Disposable {
  readonly #options: BrowserLifetimeOptions;
  readonly #applicationLifetime: IHostApplicationLifetime;
  readonly #logger: ILogger;
  readonly #context: PageContext;
  readonly #pageLifecycleEvents?: Disposable;

  #onVisibilityChange?: Func<[], void>;
  #onFreeze?: Func<[], void>;
  #onResume?: Func<[], void>;
  #onPageHide?: Func<[PageTransitionEventLike], void>;
  #onPageShow?: Func<[PageTransitionEventLike], void>;

  /**
   * @param pageLifecycleEvents The page-lifecycle bridge whose listeners share
   *   this lifetime's teardown: it attaches eagerly at composition (so no
   *   transition is missed before a subscriber arrives) but nothing in the
   *   container disposes an unowned value registration, so `stop`/dispose here
   *   is what detaches it — matching this lifetime's own detach-on-stop and
   *   preventing a leak across host cycles over a shared document.
   */
  public constructor(
    options: BrowserLifetimeOptions,
    applicationLifetime: IHostApplicationLifetime,
    loggerFactory: ILoggerFactory,
    context?: PageContext,
    pageLifecycleEvents?: Disposable,
  ) {
    this.#options = options;
    this.#applicationLifetime = applicationLifetime;
    this.#logger = loggerFactory.createLogger(BROWSER_LIFETIME_CATEGORY);
    this.#context = context ?? defaultPageContext();
    this.#pageLifecycleEvents = pageLifecycleEvents;
  }

  /** Attaches the five page-lifecycle listeners; browser applications start immediately. */
  public waitForStart(_abortSignal: AbortSignal): Promise<void> {
    const { document, window } = this.#context;

    this.#onVisibilityChange = () => {
      logDebug(this.#logger, `Page visibility changed: ${document.visibilityState}.`);
    };
    this.#onFreeze = () => {
      logDebug(this.#logger, 'Page frozen.');
    };
    this.#onResume = () => {
      logDebug(this.#logger, 'Page resumed.');
    };
    this.#onPageHide = (event) => {
      this.#handlePageHide(event);
    };
    this.#onPageShow = (event) => {
      if (event.persisted) {
        logInformation(this.#logger, 'Page restored from the back/forward cache; host continues.');
      }
    };

    document.addEventListener('visibilitychange', this.#onVisibilityChange);
    document.addEventListener('freeze', this.#onFreeze);
    document.addEventListener('resume', this.#onResume);
    window.addEventListener('pagehide', this.#onPageHide);
    window.addEventListener('pageshow', this.#onPageShow);

    // Browser applications start immediately.
    return Promise.resolve();
  }

  /** Detaches every page-lifecycle listener (this lifetime's and the bridge's); nothing else to do. */
  public stop(_abortSignal: AbortSignal): Promise<void> {
    this.#detach();
    return Promise.resolve();
  }

  /** Detaches every page-lifecycle listener (this lifetime's and the bridge's). */
  public [Symbol.dispose](): void {
    this.#detach();
  }

  #handlePageHide(event: PageTransitionEventLike): void {
    if (event.persisted) {
      // Entering the bfcache: the page may be restored, and the host is
      // non-restartable — bridge the event only, never stop.
      logInformation(this.#logger, 'Page entering the back/forward cache; host continues.');
      return;
    }
    if (!this.#options.stopOnPagehide) {
      return;
    }
    logInformation(this.#logger, 'Page terminating; application is shutting down...');
    // The synchronous abort dispatch inside stopApplication runs every
    // applicationStopping listener before this handler returns — the flush
    // backstop. Driving the async stop pipeline is main.ts's one-line wiring
    // (see the module documentation).
    this.#applicationLifetime.stopApplication();
  }

  #detach(): void {
    const { document, window } = this.#context;
    if (this.#onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.#onVisibilityChange);
      this.#onVisibilityChange = undefined;
    }
    if (this.#onFreeze) {
      document.removeEventListener('freeze', this.#onFreeze);
      this.#onFreeze = undefined;
    }
    if (this.#onResume) {
      document.removeEventListener('resume', this.#onResume);
      this.#onResume = undefined;
    }
    if (this.#onPageHide) {
      window.removeEventListener('pagehide', this.#onPageHide);
      this.#onPageHide = undefined;
    }
    if (this.#onPageShow) {
      window.removeEventListener('pageshow', this.#onPageShow);
      this.#onPageShow = undefined;
    }
    // The bridge attaches eagerly and is registered as an unowned value the
    // container never disposes — its teardown rides this lifetime's.
    this.#pageLifecycleEvents?.[Symbol.dispose]();
  }
}
