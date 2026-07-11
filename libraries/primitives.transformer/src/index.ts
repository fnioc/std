// @rhombus-std/primitives.transformer — the standalone token-derivation
// transformer + toolkit (docs/decisions.md §38).
//
// Build-time only. It carries the `nameof<T>()` compile-time token mechanism and
// the full token-derivation machinery (`deriveToken` and friends), extracted out
// of `@rhombus-std/di.transformer` so a di-FREE package can mint augmentation
// tokens from types without depending on the di transformer. `di.transformer`
// now depends on this package: it consumes this derivation toolkit as a normal
// library and re-exports the curated subset that was previously its own public
// surface.
//
// The whole derivation surface is public API here — this package IS the
// transformer-authoring toolkit, and its consumers (di.transformer,
// di.transformer.options) are themselves transformer authors that legitimately
// reach for the low-level primitives (`singletonValue`, `parseToken`,
// `intrinsicToken`, ...). The `./internal/*` white-box subpath additionally
// exposes the raw modules for tests.

// The ts-patch entry (default + named `transform`) and the test-drivable factory
// that rewrites `nameof<T>()` calls.
export { createNameofTransformerFactory, default as transformer, transform } from './transformer.js';

// The shared `TokenContext` builder — the di transformers import it so their
// lowered tokens match the ones this package derives for the same program.
export { createTokenContext, type TokenContextOptions } from './context.js';

// `nameof<T>()` — the compile-time token mechanism (rewritten by the transformer)
// — and the exported identifier name the transformer recognizes.
export { nameof, NAMEOF_NAME } from './nameof.js';

// The closed-generic token grammar helpers (compile-time `parseToken` /
// `isOpenToken`).
export { isOpenToken, type ParsedToken, parseToken } from './grammar.js';

// The token-generation building blocks.
export { baseTokenForSymbol, type DeriveFailure, deriveToken, holeNumberFor, injectTokenFor, intrinsicToken,
  isPureLiteralUnion, type LiteralResult, literalUnionTokenForOptional, type LiteralValue, singletonValue, stripExt,
  type TokenContext, tokenForReturnType, tokenForType, type TokenResult } from './tokens.js';
