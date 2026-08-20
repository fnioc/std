// Behaviour tests for the describe dialect — the chain opened at `manifest.describe`, and the
// terse three-argument form that states a registration at once. The stage types are what stop
// most misuse at the call site; these cover what reaches runtime: the descriptor each form
// produces, that the two produce the same one, and the refusals a caller typing through `any`
// can still provoke.

import { ConstantType, DefaultManifest, type Manifest, ServiceDescriptor } from '@rhombus-std/di.core';
import '@rhombus-std/di';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

interface IClock {
  now(): string;
}

const CLOCK = Type.imported('IClock', 'app');
const SINK = Type.imported('ISink', 'app');

class FixedClock implements IClock {
  now(): string {
    return 'noon';
  }
}

class Sink {
  readonly clock: IClock;
  readonly environment: string;

  constructor(clock: IClock, environment: string) {
    this.clock = clock;
    this.environment = environment;
  }
}

function makeSink(clock: IClock): Sink {
  return new Sink(clock, 'from-factory');
}

/** A manifest holding nothing but the clock every case below leans on. */
function withClock(): Manifest<'singleton'> {
  return new DefaultManifest<'singleton'>().add(CLOCK, new FixedClock(), ConstantType);
}

describe('the impl doors', () => {
  test('asClass takes the constructor together with its type', () => {
    const services = withClock().add(
      withClock().describe(SINK).asClass(Sink, Type.ctor(SINK, [[CLOCK, Type.typeLiteral('staging')]])),
    );

    expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('staging');
  });

  test('asFactory takes the function together with its type', () => {
    const services = withClock().add(
      withClock().describe(SINK).asFactory(makeSink, Type.func(SINK, [[CLOCK]])),
    );

    expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('from-factory');
  });

  test('asValue takes only the value — it has no call shape to name', () => {
    const built = new Sink(new FixedClock(), 'prebuilt');
    const services = withClock().add(withClock().describe(SINK).asValue(built));

    expect(services.build().getRequiredService(SINK)).toBe(built);
  });

  test('parameter rows describe an overloaded implementation, one row per call signature', () => {
    const overloaded = Type.ctor({
      instance: SINK,
      args: [
        [Type.imported('IMissing', 'app'), Type.typeLiteral('unreachable')],
        [CLOCK, Type.typeLiteral('fallback')],
      ],
      abstract: false,
    });
    // The first row asks for a type nothing registers, so the second is the one the engine takes.
    const manifest = withClock();
    const services = manifest.add(manifest.describe(SINK).asClass(Sink, overloaded));

    expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('fallback');
  });
});

describe('the terse form', () => {
  test('states a constructed registration in one call, the node saying it is constructed', () => {
    const services = withClock()
      .add(SINK, Sink, Type.ctor(SINK, [[CLOCK, Type.typeLiteral('terse')]]), 'singleton');

    expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('terse');
  });

  test('a function type names a factory instead, from the same argument position', () => {
    const services = withClock().add(SINK, makeSink, Type.func(SINK, [[CLOCK]]));

    expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('from-factory');
  });

  test('the constant marker names a value, handed back as it stands', () => {
    const built = new Sink(new FixedClock(), 'as-value');
    const services = withClock().add(SINK, built, ConstantType);

    expect(services.build().getRequiredService(SINK)).toBe(built);
  });

  test('a callable under the constant marker is handed back, never called', () => {
    const services = withClock().add(SINK, makeSink, ConstantType);

    expect(services.build().getRequiredService(SINK)).toBe(makeSink);
  });

  test('a tagged address keys the registration, so a keyed registration is one call too', () => {
    const services = withClock()
      .add(Type.tag(SINK, 'primary'), Sink, Type.ctor(SINK, [[CLOCK, Type.typeLiteral('keyed')]]), 'singleton');
    const [filed] = [...services];

    expect(filed!.serviceType).toBe(Type.tag(SINK, 'primary'));
  });

  test('files the same descriptor the chain does', () => {
    const manifest = withClock();
    const walked = manifest.add(
      manifest.describe(SINK)
        .asClass(Sink, Type.ctor(SINK, [[CLOCK, Type.typeLiteral('same')]]))
        .withLifetime('singleton').taggedAs('primary'),
    );
    const stated = withClock()
      .add(Type.tag(SINK, 'primary'), Sink, Type.ctor(SINK, [[CLOCK, Type.typeLiteral('same')]]), 'singleton');

    expect(ServiceDescriptor.equals([...stated][0]!, [...walked][0]!)).toBe(true);
  });
});

