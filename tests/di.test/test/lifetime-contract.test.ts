// The lifetime behavior contract: what installing a keeping model must make true, stated as
// behavior only — nothing here names the model's structure or its addon surface. Recorded as
// todo entries because no lifetime model ships yet; each becomes an executable test when one
// lands. Scope-validation entries state both switch positions and deliberately pin no default.

import { describe, test } from 'bun:test';

/** Every entry awaits a lifetime model; the throw keeps a `--todo` run honest about that. */
const awaits = () => {
  throw new Error('awaits a lifetime model');
};

describe('singleton', () => {
  test.todo('one instance per container: every resolve and every injection site shares it', awaits);
  test.todo('constructed lazily, on the first resolve', awaits);
  test.todo('a singleton factory runs once, however many resolves follow', awaits);
  test.todo('an instance handed to the registration is returned as-is and never constructed', awaits);
  test.todo('resolving from a scope answers the container-wide instance', awaits);
});

describe('scoped', () => {
  test.todo('one instance per scope, shared by everything resolved in that scope', awaits);
  test.todo('two scopes get two instances', awaits);
  test.todo('a nested scope gets its own instance, independent of its parent', awaits);
  test.todo('resolving a scoped service from the root is refused while scope validation is on', awaits);
  test.todo("with scope validation off, a scoped service resolved from the root behaves as the root scope's own", awaits);
});

describe('transient', () => {
  test.todo('a fresh instance per resolve and per injection site', awaits);
  test.todo('a transient injected into a singleton is constructed once and kept with it', awaits);
});

describe('captive dependencies', () => {
  test.todo('a scoped service injected into a singleton is refused while scope validation is on', awaits);
  test.todo("with scope validation off, the singleton captures the first scope's instance", awaits);
});

describe('disposal', () => {
  test.todo('disposing the container disposes the singletons it constructed, most recent first', awaits);
  test.todo('disposing a scope disposes what that scope constructed, most recent first', awaits);
  test.todo('an instance handed to a registration is never disposed by the container', awaits);
  test.todo('transient disposables constructed in a scope are disposed with the scope', awaits);
  test.todo('async disposal settles async products; sync disposal of an async-only product refuses', awaits);
  test.todo('resolving from a disposed scope or container refuses', awaits);
  test.todo('opening a scope from a disposed container refuses', awaits);
});

describe('scopes', () => {
  test.todo('the scope opener is resolvable from the root and from any scope', awaits);
  test.todo("the provider resolved inside a scope is that scope's own", awaits);
  test.todo("sibling scopes never see each other's instances", awaits);
});

describe('collections under lifetimes', () => {
  test.todo("each element of a collection honors its own registration's lifetime", awaits);
});

describe('build-time validation', () => {
  test.todo('with build validation on, an unbuildable registration fails the build, every failure reported together', awaits);
});
