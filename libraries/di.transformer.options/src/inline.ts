// Inline-sugar impl body for the `addOptions<T>()` registration sugar — see the
// "rhombus.inline" key in this package's package.json.
//
// Authored, never executed: the generic inline transform stage substitutes this
// single-return-expression body at consumer call sites (this → the receiver, the
// type parameter bound from the checker), then the primitive (tokenfor / tokenof)
// stage lowers the result. The body contains `tokenfor<IOptions<T>>()` and
// `tokenof<T>()` over an UNBOUND generic, so it must never go through a per-file
// primitive lowering here — with no type to bind, that lowering would rewrite it
// to the empty token. This file is therefore protected exactly like
// `@rhombus-std/di.transformer`'s `src/inline.ts`: the barrel (`src/index.ts`)
// does NOT re-export it, so `bun build` never pulls it into `dist` and it ships
// nowhere. It exists purely as SUBSTITUTION SOURCE the inline stage side-parses
// out of `src/`; the typecheck gate still sees it (§15 phantom-typing guard: the
// `addOptions<T>()` sugar is a pure typing that never runs post-transform), but
// nothing lowers or ships it.
//
// `IOptions` is a body-EXTERNAL type import (from the peered `@rhombus-std/options`):
// the inline stage records it on the composed-generic use so the tokenfor stage
// resolves its base symbol against the consumer program and composes the wrapper
// token `IOptions<element>`. The owner guarantee holds by construction — a
// consumer that spells `addOptions<T>()` has `@rhombus-std/options` in its program
// (this package peers it), so the base always resolves. `tokenfor` / `tokenof` are
// the runtime-leaf token primitives (`@rhombus-std/primitives`); both lower to
// inline token literals and their imports elide.

import type { IServiceManifest, Token } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import { tokenfor, tokenof } from '@rhombus-std/primitives';

/**
 * The two-token view of the `addOptions` verb the sugar body lowers against — the
 * receiver type its `this` parameter carries. The public `addOptions(token,
 * tToken)` overload (`@rhombus-std/options.augmentations`) takes two `Token`s and
 * hands back the registration chain; this interface is the transformer-side view
 * of that same member and never appears in emitted output (the inline stage
 * substitutes only the body's return expression and drops the `this` parameter).
 */
interface IInlineOptionsTarget {
  addOptions(token: Token, tToken: Token): IServiceManifest;
}

/**
 * `addOptions<T>()` sugar body — the tokenless options registration. It is the
 * EXACT hand-written form a no-transformer consumer would author:
 *
 *   addOptions<T>() → this.addOptions(tokenfor<IOptions<T>>(), tokenof<T>())
 *
 * The two token arguments are RELATIONALLY LOCKED: the first is the closed-generic
 * wrapper `IOptions<T>` token (whose inner `T` leaf derives RAW, via DeriveTokenF),
 * the second the bare element `T` token minted the SAME raw way by `tokenof<T>()`.
 * The element uses `tokenof<T>()`, NOT `tokenfor<T>()`: `tokenfor<T>()` is the
 * SERVICE token (it strips a `Keyed<T, K>` brand to the bare base, with the key
 * supplied separately by `keyof<T>()`), whereas the options element wants the raw
 * type token so it matches the wrapper's inner leaf and the retired stage's single
 * `deriveToken` for ALL T — a brand-carrying element included. So the registered
 * `IOptions<T>` and the `T` it wraps agree by construction. Lowers byte-identically
 * to the explicit two-token verb.
 *
 * The single type-parameter `T` (count 1, zero value parameters — `this`
 * excluded) discriminates this body against the runtime two-token overload
 * (count 0, two value parameters), so the inline stage never confuses them.
 */
export const ServiceOptionsInline = {
  addOptions<T>(this: IInlineOptionsTarget): IServiceManifest {
    return this.addOptions(tokenfor<IOptions<T>>(), tokenof<T>());
  },
};
