// THE MANIFEST AS A VALUE — the composition-root half.
//
// The chapter itself lives in `@rhombus-std/examples.lib.without-transformer`,
// because almost all of it is library work: recognising the augmentation
// receiver, reaching the intrinsic primitives, narrowing a provider to a
// capability, pinning a slot the derivation got wrong. Three things in it are
// not, and they are what this file supplies:
//
//   - MAKING a manifest. `freshManifest(ServiceManifest)` constructs one, and
//     construction is the root's verb — a library is handed a manifest, it never
//     starts one.
//   - TURNING one into a provider. `buildProvider` reaches `build()` through the
//     standalone augmentation form, and that augmentation set IS the engine:
//     `@rhombus-std/di` is what installs it onto the collection di.core ships.
//   - NAMING the class `build()` hands back. `ServiceProviderClass` is a
//     `@rhombus-std/di` export, so a library literally cannot write the check —
//     which is the lesson ("a consumer holds the interface, never this class")
//     proved structurally rather than asserted in a comment.
//
// Dialect-independent: none of this has a type-driven form. Both example apps
// import THIS function rather than twinning it, so their output cannot drift.

import { ServiceManifest, ServiceManifestContainerBuilderAugmentations, ServiceProviderClass } from '@rhombus-std/di';
import type { IServiceManifest, IServiceProvider, ServiceManifestCtor } from '@rhombus-std/di';
import type { ServiceManifestClass } from '@rhombus-std/di.core';
import { addShopServices,
  demonstrateManifestSurface as inspectManifestSurface } from '@rhombus-std/examples.lib.without-transformer';

/**
 * Starts a fresh manifest from the CONSTRUCTOR rather than from the value.
 *
 * `ServiceManifestCtor` is the static side of the public `ServiceManifest` — the
 * type of `new ServiceManifest<S>()` — and taking it as a parameter is how an
 * entry point lets its caller decide which collection to build into. A test host
 * is the obvious consumer: the production entry point hands it the same
 * constructor the application uses, so the test cannot accidentally compose into
 * a different collection type than the one that ships.
 *
 * @param Manifest The registration-builder constructor to instantiate.
 */
export function freshManifest(Manifest: ServiceManifestCtor): IServiceManifest<'singleton'> {
  return new Manifest<'singleton'>();
}

/**
 * The narrowing the standalone form needs: from the public authoring INTERFACE
 * to the concrete collection.
 *
 * Two-step through `unknown` because the two types genuinely do not overlap in
 * the direction TypeScript checks — and in a program carrying the
 * `@rhombus-std/di.extras` augmentation the interface is wider still, so a
 * single-step cast compiles in one dialect and not the other.
 */
function asBuilder<S extends string>(services: IServiceManifest<S>): ServiceManifestClass<S> {
  return services as unknown as ServiceManifestClass<S>;
}

/**
 * Builds a provider, called through the container-builder augmentation const.
 *
 * Each augmentation set is exported as a plain object of RECEIVER-FIRST
 * functions, and installing it onto the prototype is a second, separate step.
 * `services.build()` and
 * `ServiceManifestContainerBuilderAugmentations.build(services)` are the same
 * function reached two ways. The standalone form is what you want when the call
 * has to be a VALUE — passed to `map`, composed into a pipeline, or (as here)
 * handed to somebody else as a callback, which is precisely how the library
 * chapter below gets a provider without being able to make one.
 *
 * Reaching it also makes the two halves visible: di.core ships the collection
 * with a `build()` that only throws, and `@rhombus-std/di` supplies the real one
 * through the augmentation registry when it is imported. The method is the seam
 * between the collection and the engine — and a composition root is the layer
 * that is allowed to stand on both sides of it.
 */
export function buildProvider(services: IServiceManifest<'singleton'>): IServiceProvider<'singleton'> {
  // The receiver-first members are typed against the CLASS and the widest scope
  // union, because an augmentation set is authored once for every manifest there
  // will ever be. A caller with a narrower union re-narrows on the way out; the
  // fluent method does that for you, which is most of why it exists.
  return ServiceManifestContainerBuilderAugmentations.build(
    asBuilder<string>(services),
  ) as IServiceProvider<'singleton'>;
}

/**
 * Runs the whole manifest-surface tour and returns the report lines.
 *
 * @returns One line per observation, in a fixed order.
 */
export function demonstrateManifestSurface(): readonly string[] {
  // The composition-root shape in miniature: the root MAKES the manifest, the
  // library REGISTERS into it, and the root keeps the result.
  const production = addShopServices(freshManifest(ServiceManifest));

  // The library chapter, handed the two things it can no longer make for itself:
  // a wired manifest, and a way to turn one into a provider. `buildProvider` is
  // an ordinary function parameter rather than a DI slot — the same inversion
  // the whole restructure is about, applied one level up. Something that needs a
  // container asks for a way to make one; it does not reach for the engine.
  const lines = [...inspectManifestSurface(production, buildProvider)];

  // And the observation only a composition root is in a position to make.
  const provider = buildProvider(production);
  lines.push(
    `what build() handed back: an IServiceProvider, backed by ${
      provider instanceof ServiceProviderClass ? 'ServiceProviderClass' : 'something else'
    } — a consumer holds the interface, never this class`,
  );
  return lines;
}
