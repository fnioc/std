// THE MANIFEST AS A VALUE — the composition-root half.
//
// The chapter itself lives in `@rhombus-std/examples.lib.without-transformer`,
// because almost all of it is library work: recognising the augmentation
// receiver, reaching the intrinsic primitives, narrowing a provider to a
// capability, pinning a slot the derivation got wrong. What is left is the four
// verbs a library never writes, and this file is where they are written:
//
//   - MAKING a manifest. `freshManifest(ServiceManifest)` constructs one, and
//     construction is the root's verb — a library is handed a manifest, it never
//     starts one.
//   - TURNING one into a provider. `buildProvider` reaches `build()` through the
//     standalone augmentation form, and that augmentation set IS the engine:
//     `@rhombus-std/di` is what installs it onto the collection di.core ships.
//   - OPENING a scope over the result, and CLOSING it at the end. A container's
//     lifetime is a decision, and it belongs to whoever decided there should be
//     a container.
//   - NAMING the class `build()` hands back. `ServiceProviderClass` is a
//     `@rhombus-std/di` export, so a library literally cannot write the check —
//     which is the lesson ("a consumer holds the interface, never this class")
//     proved structurally rather than asserted in a comment.
//
// Those four are the whole of the test host's second half, and every piece of it
// that ISN'T one of them still comes from the library: `forTests` does the swap,
// `requireCheckout` / `missingFrom` / `inScope` do the three capability-narrowed
// jobs. This file supplies the container and calls them. That is the division
// the example set exists to demonstrate, applied to the one chapter where it is
// least obvious — reading a manifest looks like tooling, and tooling is exactly
// the kind of code that reaches for an engine it does not need.
//
// Dialect-independent: none of this has a type-driven form, so the sibling app's
// copy of this file is identical to it and the chapter header names neither
// dialect.

import { ServiceManifest, ServiceManifestContainerBuilderAugmentations, ServiceProviderClass } from '@rhombus-std/di';
import type { IServiceManifest, IServiceProvider, ServiceManifestClass, ServiceManifestCtor } from '@rhombus-std/di';
import { addShopServices, demonstrateManifestSurface as inspectManifestSurface, forTests, inScope, missingFrom,
  requireCheckout, SHOP_SELF_CHECK_TOKENS } from '@rhombus-std/examples.lib.without-transformer';

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
function freshManifest(Manifest: ServiceManifestCtor): IServiceManifest<'singleton'> {
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
 * has to be a VALUE — passed to `map`, or composed into a pipeline.
 *
 * Reaching it also makes the two halves visible: di.core ships the collection
 * with a `build()` that only throws, and `@rhombus-std/di` supplies the real one
 * through the augmentation registry when it is imported. The method is the seam
 * between the collection and the engine — and a composition root is the layer
 * that is allowed to stand on both sides of it.
 */
function buildProvider(services: IServiceManifest<'singleton'>): IServiceProvider<'singleton'> {
  // The receiver-first members are typed against the CLASS and the widest scope
  // union, because an augmentation set is authored once for every manifest there
  // will ever be. A caller with a narrower union re-narrows on the way out; the
  // fluent method does that for you, which is most of why it exists.
  return ServiceManifestContainerBuilderAugmentations.build(asBuilder<string>(services)) as IServiceProvider<
    'singleton'
  >;
}

/**
 * Runs the manifest-surface chapter end to end — the library's half followed by
 * this layer's — and returns the report lines.
 *
 * The body is worth reading as a shape rather than as a demonstration: it is the
 * five-step composition root in miniature. Make the manifest, hand it to the
 * library, take the result back, build it, and drive the one thing that needs
 * driving. Every line that is not one of those five is a call into the library.
 *
 * @returns One line per observation, in a fixed order.
 */
export function demonstrateManifestSurface(): readonly string[] {
  // The composition-root shape in miniature: the root MAKES the manifest, the
  // library REGISTERS into it, and the root keeps the result.
  const production = addShopServices(freshManifest(ServiceManifest));

  // The library half of the chapter — the manifest read and rewritten as a
  // value. One argument, because that is all it takes: nothing in it needed a
  // container, which is the finding rather than a concession.
  const lines = [...inspectManifestSurface(production)];

  // ── the test host's second half ────────────────────────────────────────────
  //
  // The swap is still the library's — `forTests` is manifest-to-manifest, and a
  // test host is that function plus a caller willing to run the result. This is
  // the caller.
  const tested = forTests(production);
  const provider = buildProvider(tested);
  // `build()` opens no frame, so open one for the `'singleton'` tags to cache in.
  const scope = provider.createScope('singleton');
  lines.push('the test host swaps the outside world and leaves the rest alone:');
  // `requireCheckout` is the library's `IRequiredResolver` helper. It gets the
  // scope handed to it; it had no way to obtain one.
  lines.push(`  ${requireCheckout(scope).run(1250)}`);
  // The immutability claim, checked rather than asserted: `forTests` returned a
  // new manifest, so building the ORIGINAL still yields the live gateway. Its
  // own frame is opened and closed here rather than inline, on the same rule the
  // library's `inScope` follows — whoever opens a frame closes it.
  const untouched = buildProvider(production).createScope('singleton');
  lines.push(`  the production manifest is untouched: ${requireCheckout(untouched).gateway.kind}`);
  untouched.dispose();

  // The three capability faces, each exercised through the library function
  // written against it. The narrowing is the library's design decision; supplying
  // something to narrow is this layer's job.
  const missing = missingFrom(scope, SHOP_SELF_CHECK_TOKENS);
  lines.push(`a self-check that can only ASK (IServiceQuery): missing ${missing.join(', ') || 'nothing'}`);
  lines.push(
    `a request scope that can only OPEN frames (IScopeFactory): ${
      inScope(provider, 'singleton', (request) => requireCheckout(request).run(99))
    }`,
  );

  // And the observation only a composition root is in a position to make: the
  // library cannot name `ServiceProviderClass`, so it cannot write this check —
  // which proves "a consumer holds the interface, never the class" structurally
  // instead of asserting it in a comment.
  lines.push(
    `what build() handed back: an IServiceProvider, backed by ${
      provider instanceof ServiceProviderClass ? 'ServiceProviderClass' : 'something else'
    } — a consumer holds the interface, never this class`,
  );

  scope.dispose();
  return lines;
}
