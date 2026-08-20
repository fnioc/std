// Structural typings for the page-lifecycle slice of the DOM this package
// touches (document/window are typed via targeted globalThis lookups, not
// lib.dom). Extend the surface only when a call site actually needs more.
//
// `unload`/`beforeunload` are DELIBERATELY not in the event unions: registering
// either disqualifies the page from the back/forward cache, so this package
// must never be able to name them.

import type { Func } from '@rhombus-toolkit/func';

/** The `document.visibilityState` values. */
export type DocumentVisibilityState = 'visible' | 'hidden';

/** The page-lifecycle events dispatched on `document`. */
export type DocumentLifecycleEventType = 'visibilitychange' | 'freeze' | 'resume';

/** The page-lifecycle events dispatched on `window`. */
export type WindowLifecycleEventType = 'pagehide' | 'pageshow';

/**
 * Structural counterpart of the platform `PageTransitionEvent` —
 * `pagehide`/`pageshow`'s event object. `persisted` is the back/forward-cache
 * discriminator: a persisted pagehide means the page is being frozen into the
 * bfcache (and may come back), NOT terminated.
 */
export interface PageTransitionEventLike {
  readonly persisted: boolean;
}

/** The `document` surface this package touches. */
export interface DocumentLike {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: DocumentLifecycleEventType, listener: Func<[], void>): void;
  removeEventListener(type: DocumentLifecycleEventType, listener: Func<[], void>): void;
}

/** The `window` surface this package touches. */
export interface WindowLike {
  addEventListener(type: WindowLifecycleEventType, listener: Func<[PageTransitionEventLike], void>): void;
  removeEventListener(type: WindowLifecycleEventType, listener: Func<[PageTransitionEventLike], void>): void;
}

/** The document/window pair the lifetime and the lifecycle bridge attach to. */
export interface PageContext {
  readonly document: DocumentLike;
  readonly window: WindowLike;
}

/**
 * The platform page context, re-typed against the owned structural interfaces.
 * Resolved lazily so merely importing this package never touches the globals;
 * outside a browser, this throws here rather than as a property access on
 * `undefined` deeper inside a lifetime/bridge.
 */
export function defaultPageContext(): PageContext {
  const { document, window } = globalThis as unknown as { document: DocumentLike | undefined; window: WindowLike | undefined; };
  if (document === undefined || window === undefined) {
    throw new Error(
      '@rhombus-std/hosting.browser requires a browser page context (document/window); '
        + 'pass an explicit PageContext to run anywhere else.',
    );
  }
  return { document, window };
}
