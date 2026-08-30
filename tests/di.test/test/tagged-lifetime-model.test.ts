// Behaviour tests for the tagged lifetime model: which of the open scopes keeps an instance when
// scopes are named, and what happens when none of them answers to the name a registration used.

import { di, tagged, TaggedScopeFactory } from '@rhombus-std/di';
import { type IServiceProvider, LifetimeModelError, ScopeTagUnmatchedError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

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

/** The closed address an asker declaring every tag this suite uses spells by hand. */
const SCOPE_FACTORY = Type.imported('TaggedScopeFactory', '@rhombus-std/di', [
  Type.union(Type.typeLiteral('session'), Type.typeLiteral('request')),
]);

function openScope(provider: IServiceProvider, tag: Tags): IServiceProvider {
  return (provider.resolve(SCOPE_FACTORY) as TaggedScopeFactory<Tags>).openScope(tag);
}

describe('the model itself', () => {
  test('names itself, so a failure can say which model refused', () => {
    expect(tagged().name).toBe('tagged');
  });
});

describe('a tagged registration', () => {
  test('is kept by the open scope carrying its tag', () => {
    const scope = openScope(buildProviderKeptBy('request'), 'request');
    expect(scope.resolve(COUNTER)).toBe(scope.resolve(COUNTER));
  });

  test('is kept separately by each scope carrying that tag', () => {
    const provider = buildProviderKeptBy('request');
    const request = openScope(provider, 'request');
    expect(openScope(provider, 'request').resolve(COUNTER)).not.toBe(request.resolve(COUNTER));
  });

  test('reaches out past scopes carrying other tags', () => {
    const session = openScope(buildProviderKeptBy('session'), 'session');
    const request = openScope(session, 'request');
    expect(request.resolve(COUNTER)).toBe(session.resolve(COUNTER));
  });

  test('is shared by every scope nested inside the one keeping it', () => {
    const session = openScope(buildProviderKeptBy('session'), 'session');
    expect(openScope(session, 'request').resolve(COUNTER))
      .toBe(openScope(session, 'request').resolve(COUNTER));
  });

  test('is kept by the nearest scope carrying its tag when one nests inside another', () => {
    const outer = openScope(buildProviderKeptBy('request'), 'request');
    const inner = openScope(outer, 'request');
    expect(inner.resolve(COUNTER)).not.toBe(outer.resolve(COUNTER));
  });
});

describe('an untagged registration', () => {
  test('is constructed afresh for every ask', () => {
    const provider = di.usingLifetimeModel(tagged<Tags>())
      .configureServices(manifest => manifest.add(COUNTER, Counter, COUNTER_TYPE))
      .build();
    const scope = openScope(provider, 'request');
    expect(scope.resolve(COUNTER)).not.toBe(scope.resolve(COUNTER));
  });
});

describe('no scope carrying the tag', () => {
  test('fails naming both the model and the tag rather than answering from the root', () => {
    let caught: unknown;
    try {
      buildProviderKeptBy('request').resolve(COUNTER);
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
    expect(() => session.resolve(COUNTER)).toThrow(LifetimeModelError);
  });
});

describe('opening a scope from a disposed factory', () => {
  // §225 — CreateScope on a torn-down provider is refused: the model throws its disposed-scope
  // error, naming the factory's own address.
  test('refuses openScope once the scope the factory was resolved from is disposed', () => {
    const session = openScope(buildProviderKeptBy('session'), 'session');
    const factory = session.resolve(SCOPE_FACTORY) as TaggedScopeFactory<Tags>;
    (session as unknown as Disposable)[Symbol.dispose]();

    let caught: unknown;
    try {
      factory.openScope('request');
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).name).toBe('DisposedScopeError');
    expect((caught as Error).message).toContain('TaggedScopeFactory');
  });
});

describe('no captivity validation', () => {
  test('tagged() builds and resolves through an opened scope without error', () => {
    const TAG_A = Type.imported('TagA', 'app');
    class TagA {}

    const provider = di.usingLifetimeModel(tagged())
      .configureServices(manifest => manifest.add(TAG_A, TagA, Type.ctor(TAG_A, [[]]), 'session'))
      .build();

    const scope = (provider.resolve(
      Type.imported('TaggedScopeFactory', '@rhombus-std/di', [Type.typeLiteral('session')]),
    ) as TaggedScopeFactory).openScope('session');
    expect(scope.resolve(TAG_A)).toBeInstanceOf(TagA);
  });

  test('a singleton-to-session shape builds without a captivity sweep', () => {
    const TAG_SING = Type.imported('TagSingleton', 'app');
    const TAG_SESS = Type.imported('TagSession', 'app');
    class TagSession {}
    class TagSingleton {
      constructor(readonly session: TagSession) {}
    }

    expect(() =>
      di.usingLifetimeModel(tagged())
        .configureServices(manifest =>
          manifest
            .add(TAG_SESS, TagSession, Type.ctor(TAG_SESS, [[]]), 'session')
            .add(TAG_SING, TagSingleton, Type.ctor(TAG_SING, [[TAG_SESS]]), 'root')
        )
        .build()
    ).not.toThrow();
  });
});
