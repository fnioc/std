// The one-argument `addOptions(tType)` verb: offer `IOptions<T>` whose value is
// whatever `T` itself resolves to. This is the complete, transformer-free form
// the `addOptions<T>()` sugar lowers to — exercised here through the public
// authoring surface with hand-written tokens (no transformer).

import '@rhombus-std/di';
import { DefaultManifest, type Manifest, Type } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import { optionsAddressType } from '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface Widget {
  name: string;
}

const WIDGET_TOKEN = 'test:Widget';

describe('addOptions(tType) — wrap the bound T', () => {
  test('resolving IOptions<T> delivers the bound T', () => {
    let services: Manifest<string> = new DefaultManifest<string>();
    const widget: Widget = { name: 'gizmo' };

    services = services.addValue(WIDGET_TOKEN, widget);
    services = services.addOptions(WIDGET_TOKEN);

    const provider = services.build();
    const options: IOptions<Widget> = provider.getRequiredService(optionsAddressType(Type.from(WIDGET_TOKEN)));

    // The value IS the instance bound at the options type.
    expect(options.value).toBe(widget);
    // No change-token source was registered, so this is a static snapshot.
    expect(options.subscribe).toBeUndefined();
  });

  test('wraps a class-produced T, injecting it from the options type', () => {
    class Engine {
      readonly kind = 'v8';
    }
    const ENGINE_TOKEN = 'test:Engine';

    let services: Manifest<string> = new DefaultManifest<string>();
    // Explicit-token class registration (transformer-free): a zero-arg ctor.
    services = services.addClass(ENGINE_TOKEN, Engine, Type.ctor(Type.from(ENGINE_TOKEN), [[]]), 'singleton');
    services = services.addOptions(ENGINE_TOKEN);

    const provider = services.build();
    const options: IOptions<Engine> = provider.getRequiredService(optionsAddressType(Type.from(ENGINE_TOKEN)));

    // The value is what the container built for the options type -- asserted by
    // construction rather than by instance identity, which belongs to the
    // lifetime model, not to this verb.
    expect(options.value).toBeInstanceOf(Engine);
    expect(options.value.kind).toBe('v8');
  });

  test('one open registration serves every options type independently', () => {
    const A_TOKEN = 'test:AOptions';
    const B_TOKEN = 'test:BOptions';

    let services: Manifest<string> = new DefaultManifest<string>();
    services = services.addOptions(A_TOKEN, () => ({ which: 'a' }));
    services = services.addOptions(B_TOKEN, () => ({ which: 'b' }));

    const provider = services.build();

    expect(provider.getRequiredService(optionsAddressType(Type.from(A_TOKEN))).value).toEqual({ which: 'a' });
    expect(provider.getRequiredService(optionsAddressType(Type.from(B_TOKEN))).value).toEqual({ which: 'b' });
  });

  test('a type nobody offered is not answered', () => {
    const services: Manifest<string> = new DefaultManifest<string>();
    const provider = services.build();

    // The open registration takes the base slot as a dependency, so a type with
    // no `addOptions` leaves it unlowerable rather than assembling an empty value.
    expect(provider.getService(optionsAddressType(Type.from('test:NeverOffered')))).toBeUndefined();
  });
});
