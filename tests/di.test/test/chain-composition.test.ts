// The request chain as a plain fold, composed by hand rather than by the builder.
//
// An addon is only `{ registrations, middleware }`, so nothing about a lifetime model is privileged:
// it is outermost through the builder because `usingLifetimeModel` names it first, not because the
// architecture puts it there. These tests compose the chain directly to keep that true — a diagnostic
// layer can sit OUTSIDE the model, which is impossible to arrange through the builder alone.

import { standardLifetimeAddon } from '@rhombus-std/di';
import { Manifest, type Middleware, Registration } from '@rhombus-std/di.core';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
import { ServiceProvider } from '@rhombus-std/di/private/ServiceProvider';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const LEAF = Type.imported('Leaf', 'app');

class Leaf {}

/** Folds `chain` around `engine` exactly as the builder does, the first entry standing outermost. */
function compose(chain: readonly Middleware[], engine: Engine): ServiceProvider {
  const head = chain.reduceRight<(request: Type) => unknown>(
    (next, middleware) => middleware(next),
    address => engine.getService(address),
  );
  return new ServiceProvider(head);
}

function tracing(name: string, log: string[]): Middleware {
  return next => request => {
    log.push(`enter ${name}`);
    const answer = next(request);
    log.push(`exit ${name}`);
    return answer;
  };
}

describe('request chain composition', () => {
  test('a provider resolves with no middleware in the chain at all', () => {
    const engine = new Engine([Registration.ctor(LEAF, Leaf, Type.ctor(LEAF, [[]]))]);

    expect(compose([], engine).resolve(LEAF)).toBeInstanceOf(Leaf);
  });

  test('the first entry in the chain stands outermost', () => {
    const log: string[] = [];
    const engine = new Engine([Registration.ctor(LEAF, Leaf, Type.ctor(LEAF, [[]]))]);

    compose([tracing('first', log), tracing('second', log)], engine).resolve(LEAF);

    expect(log).toEqual(['enter first', 'enter second', 'exit second', 'exit first']);
  });

  test('a lifetime model is an addon like any other, and composes wherever it is put', () => {
    const log: string[] = [];
    const model = standardLifetimeAddon().create();
    const registrations: Registration<unknown>[] = [
      ...(model.registrations ?? []) as Iterable<Registration<unknown>>,
      ...Manifest.empty<'transient'>().add(LEAF, Leaf, Type.ctor(LEAF, [[]]), 'transient') as Iterable<
        Registration<unknown>
      >,
    ];
    const engine = new Engine(registrations);

    // The probe stands OUTSIDE the model -- the one arrangement the builder cannot produce, since
    // `usingLifetimeModel` installs the model ahead of every addon a caller can name.
    const provider = compose([tracing('outside-the-model', log), model.middleware!], engine);

    expect(provider.resolve(LEAF)).toBeInstanceOf(Leaf);
    expect(log).toEqual(['enter outside-the-model', 'exit outside-the-model']);
  });
});
