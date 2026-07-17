// The explicit `addOptions(token, tToken)` verb (#34): register an IOptions<T>
// that WRAPS the already-bound T resolved from tToken. This is the complete,
// transformer-free form the `addOptions<T>()` sugar lowers to — exercised here
// through the public authoring surface with hand-written tokens (no transformer).

import { ServiceManifest } from '@rhombus-std/di';
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
    const services = new ServiceManifest<'singleton'>();
    const widget: Widget = { name: 'gizmo' };

    services.addValue(WIDGET_TOKEN, widget);
    services.addOptions(OPTIONS_TOKEN, WIDGET_TOKEN).as('singleton');

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<Widget>>(OPTIONS_TOKEN);

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

    const services = new ServiceManifest<'singleton'>();
    // Explicit-token class registration (transformer-free): a zero-arg ctor.
    services.add(ENGINE_TOKEN, Engine).as('singleton');
    services.addOptions(ENGINE_OPTIONS, ENGINE_TOKEN).as('singleton');

    const provider = services.build().createScope('singleton');
    const engine = provider.resolve<Engine>(ENGINE_TOKEN);
    const options = provider.resolve<IOptions<Engine>>(ENGINE_OPTIONS);

    expect(options.value).toBe(engine);
    expect(options.value.kind).toBe('v8');
  });
});
