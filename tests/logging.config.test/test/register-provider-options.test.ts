// End-to-end: `LoggerProviderOptions.registerProviderOptions` — a provider
// package's options type binds from ITS configuration section (chained across
// every `addConfiguration`'d configuration by the provider-configuration
// factory), lazily and reload-reactively, through the standard
// `addOptions(token, makeBase)` assembly.
//
// The whole chain the reference wires through DI is exercised: the step
// classes are constructed lazily by the container (their dep is the CLOSED
// `ILoggerProviderConfig<TProvider>` resolved through the open
// template), so nothing touches configuration until `IOptions<T>` materializes.

import { ConfigBuilder, type IConfigRoot } from '@rhombus-std/config';
import { ServiceManifest } from '@rhombus-std/di';
import { LoggingBuilder } from '@rhombus-std/logging';
import { LoggerProviderOptions } from '@rhombus-std/logging.config';
import type { IOptions } from '@rhombus-std/options';
import '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

interface FakeProviderOptions {
  Format: string;
  MaxDepth?: string;
}

const OPTIONS_TOKEN = 'test:FakeProviderOptions';
const FAKE_PROVIDER_TOKEN = 'test:FakeProvider';

function rootWith(data: Record<string, string>): IConfigRoot {
  return new ConfigBuilder().addInMemoryCollection(data).build() as unknown as IConfigRoot;
}

describe('LoggerProviderOptions.registerProviderOptions', () => {
  test("binds the provider's section into the options assembly for the token", () => {
    const config = rootWith({
      'FakeProvider:Format': 'json',
      'FakeProvider:MaxDepth': '3',
      'OtherProvider:Format': 'xml',
    });

    const services = new ServiceManifest<'singleton'>();
    new LoggingBuilder(services).addConfiguration(config);
    services.addOptions<FakeProviderOptions>(OPTIONS_TOKEN, () => ({ Format: 'text' })).as('singleton');
    LoggerProviderOptions.registerProviderOptions(services, OPTIONS_TOKEN, FAKE_PROVIDER_TOKEN);

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<FakeProviderOptions>>(OPTIONS_TOKEN);

    // Only FakeProvider's section binds; the configure step deep-merges onto
    // the makeBase value.
    expect(options.value).toEqual({ Format: 'json', MaxDepth: '3' });
  });

  test('a reload re-binds and notifies subscribers (the change-token source)', () => {
    const config = rootWith({ 'FakeProvider:Format': 'json' });

    const services = new ServiceManifest<'singleton'>();
    new LoggingBuilder(services).addConfiguration(config);
    services.addOptions<FakeProviderOptions>(OPTIONS_TOKEN, () => ({ Format: 'text' })).as('singleton');
    LoggerProviderOptions.registerProviderOptions(services, OPTIONS_TOKEN, FAKE_PROVIDER_TOKEN);

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<FakeProviderOptions>>(OPTIONS_TOKEN);
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

    const services = new ServiceManifest<'singleton'>();
    new LoggingBuilder(services).addConfiguration(config);
    services.addOptions<FakeProviderOptions>(OPTIONS_TOKEN, () => ({ Format: 'text' })).as('singleton');
    LoggerProviderOptions.registerProviderOptions(services, OPTIONS_TOKEN, FAKE_PROVIDER_TOKEN);
    // The reference's services.Configure<TOptions>(delegate) analog: one more
    // configure source in the SAME pipeline, running after the provider bind.
    services.configure<FakeProviderOptions>(OPTIONS_TOKEN, (value) => {
      value.MaxDepth = '9';
    });

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<IOptions<FakeProviderOptions>>(OPTIONS_TOKEN);

    expect(options.value).toEqual({ Format: 'json', MaxDepth: '9' });
  });
});