describe('the chain terminal is a descriptor', () => {
  test('a door taken IS the descriptor — held in a variable, registered later', () => {
    const manifest = withClock();
    const descriptor = manifest.describe(SINK)
      .asClass(Sink, Type.ctor(SINK, [[CLOCK, Type.typeLiteral('held')]]));

    expect(descriptor.kind).toBe('ctor');
    expect(descriptor.serviceType).toBe(SINK);

    const services = manifest.add(descriptor);
    expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('held');
  });

  test('the chain steps spread away — a copied descriptor is plain data', () => {
    const manifest = withClock();
    const descriptor = manifest.describe(SINK)
      .asClass(Sink, Type.ctor(SINK, [[CLOCK, Type.typeLiteral('plain')]]));

    expect(Object.keys({ ...descriptor })).not.toContain('withLifetime');
    expect(Object.keys({ ...descriptor })).not.toContain('taggedAs');
  });
});

describe('lifetime and tag', () => {
  test('commute — either order files the same registration', () => {
    const manifest = withClock();
    const ctorType = Type.ctor(SINK, [[CLOCK, Type.typeLiteral('staging')]]);
    const tagFirst = manifest.add(
      manifest.describe(SINK).taggedAs('primary').withLifetime('singleton').asClass(Sink, ctorType),
    );
    const lifetimeFirst = manifest.add(
      manifest.describe(SINK).withLifetime('singleton').taggedAs('primary').asClass(Sink, ctorType),
    );

    const tagged = [...tagFirst][0]!;
    const other = [...lifetimeFirst][0]!;
    expect(tagged.serviceType).toBe(Type.tag(SINK, 'primary'));
    expect(other.serviceType).toBe(tagged.serviceType);
    expect(tagged.kind === 'ctor' && tagged.scope).toBe('singleton');
    expect(other.kind === 'ctor' && other.scope).toBe('singleton');
  });

  test('refine after the door too — the descriptor rebuilds instead of mutating', () => {
    const manifest = withClock();
    const bare = manifest.describe(SINK).asClass(Sink, Type.ctor(SINK, [[CLOCK, Type.typeLiteral('x')]]));
    const scoped = bare.withLifetime('singleton');

    expect(bare.scope).toBeUndefined();
    expect(scoped.scope).toBe('singleton');
  });

  test('a tag on a type that already carries one is refused', () => {
    const manifest = withClock();
    expect(() =>
      manifest.describe(Type.tag(SINK, 'primary')).taggedAs('secondary')
        .asClass(Sink, Type.ctor(SINK, [[CLOCK, Type.typeLiteral('staging')]]))
    ).toThrow(/already carries a tag/);
  });
});

test('a node with no door taken is not a registration', () => {
  const manifest = withClock();
  expect(() => manifest.add(manifest.describe(SINK) as any)).toThrow();
});

test('a discarded step configures nothing', () => {
  const manifest = withClock();
  const configured = manifest.describe(SINK)
    .asClass(Sink, Type.ctor(SINK, [[CLOCK, Type.typeLiteral('kept')]]));
  // The dropped result would have tagged the registration; the kept one never saw it.
  configured.taggedAs('dropped');
  const services = manifest.add(configured);

  const [filed] = [...services];
  expect(filed!.serviceType).toBe(SINK);
  expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('kept');
});
