// The seam between "the registrations are collected" and "here is the provider
// to run against" — and the reason it lives at a composition ROOT rather than in
// either example library.
//
// A library contributes REGISTRATIONS. It is handed a manifest, it adds to it,
// it hands it back; it never decides when the container is built, with which
// options, or how long the root scope stays open. Those are the three things
// this class decides, and they are the composition root's calls to make. It is
// also why a HOST is the seam's natural consumer: `IHostBuilder`'s
// `useServiceProviderFactory` and `IHostApplicationBuilder`'s
// `configureContainer` are typed against exactly this interface, and an
// implementation of it is a container adapter plugged in at the entry point.
//
// The interface itself (`IServiceProviderFactory`) is `@rhombus-std/di.core`, so
// a library is free to ACCEPT one as a parameter. What it cannot do — and what
// pins this file here — is write one: `createServiceProvider` has to call
// `build()`, and `build()` is the engine.
//
// Dialect-independent: the sibling app's copy of this file is identical to it.

import type { IResolver, IServiceManifest, IServiceProviderFactory } from '@rhombus-std/di';

/**
 * An `IServiceProviderFactory` over this repo's own container.
 *
 * The seam splits container construction in two: `createBuilder` adapts the
 * collected registrations into whatever object the container wants to be
 * configured through, and `createServiceProvider` turns that (by then
 * caller-configured) object into the provider everything resolves from. A
 * third-party container would do real adapting in the first step; with one
 * container type here the builder IS the manifest, and the value the seam adds
 * is that the BUILD OPTIONS live in one place instead of at every `build()`
 * call site — which is exactly what a root wants to own.
 *
 * Two things about the seam's shape a reader should notice, because they say
 * what an implementation is for:
 *
 *   - `createServiceProvider` hands back `IResolver`, the resolution surface and
 *     nothing else. Scope creation and disposal stay with whoever owns the
 *     container's lifetime, which is the root that installed the factory rather
 *     than the code that went through it.
 *   - `createBuilder`'s parameter is `IServiceManifest` at the default
 *     `'singleton'` scope union: one type serves every application, so a root
 *     that declares its own scope names names them at the manifest and hands the
 *     seam the shape it publishes.
 */
export class ManifestServiceProviderFactory implements IServiceProviderFactory<IServiceManifest> {
  public createBuilder(services: IServiceManifest): IServiceManifest {
    return services;
  }

  public createServiceProvider(containerBuilder: IServiceManifest): IResolver {
    // The one policy this factory imposes: every container it builds runs inside
    // an OPEN root scope. `build()` on its own is frameless, so a
    // `'singleton'`-tagged registration has no frame to be cached in and quietly
    // resolves transiently instead — a mistake that costs nothing at startup and
    // everything later. Deciding it once, here, rather than at each `build()`
    // call site is exactly what the seam is for.
    //
    // Deliberately NOT `build({ validateOnBuild: true })`, tempting as that
    // looks. The eager pass dry-runs every EXACT registration, and the greeting
    // workshop ships one slot that is not a registration at all: `GreetingCard`'s
    // recipient is the CALLER's, handed over through the injected card factory
    // when a card is asked for. A container that uses the partition builds
    // without the whole-graph pass, which is the choice this factory makes once
    // for every container it hands out.
    return containerBuilder.build().createScope('singleton');
  }
}
