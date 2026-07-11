// PageLifecycleEvents — the injectable page-lifecycle bridge a hosted service
// (or UI code) consumes instead of touching document/window itself. Listeners
// attach EAGERLY at construction, so no transition is missed between host
// build and a subscriber's arrival; the current state replays to late
// subscribers (see `subscribe`).
//
// Three surfaces:
//
//   - `phase` + `subscribe` — a snapshot/subscribe pair shaped for React's
//     `useSyncExternalStore(subscribe, () => bridge.phase)`: `phase` is a
//     stable primitive string (identical value until an actual transition),
//     `subscribe` returns its unsubscriber and replays the current state by
//     invoking the listener once immediately (harmless under
//     useSyncExternalStore — it just re-reads an unchanged snapshot).
//   - `onFlush` — the RECURRING, NON-TERMINAL persistence point: fired every
//     time visibility changes to hidden (this — not the lifetime's stop — is
//     where state should be persisted: a hidden page may be frozen, discarded,
//     or never come back, and pagehide is not guaranteed on all discard
//     paths).
//   - `onRestore` — the bfcache-restore signal (`pageshow` with
//     persisted === true), exposed as an EVENT, never a boolean flag: "was
//     restored" is a moment, not a state, and a flag would go stale the
//     moment the page froze again.
//
// NEVER `unload`/`beforeunload` (bfcache disqualifiers) — the page-context
// typings cannot even name them.

import type { Func } from '@rhombus-toolkit/func';
import { defaultPageContext, type PageContext, type PageTransitionEventLike } from './page-context';

/**
 * The bridge's phase snapshot values. `visible`/`hidden` mirror
 * `document.visibilityState`; `frozen` covers both an explicit `freeze` and a
 * persisted `pagehide` (the page is entering the bfcache); `terminated` is a
 * non-persisted `pagehide` (the page is being discarded).
 */
export type PageLifecyclePhase = 'visible' | 'hidden' | 'frozen' | 'terminated';

/**
 * The injectable page-lifecycle bridge. Constructed (and its listeners
 * attached) eagerly by `registerBrowserLifetime` — the seam both the facade and
 * the classic `useBrowserLifetime` path share — and registered under
 * {@link import("./tokens").PAGE_LIFECYCLE_EVENTS_TOKEN}. Because a value
 * registration is unowned, the container never disposes it; the BrowserLifetime
 * it is handed to detaches it on `stop`/dispose.
 */
export class PageLifecycleEvents implements Disposable {
  readonly #context: PageContext;
  readonly #phaseListeners = new Set<Func<[], void>>();
  readonly #flushListeners = new Set<Func<[], void>>();
  readonly #restoreListeners = new Set<Func<[], void>>();

  readonly #onVisibilityChange: Func<[], void>;
  readonly #onFreeze: Func<[], void>;
  readonly #onResume: Func<[], void>;
  readonly #onPageHide: Func<[PageTransitionEventLike], void>;
  readonly #onPageShow: Func<[PageTransitionEventLike], void>;

  #phase: PageLifecyclePhase;

  public constructor(context?: PageContext) {
    this.#context = context ?? defaultPageContext();
    const { document, window } = this.#context;
    this.#phase = document.visibilityState;

    this.#onVisibilityChange = () => {
      this.#setPhase(document.visibilityState);
      if (document.visibilityState === 'hidden') {
        // The recurring persistence point — every transition to hidden, not
        // just the first.
        this.#notify(this.#flushListeners);
      }
    };
    this.#onFreeze = () => {
      this.#setPhase('frozen');
    };
    this.#onResume = () => {
      this.#setPhase(document.visibilityState);
    };
    this.#onPageHide = (event) => {
      this.#setPhase(event.persisted ? 'frozen' : 'terminated');
    };
    this.#onPageShow = (event) => {
      if (event.persisted) {
        this.#setPhase(document.visibilityState);
        this.#notify(this.#restoreListeners);
      }
    };

    document.addEventListener('visibilitychange', this.#onVisibilityChange);
    document.addEventListener('freeze', this.#onFreeze);
    document.addEventListener('resume', this.#onResume);
    window.addEventListener('pagehide', this.#onPageHide);
    window.addEventListener('pageshow', this.#onPageShow);
  }

  /** The current phase — a stable primitive snapshot (useSyncExternalStore's getSnapshot). */
  public get phase(): PageLifecyclePhase {
    return this.#phase;
  }

  /**
   * Subscribes to phase changes and returns the unsubscriber
   * (useSyncExternalStore's subscribe). The listener is invoked once
   * immediately — the current-state replay for late subscribers.
   */
  public subscribe(listener: Func<[], void>): Func<[], void> {
    this.#phaseListeners.add(listener);
    listener();
    return () => {
      this.#phaseListeners.delete(listener);
    };
  }

  /**
   * Subscribes to the RECURRING flush signal (every visibility transition to
   * hidden — the documented persistence point) and returns the unsubscriber.
   */
  public onFlush(listener: Func<[], void>): Func<[], void> {
    this.#flushListeners.add(listener);
    return () => {
      this.#flushListeners.delete(listener);
    };
  }

  /**
   * Subscribes to the bfcache-restore event (`pageshow` with
   * persisted === true) and returns the unsubscriber.
   */
  public onRestore(listener: Func<[], void>): Func<[], void> {
    this.#restoreListeners.add(listener);
    return () => {
      this.#restoreListeners.delete(listener);
    };
  }

  /** Detaches every page listener and drops every subscriber. */
  public [Symbol.dispose](): void {
    const { document, window } = this.#context;
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
    document.removeEventListener('freeze', this.#onFreeze);
    document.removeEventListener('resume', this.#onResume);
    window.removeEventListener('pagehide', this.#onPageHide);
    window.removeEventListener('pageshow', this.#onPageShow);
    this.#phaseListeners.clear();
    this.#flushListeners.clear();
    this.#restoreListeners.clear();
  }

  #setPhase(next: PageLifecyclePhase): void {
    if (next === this.#phase) {
      return;
    }
    this.#phase = next;
    this.#notify(this.#phaseListeners);
  }

  #notify(listeners: ReadonlySet<Func<[], void>>): void {
    for (const listener of listeners) {
      listener();
    }
  }
}
