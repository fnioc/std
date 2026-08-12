// This library's published Type surface — the ABI half of "this library
// registers things for you". A consuming application authored without the
// transformer still has to name these Types to resolve anything, and a
// hand-guessed spelling that drifted from the real registration would fail at
// resolve time rather than at compile time. Publishing them here closes that
// gap the same way publishing the interfaces does.
//
// MINTED, not written: `typefor<T>()` runs the very same derivation the
// registration sugar in `./add-with-transformer-examples.ts` runs, so the
// published Type and the registered service type are the SAME interned
// object, never merely two equal strings. The manual sibling
// (`@rhombus-std/examples.lib.without-transformer`'s `types.ts`) publishes the
// identical Types by hand, via `Type.named(...)` — interning is what lets the
// two spellings meet on one object, which is what the interop matrix rests on.
//
// `typefor` has no runtime footprint: the build folds each call to the `Type`
// expression it derives and elides this import with it, so nothing here
// reaches the authoring package at run time. That is why it is a devDependency.

import type { IBanner, IServerReport } from '@rhombus-std/examples.contracts';
import { typefor } from '@rhombus-std/primitives.extras';

/**
 * The Types {@link addWithTransformerExamples} registers this library's two
 * app-facing services under.
 *
 * The greeting is deliberately NOT here. It goes into the shared `IGreeting`
 * collection both example libraries contribute to, and a consumer asks for the
 * collection — never for one library's element — so naming this library's
 * greeting would invite exactly the wrong lookup.
 */
export const EXAMPLE_TYPES = {
  /** The report assembled from the whole container. */
  report: typefor<IServerReport>(),
  /**
   * The banner is registered ONLY in its promise wrapper, so the caller awaits
   * what `getRequiredService` hands back for this Type, which carries the
   * `Promise<…>` wrapper the derivation gives it.
   */
  banner: typefor<Promise<IBanner>>(),
} as const;
