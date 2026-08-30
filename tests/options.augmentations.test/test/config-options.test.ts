// End-to-end: bind a configuration section into an IOptions<T>, resolve it from
// the container, and observe reactivity across a reload -- the config -> Options
// bridge (#40) exercised through its public authoring surface only.

import { ConfigBuilder, type IConfigRoot } from '@rhombus-std/config';
import { di, noop } from '@rhombus-std/di';
import { Manifest } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import { getConfigureManifest, optionsAddressType } from '@rhombus-std/options.augmentations';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

interface WidgetOptions {
  Url: string;
  Retries?: string;
}

const WIDGET_OPTIONS_TYPE: Type = Type.from('test:WidgetOptions');

function rootWith(data: Record<string, string>): IConfigRoot {
  // build() is typed to the index-navigable Section (the coercion seam); the
  // runtime object IS the ConfigRoot, so cast to reach reload()/set().
  return new ConfigBuilder().addInMemoryCollection(data).build() as unknown as IConfigRoot;
}

describe('configure — section-to-options binding', () => {
  test("resolving IOptions<T> binds the section's values into the base", () => {
    const config = rootWith({ 'Widget:Url': 'http://first', 'Widget:Retries': '3' });

    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.addOptions(WIDGET_OPTIONS_TYPE, () => ({ Url: '' }));
    services = services.add(getConfigureManifest(WIDGET_OPTIONS_TYPE, config.getSection('Widget')));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const options: IOptions<WidgetOptions> = provider.resolve(optionsAddressType(WIDGET_OPTIONS_TYPE));

    expect(options.value).toEqual({ Url: 'http://first', Retries: '3' });
  });

  test('a reload delivers a fresh value and fires subscribe with it', () => {
    const config = rootWith({ 'Widget:Url': 'http://first' });

    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.addOptions(WIDGET_OPTIONS_TYPE, () => ({ Url: '' }));
    services = services.add(getConfigureManifest(WIDGET_OPTIONS_TYPE, config.getSection('Widget')));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const options: IOptions<WidgetOptions> = provider.resolve(optionsAddressType(WIDGET_OPTIONS_TYPE));

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
    const config = rootWith({ 'Widget:Url': 'http://a', 'Extra:Retries': '5' });

    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.addOptions(WIDGET_OPTIONS_TYPE, () => ({ Url: '' }));
    services = services.add(getConfigureManifest(WIDGET_OPTIONS_TYPE, config.getSection('Widget')));
    services = services.add(getConfigureManifest(WIDGET_OPTIONS_TYPE, config.getSection('Extra')));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const options: IOptions<WidgetOptions> = provider.resolve(optionsAddressType(WIDGET_OPTIONS_TYPE));

    expect(options.value).toEqual({ Url: 'http://a', Retries: '5' });
  });
});

describe('addOptions — no configured source', () => {
  test('delivers a static snapshot (value from makeBase, no subscribe)', () => {
    let services: Manifest<unknown> = Manifest.empty<unknown>();
    services = services.addOptions(WIDGET_OPTIONS_TYPE, () => ({ Url: 'default' }));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const options: IOptions<WidgetOptions> = provider.resolve(optionsAddressType(WIDGET_OPTIONS_TYPE));

    expect(options.value).toEqual({ Url: 'default' });
    expect(options.subscribe).toBeUndefined();
  });
});
