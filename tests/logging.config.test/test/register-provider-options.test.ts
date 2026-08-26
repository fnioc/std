// End-to-end: `LoggerProviderOptions.getProviderOptionsManifest` — a provider
// package's options type binds from ITS configuration section (chained across
// every `addConfig`'d configuration by the provider-configuration
// factory), lazily and reload-reactively, through the standard
// `addOptions(optionsType, makeBase)` assembly.
//
// The whole chain is exercised through DI: the step
// classes are constructed lazily by the container (their dep is the CLOSED
// `ILoggerProviderConfig<TProvider>` resolved through the open
// template), so nothing touches configuration until `IOptions<T>` materializes.

import { ConfigBuilder, type IConfigRoot } from '@rhombus-std/config';
import { di, noop } from '@rhombus-std/di';
import { Manifest, Type } from '@rhombus-std/di.core';
import { LoggingBuilder } from '@rhombus-std/logging';
import { LoggerProviderOptions } from '@rhombus-std/logging.config';
import type { IOptions } from '@rhombus-std/options';
import { getConfigureManifest, optionsAddressType } from '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface FakeProviderOptions {
  Format: string;
  MaxDepth?: string;
}

const OPTIONS_TYPE: Type = Type.from('test:FakeProviderOptions');
const FAKE_PROVIDER_TYPE: Type = Type.from('test:FakeProvider');
const OPTIONS_ACCESSOR_TYPE = optionsAddressType(OPTIONS_TYPE);

function rootWith(data: Record<string, string>): IConfigRoot {
  return new ConfigBuilder().addInMemoryCollection(data).build() as unknown as IConfigRoot;
}

describe('LoggerProviderOptions.getProviderOptionsManifest', () => {
  test("binds the provider's section into the options assembly for the type", () => {
    const config = rootWith({ 'FakeProvider:Format': 'json', 'FakeProvider:MaxDepth': '3', 'OtherProvider:Format': 'xml' });

    const logging = new LoggingBuilder(Manifest.empty<unknown>());
    logging.addConfig(config);
    let services = logging.services;
    services = services.addOptions(OPTIONS_TYPE, () => ({ Format: 'text' }));
    services = services.addMany(LoggerProviderOptions.getProviderOptionsManifest(OPTIONS_TYPE, FAKE_PROVIDER_TYPE));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const options: IOptions<FakeProviderOptions> = provider.resolve(OPTIONS_ACCESSOR_TYPE);

    // Only FakeProvider's section binds; the configure step deep-merges onto
    // the makeBase value.
    expect(options.value).toEqual({ Format: 'json', MaxDepth: '3' });
  });

  test('a reload re-binds and notifies subscribers (the change-token source)', () => {
    const config = rootWith({ 'FakeProvider:Format': 'json' });

    const logging = new LoggingBuilder(Manifest.empty<unknown>());
    logging.addConfig(config);
    let services = logging.services;
    services = services.addOptions(OPTIONS_TYPE, () => ({ Format: 'text' }));
    services = services.addMany(LoggerProviderOptions.getProviderOptionsManifest(OPTIONS_TYPE, FAKE_PROVIDER_TYPE));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const options: IOptions<FakeProviderOptions> = provider.resolve(OPTIONS_ACCESSOR_TYPE);
    expect(options.value.Format).toBe('json');

    const seen: FakeProviderOptions[] = [];
    const registration = options.subscribe!((value) => seen.push(value));

    config.set('FakeProvider:Format', 'text');
    config.reload();

    expect(seen).toEqual([{ Format: 'text' }]);
    expect(options.value.Format).toBe('text');

    registration[Symbol.dispose]();
  });

  test("composes with a consumer's own configure step for the same token", () => {
    const config = rootWith({ 'FakeProvider:Format': 'json' });

    const logging = new LoggingBuilder(Manifest.empty<unknown>());
    logging.addConfig(config);
    let services = logging.services;
    services = services.addOptions(OPTIONS_TYPE, () => ({ Format: 'text' }));
    services = services.addMany(LoggerProviderOptions.getProviderOptionsManifest(OPTIONS_TYPE, FAKE_PROVIDER_TYPE));
    // One more configure source in the SAME pipeline, running after the provider bind.
    services = services.addMany(getConfigureManifest(OPTIONS_TYPE, (value: FakeProviderOptions) => {
      value.MaxDepth = '9';
    }));

    const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
    const options: IOptions<FakeProviderOptions> = provider.resolve(OPTIONS_ACCESSOR_TYPE);

    expect(options.value).toEqual({ Format: 'json', MaxDepth: '9' });
  });
});
