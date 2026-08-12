// Sugar body for `addOptions<T>()`; substituted at call sites during the
// build, not executed at runtime. Not re-exported by ./index.ts — kept out
// of the bundle deliberately.

import type { Manifest } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import type { Type } from '@rhombus-std/primitives';
import { registerInlineBodies, tokenfor, tokenof } from '@rhombus-std/primitives.extras';

/** Receiver shape the sugar body is compiled against. */
interface IInlineOptionsTarget {
  addOptions(optionsType: Type | string, tType: Type | string): Manifest;
}

/**
 * `addOptions<T>()` sugar: `this.addOptions(tokenfor<IOptions<T>>(), tokenof<T>())`.
 *
 * Both arguments are token strings, which the receiver reads into Types. The
 * wrapper stays on `tokenfor` because the lowering stages resolve a composed
 * generic (`IOptions<T>`, closed by the call site's type argument) only for the
 * token primitives; the `typefor` counterpart survives lowering untouched.
 *
 * The element uses `tokenof<T>()` rather than `tokenfor<T>()`: `tokenfor<T>()`
 * strips a `Keyed<T, K>` brand down to the bare service token, whereas the
 * wrapped `T` needs its raw type token (brand included) so it matches
 * `IOptions<T>`'s inner leaf.
 */
export const ServiceOptionsInline = { addOptions<T>(this: IInlineOptionsTarget): Manifest {
  return this.addOptions(tokenfor<IOptions<T>>(), tokenof<T>());
} };
registerInlineBodies(ServiceOptionsInline);
