// Behaviour tests for the configure dialect — the lambda that walks a registration's steps, and
// the terse form that states them at once. The stage types are what stop most misuse at the call
// site; these cover what reaches runtime: the descriptor each form produces, that the two produce
// the same one, and the refusals a caller typing through `any` can still provoke.

import { DefaultManifest, type Manifest, ServiceDescriptor } from '@rhombus-std/di.core';
import '@rhombus-std/di';
import { type IntersectionType, Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

interface IClock {
  now(): string;
}

const CLOCK = Type.named('IClock', 'app');
const SINK = Type.named('ISink', 'app');

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
  return new DefaultManifest<'singleton'>().addValue(CLOCK, new FixedClock());
}

describe('the impl doors', () => {
  test('asClass takes the constructor its signature names', () => {
    const services = withClock()
      .add<Sink>(SINK, sink => sink.asClass(Sink).withSignature(CLOCK, Type.typeLiteral('staging')));

    expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('staging');
  });

  test('asFactory takes the function its signature names', () => {
    const services = withClock().add<Sink>(SINK, sink => sink.asFactory(makeSink).withSignature(CLOCK));

    expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('from-factory');
  });

  test('asValue completes on its own — a value has no call shape to name', () => {
    const built = new Sink(new FixedClock(), 'prebuilt');
    const services = withClock().add<Sink>(SINK, sink => sink.asValue(built));

    expect(services.build().getRequiredService(SINK)).toBe(built);
  });
});

describe('withType', () => {
  test('takes the whole composed type in place of a bare argument list', () => {
    const services = withClock()
      .add<Sink>(SINK, sink => sink.asClass(Sink).withType(Type.ctor(SINK, CLOCK, Type.typeLiteral('composed'))));

    expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('composed');
  });

  test('an intersection describes an overloaded implementation, one call signature per member', () => {
    // `Type.intersection` returns a lone surviving member as itself, so its declared return is the
    // whole of `Type`; a caller naming a genuine intersection says so.
    const overloaded = Type.intersection(
      Type.ctor(SINK, Type.named('IMissing', 'app'), Type.typeLiteral('unreachable')),
      Type.ctor(SINK, CLOCK, Type.typeLiteral('fallback')),
    ) as IntersectionType;
    // The first member asks for a type nothing registers, so the second is the one that lowers.
    const services = withClock().add<Sink>(SINK, sink => sink.asClass(Sink).withType(overloaded));

    expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('fallback');
  });

  test('refuses a type that describes nothing callable', () => {
    expect(() => withClock().add<Sink>(SINK, sink => (sink.asClass(Sink) as any).withType(CLOCK)))
      .toThrow(/describes nothing callable/);
  });
});

describe('the terse form', () => {
  test('states a constructed registration in one call, the node saying it is constructed', () => {
    const services = withClock()
      .add<Sink>(SINK, Sink, Type.ctor(SINK, CLOCK, Type.typeLiteral('terse')), 'singleton');

    expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('terse');
  });

  test('a function type names a factory instead, from the same argument position', () => {
    const services = withClock().add<Sink>(SINK, makeSink, Type.func(SINK, CLOCK));

    expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('from-factory');
  });

  test('carries the tag through, so a keyed registration is one call too', () => {
    const services = withClock()
      .add<Sink>(SINK, Sink, Type.ctor(SINK, CLOCK, Type.typeLiteral('keyed')), 'singleton', 'primary');
    const [filed] = [...services];

    expect(filed!.serviceType).toBe(Type.tag(SINK, 'primary'));
  });

  test('files the same descriptor the walk does', () => {
    const walked = withClock().add<Sink>(SINK,
      sink =>
        sink.asClass(Sink).withType(Type.ctor(SINK, CLOCK, Type.typeLiteral('same')))
          .withLifetime('singleton').taggedAs('primary'));
    const stated = withClock()
      .add<Sink>(SINK, Sink, Type.ctor(SINK, CLOCK, Type.typeLiteral('same')), 'singleton', 'primary');

    expect(ServiceDescriptor.equals([...stated][0]!, [...walked][0]!)).toBe(true);
  });

  test('refuses a node that describes nothing callable', () => {
    expect(() => withClock().add<Sink>(SINK, Sink, CLOCK as any)).toThrow(/describes nothing callable/);
  });

  test('refuses an overload set that is called both ways at once', () => {
    const mixed = Type.intersection(Type.ctor(SINK, CLOCK), Type.func(SINK, CLOCK)) as IntersectionType;

    expect(() => withClock().add<Sink>(SINK, Sink, mixed)).toThrow(/mixes constructor and function signatures/);
  });
});

describe('the shape slot is spent once', () => {
  test('withSignature after withType is refused', () => {
    expect(() =>
      withClock().add<Sink>(SINK, sink =>
        (sink.asClass(Sink).withType(Type.ctor(SINK, CLOCK, Type.typeLiteral('first'))) as any)
          .withSignature(CLOCK, Type.typeLiteral('second')))
    ).toThrow(/already named by withType/);
  });

  test('withSignature twice is refused', () => {
    expect(() =>
      withClock().add<Sink>(SINK, sink =>
        (sink.asClass(Sink).withSignature(CLOCK, Type.typeLiteral('first')) as any)
          .withSignature(CLOCK, Type.typeLiteral('second')))
    ).toThrow(/already named by withSignature/);
  });
});

describe('lifetime and tag', () => {
  test('commute — either order files the same registration', () => {
    const tagFirst = withClock()
      .add<Sink>(SINK, sink =>
        sink.taggedAs('primary').withLifetime('singleton').asClass(Sink)
          .withSignature(CLOCK, Type.typeLiteral('staging')));
    const lifetimeFirst = withClock()
      .add<Sink>(SINK, sink =>
        sink.withLifetime('singleton').taggedAs('primary').asClass(Sink)
          .withSignature(CLOCK, Type.typeLiteral('staging')));

    const tagged = [...tagFirst][0]!;
    const other = [...lifetimeFirst][0]!;
    expect(tagged.serviceType).toBe(Type.tag(SINK, 'primary'));
    expect(other.serviceType).toBe(tagged.serviceType);
    expect(tagged.kind === 'ctor' && tagged.scope).toBe('singleton');
    expect(other.kind === 'ctor' && other.scope).toBe('singleton');
  });

  test('a tag on a type that already carries one is refused', () => {
    expect(() =>
      withClock().add<Sink>(Type.tag(SINK, 'primary'), sink =>
        sink.taggedAs('secondary').asClass(Sink).withSignature(CLOCK, Type.typeLiteral('staging')))
    ).toThrow(/already carries a tag/);
  });
});

describe('an incomplete walk', () => {
  test('is refused when no implementation was chosen', () => {
    expect(() => withClock().add<Sink>(SINK, sink => (sink as any).withLifetime('singleton')))
      .toThrow(/no implementation was chosen/);
  });

  test('is refused when no call shape was named', () => {
    expect(() => withClock().add<Sink>(SINK, sink => (sink.asClass(Sink) as any)))
      .toThrow(/no call shape was named/);
  });
});

test('a discarded step configures nothing', () => {
  const services = withClock().add<Sink>(SINK, sink => {
    const configured = sink.asClass(Sink).withSignature(CLOCK, Type.typeLiteral('kept'));
    // The dropped result would have tagged the registration; the returned one never saw it.
    configured.taggedAs('dropped');
    return configured;
  });

  expect((services.build().getRequiredService(SINK) as Sink).environment).toBe('kept');
});
