// @rhombus-std/examples.app.shared — the composition-root work both example
// apps do identically.
//
// It is named `examples.app.*` rather than `examples.lib.*` for one reason, and
// it is the reason the whole example set exists to demonstrate: this package
// references `@rhombus-std/di`, the resolution ENGINE. It constructs manifests,
// it builds providers, it opens scopes. A library never does any of that — it is
// handed a manifest, it contributes registrations, and it hands the manifest
// back. A package that reaches the engine is entry-point-family by definition,
// whatever else it looks like.
//
// What lands here rather than in either app is what BOTH apps need and neither
// dialect changes. Twinning it into the two apps would make their byte-identical
// output a matter of discipline; importing one function makes it structural.
//
// Every one of these is designed to be given back. If the classes named in
// `errors-demo.ts`'s header ever become reachable from `@rhombus-std/di.core`,
// that chapter returns to the library it came from and this package shrinks —
// possibly to nothing.

// Every failure the container can raise from BUILD time onwards, provoked on
// purpose and turned into an operator-facing line. The registration-time half
// stays in the library, and this chapter's `diagnose` extends the library's
// `diagnoseRegistration` rather than restating it.
export { demonstrateErrors, diagnose } from './errors-demo.js';

// The manifest as a value: the library chapter, plus the three pieces of it that
// need the engine — making a manifest, building a provider, and naming the class
// `build()` returns.
export { buildProvider, demonstrateManifestSurface, freshManifest } from './manifest-surface-demo.js';

// The `IServiceProviderFactory` both infrastructure chapters build their
// containers through — the seam a HOST owns, at the layer that owns it — and the
// one-line `DiError` classifier those chapters end on.
export { describeDiError } from './describe-di-error.js';
export { ManifestServiceProviderFactory } from './provider-factory.js';
