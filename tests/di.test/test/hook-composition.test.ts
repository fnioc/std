// The hook chain's own contract, pinned on a bare engine.
//
// Nothing here goes through the container builder or a lifetime model: an `Engine` is an
// `IEngineHooks`, so behaviours install straight onto it. That isolation is the point — the builder
// folds middleware innermost-first, so an addon's install-time work runs in reverse of the order it
// was named in, and every ordering fact read through the builder arrives inverted. These tests
// describe what the chain itself does, so a change in either layer cannot quietly cancel out.

import { type Behavior, type Hooks, Registration } from '@rhombus-std/di.core';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const LEAF = Type.imported('Leaf', 'app');

class Leaf {}

function engineWithLeaf(): Engine {
  return new Engine([Registration.ctor(LEAF, Leaf, Type.ctor(LEAF, [[]]))]);
}

describe('hook chain composition', () => {
  test('an engine resolves with no lifetime model and no middleware at all', () => {
    expect(engineWithLeaf().getService(LEAF)).toBeInstanceOf(Leaf);
  });

  test('middleware form: the earlier install stands outermost', () => {
    const log: string[] = [];
    const engine = engineWithLeaf();

    function tracing(name: string): Behavior<unknown> {
      return {
        beforeConstruct(construction, next) {
          log.push(`enter ${name}`);
          const answer = next(construction);
          log.push(`exit ${name}`);
          return answer;
        },
      };
    }

    engine.useHooks(tracing('first'));
    engine.useHooks(tracing('second'));
    engine.getService(LEAF);

    expect(log).toEqual(['enter first', 'enter second', 'exit second', 'exit first']);
  });

  test('handler form: the earlier install applies last, so it owns the result', () => {
    const applied: string[] = [];
    const engine = engineWithLeaf();

    function stamping(name: string): Behavior<unknown> {
      const canonicalize: Hooks<unknown>['canonicalize'] = (_construction, instance) => {
        applied.push(name);
        return { wrapped: instance, by: name };
      };
      return { canonicalize };
    }

    engine.useHooks(stamping('first'));
    engine.useHooks(stamping('second'));
    const resolved = engine.getService(LEAF) as { by: string; };

    expect(applied).toEqual(['second', 'first']);
    expect(resolved.by).toBe('first');
  });

  test('an outer middleware that answers a result keeps the inner behaviours from running', () => {
    const reached: string[] = [];
    const standIn = new Leaf();
    const engine = engineWithLeaf();

    const outer: Behavior<unknown> = {
      beforeConstruct() {
        reached.push('outer');
        return { result: standIn };
      },
    };
    const inner: Behavior<unknown> = {
      beforeConstruct(construction, next) {
        reached.push('inner');
        return next(construction);
      },
    };

    engine.useHooks(outer);
    engine.useHooks(inner);

    expect(engine.getService(LEAF)).toBe(standIn);
    expect(reached).toEqual(['outer']);
  });

  test("each behaviour reads its own state slot and never another's", () => {
    const seen: unknown[] = [];
    const engine = engineWithLeaf();

    function threading(mine: string): Behavior<string> {
      const beginResolve: Hooks<string>['beginResolve'] = () => mine;
      const beforeConstruct: Hooks<string>['beforeConstruct'] = construction => {
        seen.push(construction.state);
        return { state: construction.state };
      };
      return { beginResolve, beforeConstruct };
    }

    engine.useHooks(threading('owned-by-first'));
    engine.useHooks(threading('owned-by-second'));
    engine.getService(LEAF);

    expect(seen).toEqual(['owned-by-first', 'owned-by-second']);
  });

  test('disposing an install removes exactly that behaviour', () => {
    const ran: string[] = [];
    const engine = engineWithLeaf();

    function counting(name: string): Behavior<unknown> {
      return {
        afterConstruct() {
          ran.push(name);
        },
      };
    }

    const kept = engine.useHooks(counting('kept'));
    const dropped = engine.useHooks(counting('dropped'));
    dropped[Symbol.dispose]();
    engine.getService(LEAF);

    expect(ran).toEqual(['kept']);
    expect(kept).toBeDefined();
  });
});
