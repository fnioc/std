// Behaviour tests for the tagged lifetime model: which of the open scopes keeps an instance when
// scopes are named, and what happens when none of them answers to the name a registration used.
// The model is not on the package barrel yet, so it is reached white-box, at the source path it
// lives on.

import { di } from '@rhombus-std/di';
import { type IServiceProvider, LifetimeModelError, ScopeFactory, ScopeTagUnmatchedError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { describe, expect, test } from 'bun:test';
import { tagged } from '../../../libraries/di.core/src/LifetimeModel/models/tagged';

type Tags = 'session' | 'request';

const COUNTER = Type.imported('Counter', 'app');
const COUNTER_TYPE = Type.ctor(COUNTER, [[]]);

class Counter {}

/** A container whose only registration is {@link Counter}, kept by the scope tagged `keptBy`. */
function buildProviderKeptBy(keptBy: Tags): IServiceProvider {
  return di.usingLifetimeModel(tagged<Tags>())
    .configureServices(manifest => manifest.add(COUNTER, Counter, COUNTER_TYPE, keptBy))
    .build();
}

function openScope(provider: IServiceProvider, tag: Tags): IServiceProvider {
  return (provider.getService(ScopeFactory.address) as Func<[Tags], IServiceProvider>)(tag);
}

describe('the model itself', () => {
  test('names itself, so a failure can say which model refused', () => {
    expect(tagged().name).toBe('tagged');
  });
});

describe('a tagged registration', () => {
  test('is kept by the open scope carrying its tag', () => {
    const scope = openScope(buildProviderKeptBy('request'), 'request');
    expect(scope.getService(COUNTER)).toBe(scope.getService(COUNTER));
  });

  test('is kept separately by each scope carrying that tag', () => {
    const provider = buildProviderKeptBy('request');
    const request = openScope(provider, 'request');
    expect(openScope(provider, 'request').getService(COUNTER)).not.toBe(request.getService(COUNTER));
  });

  test('reaches out past scopes carrying other tags', () => {
    const session = openScope(buildProviderKeptBy('session'), 'session');
    const request = openScope(session, 'request');
    expect(request.getService(COUNTER)).toBe(session.getService(COUNTER));
  });

  test('is shared by every scope nested inside the one keeping it', () => {
    const session = openScope(buildProviderKeptBy('session'), 'session');
    expect(openScope(session, 'request').getService(COUNTER))
      .toBe(openScope(session, 'request').getService(COUNTER));
  });

  test('is kept by the nearest scope carrying its tag when one nests inside another', () => {
    const outer = openScope(buildProviderKeptBy('request'), 'request');
    const inner = openScope(outer, 'request');
    expect(inner.getService(COUNTER)).not.toBe(outer.getService(COUNTER));
  });
});

describe('an untagged registration', () => {
  test('is constructed afresh for every ask', () => {
    const provider = di.usingLifetimeModel(tagged<Tags>())
      .configureServices(manifest => manifest.add(COUNTER, Counter, COUNTER_TYPE))
      .build();
    const scope = openScope(provider, 'request');
    expect(scope.getService(COUNTER)).not.toBe(scope.getService(COUNTER));
  });
});

describe('no scope carrying the tag', () => {
  test('fails naming both the model and the tag rather than answering from the root', () => {
    let caught: unknown;
    try {
      buildProviderKeptBy('request').getService(COUNTER);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LifetimeModelError);
    const cause = (caught as LifetimeModelError).cause;
    expect(cause).toBeInstanceOf(ScopeTagUnmatchedError);
    expect((cause as ScopeTagUnmatchedError).modelName).toBe('tagged');
    expect((cause as ScopeTagUnmatchedError).tag).toBe('request');
    expect((cause as Error).message).toContain('the tagged lifetime model');
    expect((cause as Error).message).toContain('no open scope carries that tag');
  });

  test('fails just as loudly from a scope carrying some other tag', () => {
    const session = openScope(buildProviderKeptBy('request'), 'session');
    expect(() => session.getService(COUNTER)).toThrow(LifetimeModelError);
  });
});
