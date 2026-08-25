// A hosted-service registration, published as a manifest built on the
// narrowest lifetime vocabulary it actually uses. A consumer merges it into
// their own manifest -- `services.add(getHostedServiceManifest(Worker))` --
// and that merge is what checks their vocabulary covers `'singleton'`.
//
// Every hosted service registers under the one shared
// {@link HOSTED_SERVICE_TYPE} as a singleton, and the host resolves the
// whole set via the collection wrapper token.

import { type IServiceProvider, Manifest } from '@rhombus-std/di.core';
import { type ConstructorType, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { IHostedService } from './IHostedService';
import { HOSTED_SERVICE_TYPE } from './types';

// An ES class stringifies to a `class …` head; a factory (arrow or plain
// function) does not.
function isConstructor(target: Ctor | Func<[IServiceProvider], IHostedService>): target is Ctor {
  return /^class[\s{]/.test(Function.prototype.toString.call(target));
}

/**
 * Registers a factory as an {@link IHostedService}. Use it to surface an
 * instance already registered under a different token as a hosted service
 * (e.g. `getHostedServiceManifest((sp) => sp.resolve(SOME_TOKEN))`).
 *
 * @remarks
 * Listed before the ctor overload so an un-annotated factory lambda infers
 * its resolver parameter; a class value is disambiguated by type (not
 * arity) and still resolves to the ctor overload below.
 */
export function getHostedServiceManifest(implementationFactory: Func<[IServiceProvider], IHostedService>): Manifest<'singleton'>;
/**
 * Registers `ctor` as an {@link IHostedService} the host will start and
 * stop alongside its lifetime. `implementerType` is the ctor's composed
 * constructor type; omitted, a dependency-free ctor is assumed.
 */
export function getHostedServiceManifest(ctor: Ctor, implementerType?: ConstructorType): Manifest<'singleton'>;
// A class value matches the construct-signature arm, an arrow or function the
// call-signature arm; only the ctor form carries a composed constructor type.
export function getHostedServiceManifest(ctorOrImplementationFactory: Ctor | Func<[IServiceProvider], IHostedService>, implementerType?: ConstructorType): Manifest<'singleton'> {
  const m = Manifest.empty<'singleton'>();
  // The factory form injects the live resolver (via the `Type.func(..., [[typefor<IServiceProvider>()]])`
  // composed type) so the delegate receives it. A ctor form
  // with no `implementerType` is a dependency-free ctor, stated explicitly as one
  // that carries no argument types (`addClass` has no overload that omits it).
  if (isConstructor(ctorOrImplementationFactory)) {
    return m.add(HOSTED_SERVICE_TYPE, ctorOrImplementationFactory, implementerType ?? Type.ctor(HOSTED_SERVICE_TYPE, [[]]), 'singleton');
  }
  return m.add(HOSTED_SERVICE_TYPE, ctorOrImplementationFactory as Func, Type.func(HOSTED_SERVICE_TYPE, [[typefor<IServiceProvider>()]]), 'singleton');
}
