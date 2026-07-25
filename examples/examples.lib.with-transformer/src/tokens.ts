// The token strings this library REGISTERS AT, published as part of its surface.
//
// A library whose tokens are DERIVED has a problem the manual dialect does not:
// the strings only ever exist inside its lowered build. A consuming application
// authored without the transformer still has to name them to resolve anything,
// and a hand-guessed spelling that drifts from the real derivation fails at
// resolve time rather than at compile time. So the tokens are published exactly
// like the interfaces are — they are the ABI half of "this library registers
// things for you".
//
// MINTED, not written: `tokenfor<T>()` runs the very same derivation the
// registration sugar in `./add-with-transformer-examples.ts` runs, so the
// published string and the registered token cannot drift apart. The manual
// sibling publishes the same idea the only way it can, as hand-written constants
// (`@rhombus-std/examples.lib.without-transformer`'s `tokens.ts`) — and the two
// spellings agree byte for byte, which is what the interop matrix rests on.
//
// `tokenfor` has no runtime footprint: the build folds each call to its string
// literal and elides this import with it, so nothing here reaches the authoring
// package at run time. That is why it is a devDependency.

import type { IBanner, IServerReport } from '@rhombus-std/examples.contracts';
import { tokenfor } from '@rhombus-std/primitives.extras';

/**
 * The tokens {@link addWithTransformerExamples} registers this library's two
 * app-facing services under.
 *
 * The greeting is deliberately NOT here. It goes into the shared `IGreeting`
 * collection both example libraries contribute to, and a consumer asks for the
 * collection — never for one library's element — so naming this library's
 * greeting would invite exactly the wrong lookup.
 */
export const EXAMPLE_TOKENS = {
  /** `token(IServerReport)` — the report assembled from the whole container. */
  report: tokenfor<IServerReport>(),
  /**
   * `token(Promise<IBanner>)` — the banner is registered ONLY in its promise
   * wrapper, so `resolveAsync` is the only way in and the token carries the
   * `Promise<…>` wrapper the derivation gives it.
   */
  banner: tokenfor<Promise<IBanner>>(),
} as const;
