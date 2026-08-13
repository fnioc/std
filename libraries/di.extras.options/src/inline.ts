// Sugar body for `addOptions<T>()`; substituted at call sites during the
// build, not executed at runtime. Not re-exported by ./index.ts — kept out
// of the bundle deliberately.

import type { Manifest } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { registerInlineBodies, typefor } from '@rhombus-std/primitives.extras';

/** Receiver shape the sugar body is compiled against. */
interface IInlineOptionsTarget {
  addOptions(tType: Type | string): Manifest;
}

/**
 * `addOptions<T>()` sugar: `this.addOptions(typefor<T>())`.
 *
 * @remarks
 * The verb takes the bare `T`. `IOptions<T>` is never spelled here, because one
 * open registration answers every `IOptions<…>` request — so the sugar has only
 * its own type argument to derive.
 */
export const ServiceOptionsInline = { addOptions<T>(this: IInlineOptionsTarget): Manifest {
  return this.addOptions(typefor<T>());
} };
registerInlineBodies(ServiceOptionsInline);
