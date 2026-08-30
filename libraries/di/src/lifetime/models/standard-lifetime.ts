import { type Registration } from '@rhombus-std/di.core';
import { hasMember, isFunction } from '@rhombus-toolkit/type-guards';
import type { StandardLifetime } from './standard.js';

/** Whether `lifetime` is the object form, naming a keeper and the release to give what it keeps. */
function namesRelease(lifetime: unknown): lifetime is StandardLifetime.WithRelease {
  return hasMember(lifetime, 'keep')
    && (lifetime.keep === 'singleton' || lifetime.keep === 'scoped')
    && hasMember(lifetime, 'release')
    && (lifetime.release === 'external' || isFunction(lifetime.release));
}

/** The lifetime `registration` named, absent when it named none this model reads. */
export function readLifetime(registration: Registration<unknown> | undefined): StandardLifetime | undefined {
  if (registration === undefined || !('lifetime' in registration)) {
    return undefined;
  }
  const { lifetime } = registration;
  if (lifetime === 'singleton' || lifetime === 'scoped' || lifetime === 'transient') {
    return lifetime;
  }
  return namesRelease(lifetime) ? lifetime : undefined;
}

/** Which scope `lifetime` keeps its instance in. */
export function readKeeping(lifetime: StandardLifetime): 'singleton' | 'scoped' | 'transient' {
  return typeof lifetime === 'string' ? lifetime : lifetime.keep;
}
