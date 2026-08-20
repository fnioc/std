// Structural AbortSignal/AbortController typings, owned here so libraries can
// name these globals without pulling lib.dom / @types/node / bun-types into
// their published .d.ts. Typed for mutual assignability with both the lib.dom
// and @types/node variants: the members this repo calls are precise; the
// EventTarget plumbing it never touches (`onabort`, `dispatchEvent`) is left
// loose (`any`) so a signal crosses the boundary either way (e.g. passing one
// to `fetch(url, { signal })`). The value export below IS
// `globalThis.AbortController` — native in Node >=15 / bun / deno / browsers.

import type { Ctor } from '@rhombus-toolkit/func';

/** Structural counterpart of the platform `AbortSignal`. */
export interface AbortSignal {
  readonly aborted: boolean;
  readonly reason: any;
  onabort: any; // loose: plumbing we never touch
  throwIfAborted(): void;
  addEventListener(type: 'abort', listener: (this: AbortSignal, event: any) => void, options?: boolean | { once?: boolean; }): void;
  removeEventListener(type: 'abort', listener: (this: AbortSignal, event: any) => void): void;
  dispatchEvent(event: any): boolean;
}

/** Structural counterpart of the platform `AbortController`. */
export interface AbortController {
  readonly signal: AbortSignal;
  abort(reason?: any): void;
}

/**
 * Constructor shape for {@link AbortController}, matching the platform
 * global's static side.
 */
export type AbortControllerConstructor = Ctor<[], AbortController>;

/** The platform `AbortController` constructor, re-typed against the owned structural interface. */
export const AbortController: AbortControllerConstructor =
  // The bare-library `globalThis` type lacks these properties, so the cast goes through `unknown`.
  (globalThis as unknown as { AbortController: AbortControllerConstructor; }).AbortController;

/**
 * A singleton inert signal that never aborts. Pass it where an
 * {@link AbortSignal} is required but cancellation is genuinely not-applicable;
 * every member is a no-op.
 */
export const neverSignal: AbortSignal = { aborted: false, reason: undefined, onabort: null, throwIfAborted() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {
  return false;
} };
