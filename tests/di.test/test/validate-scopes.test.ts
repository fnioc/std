// Behaviour tests for validateScopes over the standard lifetime model: the two checks it adds —
// a scoped registration resolved from the container's own provider, and a scoped registration
// consumed by a singleton — at the moments each fires, what each lets stand, and how it meets
// several registrations of one address and a collection ask.

import { Builder, ScopeValidationError, standardLifetime, validateBuildability, validateScopes } from '@rhombus-std/di';
import { type IServiceProvider, type IServiceScopeFactory, type Manifest, ManifestValidationError, Registration, type StandardLifetime } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const SCOPE_FACTORY = Type.imported('IServiceScopeFactory', '@rhombus-std/di.core');
const COUNTER = Type.imported('Counter', 'app');
const HOLDER = Type.imported('Holder', 'app');
const OUTER = Type.imported('Outer', 'app');

class Counter {}

class Holder {
  constructor(readonly counter: Counter) {}
}

class Outer {
  constructor(readonly holder: Holder) {}
}

function openScope(provider: IServiceProvider): IServiceProvider {
  return (provider.resolve(SCOPE_FACTORY) as IServiceScopeFactory).openScope();
}

/** Every case's registrations, in registration order, under the lifetimes given. */
function build(lifetimes: { counter: StandardLifetime; holder?: StandardLifetime; outer?: StandardLifetime; },
  ...extra: Array<{ readonly registrations: Iterable<Registration<StandardLifetime>>; readonly middleware: any; }>): IServiceProvider {
  let builder = Builder.useAddon(standardLifetime()).useAddon(validateScopes());
  for (const addon of extra) {
    builder = builder.useAddon(addon);
  }
  return builder
    .withServices(m => {
      let manifest = m.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), lifetimes.counter);
      if (lifetimes.holder !== undefined) {
        manifest = manifest.add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), lifetimes.holder);
      }
      if (lifetimes.outer !== undefined) {
        manifest = manifest.add(OUTER, Outer, Type.ctor(OUTER, [[HOLDER]]), lifetimes.outer);
      }
      return manifest;
    })
    .build();
}

describe("a scoped registration reached from the container's own provider", () => {
  test('resolved directly, it is refused, naming the scoped address', () => {
    const provider = build({ counter: 'scoped' });

    let caught: unknown;
    try {
      provider.resolve(COUNTER);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ScopeValidationError);
    expect((caught as ScopeValidationError).address).toBe(COUNTER);
  });

  test('resolved beneath a transient, it is refused', () => {
    const provider = build({ counter: 'scoped', holder: 'transient' });
    expect(() => provider.resolve(HOLDER)).toThrow(ScopeValidationError);
  });

  test('the refusal fires on every ask, not only the first', () => {
    const provider = build({ counter: 'scoped' });
    expect(() => provider.resolve(COUNTER)).toThrow(ScopeValidationError);
    expect(() => provider.resolve(COUNTER)).toThrow(ScopeValidationError);
  });

  test('the same registration resolved from an opened scope is answered', () => {
    const provider = build({ counter: 'scoped', holder: 'transient' });
    const scope = openScope(provider);
    expect(scope.resolve(COUNTER)).toBeInstanceOf(Counter);
    expect((scope.resolve(HOLDER) as Holder).counter).toBe(scope.resolve(COUNTER));
  });

  test('a refusal caches nothing: the scoped registration is still answered from a scope afterwards', () => {
    const provider = build({ counter: 'scoped' });
    expect(() => provider.resolve(COUNTER)).toThrow(ScopeValidationError);
    expect(openScope(provider).resolve(COUNTER)).toBeInstanceOf(Counter);
  });
});

describe('a scoped registration consumed by a singleton', () => {
  test('directly, it is refused when the singleton is resolved from the container', () => {
    const provider = build({ counter: 'scoped', holder: 'singleton' });
    expect(() => provider.resolve(HOLDER)).toThrow(ScopeValidationError);
  });

  test('directly, it is refused when the singleton is resolved from an opened scope', () => {
    const provider = build({ counter: 'scoped', holder: 'singleton' });
    expect(() => openScope(provider).resolve(HOLDER)).toThrow(ScopeValidationError);
  });

  test('through a transient, it is refused', () => {
    const provider = build({ counter: 'scoped', holder: 'transient', outer: 'singleton' });
    expect(() => openScope(provider).resolve(OUTER)).toThrow(ScopeValidationError);
  });

  test('through another singleton, it is refused', () => {
    const provider = build({ counter: 'scoped', holder: 'singleton', outer: 'singleton' });
    expect(() => openScope(provider).resolve(OUTER)).toThrow(ScopeValidationError);
  });

  test('through a singleton reached beneath a scoped registration, it is refused while inside an open scope', () => {
    const provider = build({ counter: 'scoped', holder: 'singleton', outer: 'scoped' });
    expect(() => openScope(provider).resolve(OUTER)).toThrow(ScopeValidationError);
  });

  test('the refusal names the scoped address, not the singleton that consumed it', () => {
    const provider = build({ counter: 'scoped', holder: 'singleton' });

    let caught: unknown;
    try {
      openScope(provider).resolve(HOLDER);
    } catch (error) {
      caught = error;
    }
    expect((caught as ScopeValidationError).address).toBe(COUNTER);
  });
});

