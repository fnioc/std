// The request chain as a plain fold, composed by hand rather than by the builder. An addon is
// only `{ registrations, middleware }`, so nothing about a lifetime model is privileged: a
// diagnostic layer sits outside the model as readily as inside it, and the fold alone decides
// which entry stands outermost.

import { standardLifetime } from '@rhombus-std/di';
import { type GetService, Manifest, type Middleware, type Registration, type StandardLifetime, UnsatisfiableError } from '@rhombus-std/di.core';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
import { ServiceProvider } from '@rhombus-std/di/private/ServiceProvider';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const LEAF = Type.imported('Leaf', 'app');

class Leaf {}

const terminus: GetService = request => {
  throw new UnsatisfiableError(request.address, 'nothing beneath the engine produces it');
};

/** Folds `chain` around `engine` exactly as the builder does, the first entry standing outermost. */
function compose(chain: readonly Middleware[], engine: Engine): ServiceProvider {
  const head = chain.reduceRight<GetService>(
    (next, middleware) => middleware(next),
    request => engine.getService(request, terminus),
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
    const engine = new Engine(Manifest.build<unknown>(m => m.add(LEAF, Leaf, Type.ctor(LEAF, [[]]))));

    expect(compose([], engine).resolve(LEAF)).toBeInstanceOf(Leaf);
  });

  test('the first entry in the chain stands outermost', () => {
    const log: string[] = [];
    const engine = new Engine(Manifest.build<unknown>(m => m.add(LEAF, Leaf, Type.ctor(LEAF, [[]]))));

    compose([tracing('first', log), tracing('second', log)], engine).resolve(LEAF);

    expect(log).toEqual(['enter first', 'enter second', 'exit second', 'exit first']);
  });

  test('a lifetime model is an addon like any other, and composes wherever it is put', () => {
    const log: string[] = [];
    const model = standardLifetime();
    const registrations: Registration<unknown>[] = [
      ...Manifest.build<StandardLifetime>(m => m.add(LEAF, Leaf, Type.ctor(LEAF, [[]]), 'transient')),
      ...model.registrations,
    ];
    const engine = new Engine(registrations);

    // The probe stands OUTSIDE the model, so the model's own fold-time control ask never crosses
    // it: only the leaf ask does.
    const provider = compose([tracing('outside-the-model', log), model.middleware], engine);

    expect(provider.resolve(LEAF)).toBeInstanceOf(Leaf);
    expect(log).toEqual(['enter outside-the-model', 'exit outside-the-model']);
  });
});
