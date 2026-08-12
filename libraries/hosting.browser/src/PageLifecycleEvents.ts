import type { Func } from '@rhombus-toolkit/func';
import { defaultPageContext, type PageContext, type PageTransitionEventLike } from './page-context';

// Structural globalThis lookup for the one console method #notify needs (this
// program carries no lib.dom); every host environment supplies it.
const { console } = globalThis as unknown as { console: { error(...args: unknown[]): void; }; };

/**
 * The bridge's phase snapshot values. `visible`/`hidden` mirror
 * `document.visibilityState`; `frozen` covers both an explicit `freeze` and a
 * persisted `pagehide` (the page is entering the bfcache); `terminated` is a
 * non-persisted `pagehide` (the page is being discarded).
 */
export type PageLifecyclePhase = 'visible' | 'hidden' | 'frozen' | 'terminated';

/**
 * The injectable page-lifecycle bridge, registered under
 * {@link import("./types").PAGE_LIFECYCLE_EVENTS_TYPE}. Its listeners attach
 * eagerly at construction, so no transition is missed before a subscriber
 * arrives. Registered as an unowned value — the container never disposes it,
 * so the {@link BrowserLifetime} it is handed to detaches it on `stop`/dispose.
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
   * RELIABLE persistence point. Subscribes to the RECURRING flush signal (every
   * visibility transition to hidden — the documented place to persist state)
   * and returns the unsubscriber.
   *
   * The listener MUST be synchronous — an async listener type-checks
   * (void-return bivariance) but only its code before the first `await` runs
   * before the page can be discarded. Do synchronous work (e.g. `localStorage`)
   * or fire `navigator.sendBeacon` here; never `await`.
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
    // Isolate each listener: one throwing subscriber must not starve the rest
    // — for the flush signal in particular, it would cost another subscriber
    // its last chance to persist.
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        console.error(error);
      }
    }
  }
}