describe('what the checks let stand', () => {
  test('a transient consumed by a singleton', () => {
    const provider = build({ counter: 'transient', holder: 'singleton' });
    expect(provider.resolve(HOLDER)).toBeInstanceOf(Holder);
  });

  test('a scoped registration consumed by a scoped registration, in a scope', () => {
    const provider = build({ counter: 'scoped', holder: 'scoped' });
    const scope = openScope(provider);
    expect((scope.resolve(HOLDER) as Holder).counter).toBe(scope.resolve(COUNTER));
  });

  test('a singleton consumed by a scoped registration, in a scope', () => {
    const provider = build({ counter: 'singleton', holder: 'scoped' });
    expect((openScope(provider).resolve(HOLDER) as Holder).counter).toBe(provider.resolve(COUNTER));
  });

  test('the scope factory held by a singleton', () => {
    const HOLDING = Type.imported('FactoryHolder', 'app');
    class FactoryHolder {
      constructor(readonly factory: IServiceScopeFactory) {}
    }
    const provider = Builder.useAddon(validateBuildability())
      .useAddon(validateScopes())
      .useAddon(standardLifetime())
      .withServices(m => m.add(HOLDING, FactoryHolder, Type.ctor(HOLDING, [[SCOPE_FACTORY]]), 'singleton').add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped'))
      .build();

    const holder = provider.resolve(HOLDING) as FactoryHolder;
    expect(holder.factory.openScope().resolve(COUNTER)).toBeInstanceOf(Counter);
  });
});

describe('when the captive check fires', () => {
  const captive = (m: Manifest<StandardLifetime>) =>
    m
      .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
      .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton');

  test('at build, under validateBuildability composed ahead of it, whichever order the pair was registered in', () => {
    const build = (register: (m: Manifest<StandardLifetime>) => Manifest<StandardLifetime>) => () =>
      Builder.useAddon(validateBuildability()).useAddon(validateScopes()).useAddon(standardLifetime()).withServices(register).build();
    const reversed = (m: Manifest<StandardLifetime>) =>
      m
        .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton')
        .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped');

    expect(build(captive)).toThrow(ManifestValidationError);
    expect(build(reversed)).toThrow(ManifestValidationError);
  });

  test('the build-time failure names the singleton whose plan reached the scoped registration, with the refusal as its error', () => {
    let caught: unknown;
    try {
      Builder.useAddon(validateBuildability()).useAddon(validateScopes()).useAddon(standardLifetime()).withServices(captive).build();
    } catch (error) {
      caught = error;
    }
    const failures = (caught as ManifestValidationError).failures;
    expect(failures.map(failure => failure.address)).toEqual([HOLDER]);
    expect(failures[0]!.error).toBeInstanceOf(ScopeValidationError);
    expect((failures[0]!.error as ScopeValidationError).address).toBe(COUNTER);
  });

  test('at build, for a shadowed registration whose address the newest registration answers cleanly', () => {
    // The captive is hidden behind a later registration of the same address, so no single ask ever
    // reaches it — a collection ask still walks it, and the build plans every registration.
    let caught: unknown;
    try {
      Builder.useAddon(validateBuildability()).useAddon(validateScopes()).useAddon(standardLifetime())
        .withServices(m =>
          m
            .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
            .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton')
            .add(HOLDER, () => new Holder(new Counter()), Type.func(HOLDER, [[]]), 'singleton')
        )
        .build();
    } catch (error) {
      caught = error;
    }
    const failures = (caught as ManifestValidationError).failures;
    expect(failures.map(failure => failure.address)).toEqual([HOLDER]);
    expect(failures[0]!.error).toBeInstanceOf(ScopeValidationError);
    expect((failures[0]!.error as ScopeValidationError).address).toBe(COUNTER);
  });

  test('a pre-built instance never trips the check at build: it has no dependencies to plan', () => {
    expect(() =>
      Builder.useAddon(validateBuildability()).useAddon(validateScopes()).useAddon(standardLifetime())
        .withServices(m => m.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped').addValue(HOLDER, new Holder(new Counter())))
        .build()
    ).not.toThrow();
  });

  test('without validateBuildability, at the first ask that plans the singleton, from any provider', () => {
    const provider = Builder.useAddon(standardLifetime()).useAddon(validateScopes()).withServices(captive).build();
    expect(() => openScope(provider).resolve(HOLDER)).toThrow(ScopeValidationError);
  });

  test('a plan made before the check was installed is still refused at construction', () => {
    // validateBuildability composed behind validateScopes folds first, so its build-time plans see
    // no captive check; the per-ask check still refuses the same graph.
    const provider = Builder.useAddon(standardLifetime()).useAddon(validateScopes()).useAddon(validateBuildability()).withServices(captive).build();
    expect(() => openScope(provider).resolve(HOLDER)).toThrow(ScopeValidationError);
  });
});

describe('several registrations of one address', () => {
  test('a single ask from the container is refused only when the last registration is scoped', () => {
    const scopedLast = Builder.useAddon(standardLifetime())
      .useAddon(validateScopes())
      .withServices(m => m.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton').add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped'))
      .build();
    const singletonLast = Builder.useAddon(standardLifetime())
      .useAddon(validateScopes())
      .withServices(m => m.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped').add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton'))
      .build();

    expect(() => scopedLast.resolve(COUNTER)).toThrow(ScopeValidationError);
    expect(singletonLast.resolve(COUNTER)).toBeInstanceOf(Counter);
  });

  test('a collection ask from the container is refused only where a scoped element is walked', () => {
    const provider = Builder.useAddon(standardLifetime())
      .useAddon(validateScopes())
      .withServices(m => m.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton').add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped'))
      .build();

    const elements = provider.resolveMany(COUNTER)[Symbol.iterator]();
    expect(elements.next().value).toBeInstanceOf(Counter);
    expect(() => elements.next()).toThrow(ScopeValidationError);
  });
});
