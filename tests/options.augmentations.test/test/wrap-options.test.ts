// The one-argument `addOptions(optionsType)` verb: offer `IOptions<T>` whose
// value is whatever `T` itself resolves to. This is the complete, explicit form
// the `addOptions<T>()` sugar lowers to — exercised here through the public
// authoring surface with hand-written type nodes.

import { di } from '@rhombus-std/di';
import { DefaultManifest, LifetimeModel, type Manifest, Type } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import { optionsAddressType } from '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface Widget {
  name: string;
}

const WIDGET_TYPE: Type = Type.from('test:Widget');

describe('addOptions(optionsType) — wrap the bound T', () => {
  test('resolving IOptions<T> delivers the bound T', () => {
    let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    const widget: Widget = { name: 'gizmo' };

    services = services.addValue(WIDGET_TYPE, widget);
    services = services.addOptions(WIDGET_TYPE);

    const provider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build();
    const options: IOptions<Widget> = provider.resolve(optionsAddressType(WIDGET_TYPE));

    // The value IS the instance bound at the options type.
    expect(options.value).toBe(widget);
    // No change-token source was registered, so this is a static snapshot.
    expect(options.subscribe).toBeUndefined();
  });

  test('wraps a class-produced T, injecting it from the options type', () => {
    class Engine {
      readonly kind = 'v8';
    }
    const ENGINE_TYPE: Type = Type.from('test:Engine');

    let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    // Explicit-type class registration: a zero-arg ctor.
    services = services.add(ENGINE_TYPE, Engine, Type.ctor(ENGINE_TYPE, [[]]), 'singleton');
    services = services.addOptions(ENGINE_TYPE);

    const provider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build();
    const options: IOptions<Engine> = provider.resolve(optionsAddressType(ENGINE_TYPE));

    // The value is what the container built for the options type -- asserted by
    // construction rather than by instance identity, which belongs to the
    // lifetime model, not to this verb.
    expect(options.value).toBeInstanceOf(Engine);
    expect(options.value.kind).toBe('v8');
  });

  test('one open registration serves every options type independently', () => {
    const A_TYPE: Type = Type.from('test:AOptions');
    const B_TYPE: Type = Type.from('test:BOptions');

    let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    services = services.addOptions(A_TYPE, () => ({ which: 'a' }));
    services = services.addOptions(B_TYPE, () => ({ which: 'b' }));

    const provider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build();

    expect(provider.resolve(optionsAddressType(A_TYPE)).value).toEqual({ which: 'a' });
    expect(provider.resolve(optionsAddressType(B_TYPE)).value).toEqual({ which: 'b' });
  });

  test('a type nobody offered is not answered', () => {
    const services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    const provider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(services).build();

    // The open registration takes the base slot as a dependency, so a type with
    // no `addOptions` leaves it unlowerable rather than assembling an empty value.
    expect(provider.resolve(Type.union(optionsAddressType(Type.from('test:NeverOffered')), Type.typeLiteral(undefined)))).toBeUndefined();
  });
});
