// Owned AbortSignal/AbortController typings -- NOT a port of an ME type
// (the reference has no analog; cancellation there comes from the base
// class library, and TS has no equivalent base to lean on). See
// docs/decisions.md for the full rationale.
//
// Library code names these globals, but a library tsconfig has no `types`
// array -- today they resolve only because @types/node happens to be
// pulled in transitively. That leaks a consumer-side requirement (lib.dom,
// @types/node, or bun-types) into the published rolled .d.ts just to name
// AbortSignal. Owning structural interfaces here -- the zero-dep leaf --
// removes that leak.
//
// Deliberately NOT `declare global`: augmenting the global AbortSignal/
// AbortController would collide with @types/node's own declarations the
// moment both are in scope.
//
// Keystone: these are typed for MUTUAL assignability with both the
// lib.dom and @types/node variants. Members this repo actually calls
// (`aborted`, `reason`, `throwIfAborted`, the "abort" add/removeEventListener
// pair with `{ once }`, `abort(reason?)`, `signal`) are typed precisely;
// the EventTarget plumbing we never touch (`onabort`, `dispatchEvent`) is
// present-but-loose (`any`) so our signals stay assignable TO platform APIs
// (e.g. passing `applicationLifetime.applicationStopping` to
// `fetch(url, { signal })`) while platform signals stay assignable to our
// params.
//
// No runtime fallback: the value export below IS `globalThis.AbortController`
// -- native since Node 15, and native in bun/deno/browsers. Shipping a
// polyfill would be pure YAGNI.

import type { Ctor } from '@rhombus-toolkit/func';

/**
 * Structural counterpart of the platform `AbortSignal` -- see the module
 * doc comment above for the mutual-assignability design.
 */
export interface AbortSignal {
  readonly aborted: boolean;
  readonly reason: any;
  onabort: any; // loose: plumbing we never touch
  throwIfAborted(): void;
  addEventListener(
    type: 'abort',
    listener: (this: AbortSignal, event: any) => void,
    options?: boolean | { once?: boolean; },
  ): void;
  removeEventListener(type: 'abort', listener: (this: AbortSignal, event: any) => void): void;
  dispatchEvent(event: any): boolean;
}

/**
 * Structural counterpart of the platform `AbortController` -- see the
 * module doc comment above for the mutual-assignability design.
 */
export interface AbortController {
  readonly signal: AbortSignal;
  abort(reason?: any): void;
}

/**
 * Constructor shape for {@link AbortController}, matching the platform
 * global's static side.
 */
export type AbortControllerConstructor = Ctor<[], AbortController>;

/**
 * The platform `AbortController` constructor, re-typed against our owned
 * structural interfaces. No runtime fallback -- this IS
 * `globalThis.AbortController` (native in Node >=15 / bun / deno /
 * browsers).
 */
export const AbortController: AbortControllerConstructor =
  // Through `unknown`: the bare-lib `typeof globalThis` (no lib.dom /
  // @types/node / bun-types in a library program) genuinely lacks the
  // property, so the direct cast is a TS2352 under the honest program.
  (globalThis as unknown as { AbortController: AbortControllerConstructor; }).AbortController;

/**
 * A singleton inert signal that never aborts -- the port's analog of the
 * reference stack's never-cancelled token. Pass it where an
 * {@link AbortSignal} is required but cancellation is genuinely
 * not-applicable; every member is a no-op.
 */
export const neverSignal: AbortSignal = {
  aborted: false,
  reason: undefined,
  onabort: null,
  throwIfAborted() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false;
  },
};
