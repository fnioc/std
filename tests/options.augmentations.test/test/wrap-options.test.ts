// The explicit `addOptions(token, tToken)` verb (#34): register an IOptions<T>
// that WRAPS the already-bound T resolved from tToken. This is the complete,
// transformer-free form the `addOptions<T>()` sugar lowers to — exercised here
// through the public authoring surface with hand-written tokens (no transformer).

import '@rhombus-std/di';
import { DefaultManifest, type Manifest, Type } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface Widget {
  name: string;
}

const WIDGET_TOKEN = 'test:Widget';
const OPTIONS_TOKEN = '@rhombus-std/options:IOptions<test:Widget>';

describe('addOptions(token, tToken) — wrap the bound T', () => {
  test('resolving the wrapper delivers an IOptions<T> over the bound T', () => {
    let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    const widget: Widget = { name: 'gizmo' };

    services = services.addValue(WIDGET_TOKEN, widget);
    services = services.addOptions(OPTIONS_TOKEN, WIDGET_TOKEN);

    const provider = services.build().createScope('singleton');
    const options: IOptions<Widget> = provider.getRequiredService(Type.from(OPTIONS_TOKEN));

    // The wrapped value IS the instance bound at the element token.
    expect(options.value).toBe(widget);
    // A wrap carries no reload source, so it is a static snapshot.
    expect(options.subscribe).toBeUndefined();
  });

  test('wraps a class-produced T, injecting it from the element token', () => {
    class Engine {
      readonly kind = 'v8';
    }
    const ENGINE_TOKEN = 'test:Engine';
    const ENGINE_OPTIONS = '@rhombus-std/options:IOptions<test:Engine>';

    let services: Manifest<'singleton'> = new DefaultManifest<'singleton'>();
    // Explicit-token class registration (transformer-free): a zero-arg ctor.
    services = services.addClass(ENGINE_TOKEN, Engine, Type.ctor(Type.from(ENGINE_TOKEN)), 'singleton');
    services = services.addOptions(ENGINE_OPTIONS, ENGINE_TOKEN);

    const provider = services.build().createScope('singleton');
    const engine: Engine = provider.getRequiredService(Type.from(ENGINE_TOKEN));
    const options: IOptions<Engine> = provider.getRequiredService(Type.from(ENGINE_OPTIONS));

    expect(options.value).toBe(engine);
    expect(options.value.kind).toBe('v8');
  });
});
