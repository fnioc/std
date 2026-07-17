// End-to-end: bind a configuration section into an IOptions<T>, resolve it from
// the container, and observe reactivity across a reload -- the config -> Options
// bridge (#40) exercised through its public authoring surface only.

import { ConfigBuilder, type IConfigRoot } from '@rhombus-std/config';
import { ServiceManifest } from '@rhombus-std/di';
import type { IOptions } from '@rhombus-std/options';
import '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface WidgetOptions {
  Url: string;
  Retries?: string;
}

const TOKEN = 'test:WidgetOptions';

function rootWith(data: Record<string, string>): IConfigRoot {
  // build() is typed to the index-navigable Section (the coercion seam); the
  // runtime object IS the ConfigRoot, so cast to reach reload()/set().
  return new ConfigBuilder().addInMemoryCollection(data).build() as unknown as IConfigRoot;
}

describe('configure — section-to-options binding', () => {
  test("resolving IOptions<T> binds the section's values into the base", () => {
    const config = rootWith({ 'Widget:Url': 'http://first', 'Widget:Retries': '3' });

    const services = new ServiceManifest<'singleton'>();
    services.addOptions<WidgetOptions>(TOKEN, () => ({ Url: '' })).as('singleton');
    services.configure(TOKEN, config.getSection('Widget'));

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<WidgetOptions>>(TOKEN);

    expect(options.value).toEqual({ Url: 'http://first', Retries: '3' });
  });

  test('a reload delivers a fresh value and fires subscribe with it', () => {
    const config = rootWith({ 'Widget:Url': 'http://first' });

    const services = new ServiceManifest<'singleton'>();
    services.addOptions<WidgetOptions>(TOKEN, () => ({ Url: '' })).as('singleton');
    services.configure(TOKEN, config.getSection('Widget'));

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<WidgetOptions>>(TOKEN);

    const seen: WidgetOptions[] = [];
    const registration = options.subscribe!((value) => seen.push(value));

    // Mutate the memory source and reload -- the section's reload token fires
    // the root token the change-token source hands the reactive Options.
    config.set('Widget:Url', 'http://second');
    config.reload();

    expect(seen).toEqual([{ Url: 'http://second' }]);
    expect(options.value).toEqual({ Url: 'http://second' });

    registration[Symbol.dispose]();

    // After disposal the listener no longer fires.
    config.set('Widget:Url', 'http://third');
    config.reload();
    expect(seen).toHaveLength(1);
    expect(options.value).toEqual({ Url: 'http://third' });
  });

  test('two configure calls deep-merge their sections into one value', () => {
    const config = rootWith({
      'Widget:Url': 'http://a',
      'Extra:Retries': '5',
    });

    const services = new ServiceManifest<'singleton'>();
    services.addOptions<WidgetOptions>(TOKEN, () => ({ Url: '' })).as('singleton');
    services.configure(TOKEN, config.getSection('Widget'));
    services.configure(TOKEN, config.getSection('Extra'));

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<WidgetOptions>>(TOKEN);

    expect(options.value).toEqual({ Url: 'http://a', Retries: '5' });
  });
});

describe('addOptions — no configured source', () => {
  test('delivers a static snapshot (value from makeBase, no subscribe)', () => {
    const services = new ServiceManifest<'singleton'>();
    services.addOptions<WidgetOptions>(TOKEN, () => ({ Url: 'default' })).as('singleton');

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<WidgetOptions>>(TOKEN);

    expect(options.value).toEqual({ Url: 'default' });
    expect(options.subscribe).toBeUndefined();
  });
});
