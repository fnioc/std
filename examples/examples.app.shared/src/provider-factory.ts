// The seam between "the registrations are collected" and "here is the provider
// to run against" — and the reason it lives at a composition ROOT rather than in
// either example library.
//
// A library contributes REGISTRATIONS. It is handed a manifest, it adds to it,
// it hands it back; it never decides when the container is built, with which
// options, or how long the root scope stays open. Those are the three things
// this class decides, and they are the composition root's calls to make. That is
// also why the reference seam is consumed by a HOST — `IHostBuilder`'s
// `useServiceProviderFactory` / `configureContainer` are typed against exactly
// this interface, and the implementations in the wild are container ADAPTERS
// plugged in at the entry point.
//
// The interface itself (`IServiceProviderFactory`) is `@rhombus-std/di.core`, so
// a library is free to ACCEPT one as a parameter. What it cannot do — and what
// pins this file here — is write one: `createServiceProvider` has to call
// `build()`, and `build()` is the engine.

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
 * Two things a reader should notice about the seam's current shape, because they
 * bound what an implementation can do:
 *
 *   - `createServiceProvider` hands back `IResolver`, the minimal resolution
 *     surface — scope creation and disposal are NOT part of it, so a host that
 *     went through the seam could not open a scope or close the container down.
 *   - `createBuilder`'s parameter is `IServiceManifest` with the DEFAULT
 *     `'singleton'` scope union baked in, so this class cannot be generic over
 *     an application's own scope names; an app declaring extra scopes has to
 *     cast on the way in.
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
    // workshop ships one that can never satisfy it: `GreetingCard`'s recipient
    // slot is the CALLER's, handed over through the injected card factory, and no
    // registration stands behind it. A whole-graph check cannot tell a
    // deliberately caller-supplied slot apart from a wiring hole, so a container
    // that uses the partition has to opt out of it.
    return containerBuilder.build().createScope('singleton');
  }
}
