// Owned structural typings for the page-lifecycle slice of the DOM — the
// §39/§44 recipe (see @rhombus-std/primitives' abort.ts/process.ts): library
// programs carry ZERO ambient platform types (`types: []`), so naming
// `document`/`window` requires owned structural interfaces plus typed
// `globalThis` lookups — never lib.dom. (A `declare module` d.ts can't cover
// bare globals, and `declare global` would collide with lib.dom the moment a
// consumer program pulls it in — the same reason primitives' abort.ts avoids
// it.)
//
// The surface is EXACTLY what this package touches: event registration for the
// five page-lifecycle events (visibilitychange/freeze/resume on `document`,
// pagehide/pageshow on `window`), `document.visibilityState`, and
// `PageTransitionEvent.persisted`. Extend it only when a call site actually
// needs more. One-way assignability is all that is required (platform
// document/window -> the *Like interfaces; we never hand ours back to a
// platform API).
//
// `unload`/`beforeunload` are DELIBERATELY not in the event unions: registering
// either disqualifies the page from the back/forward cache, so this package
// must never be able to name them.

import type { Func } from "@rhombus-toolkit/func";

/** The `document.visibilityState` values. */
export type DocumentVisibilityState = "visible" | "hidden";

/** The page-lifecycle events dispatched on `document`. */
export type DocumentLifecycleEventType = "visibilitychange" | "freeze" | "resume";

/** The page-lifecycle events dispatched on `window`. */
export type WindowLifecycleEventType = "pagehide" | "pageshow";

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
 * Resolved LAZILY (a function, unlike primitives' eager `process` const) so
 * that merely importing this package never touches the globals — only actually
 * constructing a lifetime/bridge without an injected context does, and outside
 * a browser that fails loud here instead of as a property access on
 * `undefined`.
 */
export function defaultPageContext(): PageContext {
  const { document, window } = globalThis as unknown as {
    document: DocumentLike | undefined;
    window: WindowLike | undefined;
  };
  if (document === undefined || window === undefined) {
    throw new Error(
      "@rhombus-std/hosting.browser requires a browser page context (document/window); "
        + "pass an explicit PageContext to run anywhere else.",
    );
  }
  return { document, window };
}
