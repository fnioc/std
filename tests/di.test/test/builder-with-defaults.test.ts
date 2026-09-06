// Behaviour tests for Builder.withDefaults: the common-path opener that seeds the standard lifetime
// model, address validation always, and scope and buildability validation each behind an option.

import { Builder, ScopeValidationError } from '@rhombus-std/di';
import { type IAddressDiagnostics, type IServiceScopeFactory, type Manifest, Registration, type StandardLifetime } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const GREETING = Type.imported('Greeting', 'app');
const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');
const COUNTER = Type.imported('Counter', 'app');
const HOLDER = Type.imported('Holder', 'app');
const SCOPE_FACTORY = Type.imported('IServiceScopeFactory', '@rhombus-std/di.core');
const REPORT = Type.imported('IAddressDiagnostics', '@rhombus-std/di.core');

class Counter {}
class Holder {
  constructor(readonly counter: Counter) {}
}
class Widget {
  constructor(readonly conn: unknown) {}
}

/** The scoped-under-singleton captive the scope validator refuses. */
const captive = (m: Manifest<StandardLifetime>) =>
  m
    .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
    .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton');

describe('Builder.withDefaults', () => {
  test('opens the chain and a registered service resolves', () => {
    const provider = Builder.withDefaults().withServices(m => m.add(Registration.value(GREETING, 'hello'))).build();

    expect(provider.getService(GREETING)).toBe('hello');
  });

  test('with validateScopes, a captive graph is refused when the singleton is reached', () => {
    const provider = Builder.withDefaults({ validateScopes: true }).withServices(captive).build();

    expect(() => provider.resolve(HOLDER)).toThrow(ScopeValidationError);
  });

  test('with validateOnBuild, a missing dependency is refused at build', () => {
    const build = () => Builder.withDefaults({ validateOnBuild: true }).withServices(m => m.add(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]]), 'singleton')).build();

    expect(build).toThrow(AggregateError);
  });

  test('with neither, a missing dependency surfaces only at the ask', () => {
    const provider = Builder.withDefaults().withServices(m => m.add(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]]), 'singleton')).build();

    expect(() => provider.resolve(WIDGET)).toThrow();
  });

  test('seeds the standard lifetime model: its scope factory resolves', () => {
    const provider = Builder.withDefaults().withServices(m => m.add(Registration.value(GREETING, 'hello'))).build();

    expect((provider.resolve(SCOPE_FACTORY) as IServiceScopeFactory).openScope().resolve(GREETING)).toBe('hello');
  });
});

describe('the address-diagnostics report Builder.withDefaults seeds', () => {
  test('resolves, and carries a build-time warning', () => {
    const provider = Builder.withDefaults().withServices(m => m.add(Registration.value(Type.array(Type.optional(CONN)), []))).build();

    const report = provider.resolve(REPORT) as IAddressDiagnostics;
    expect(report.diagnostics.map(diagnostic => diagnostic.id)).toContain('DI1008');
  });

  test('appends an ask-time warning', () => {
    const provider = Builder.withDefaults().withServices(m => m.add(Registration.value(CONN, 'conn'))).build();

    provider.getService(Type.undefinedLiteral);
    const report = provider.resolve(REPORT) as IAddressDiagnostics;
    expect(report.diagnostics.map(diagnostic => diagnostic.id)).toContain('DI1012');
  });
});
