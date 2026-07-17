// End-to-end: the no-arg `addConfig()` provider-configuration services —
// `ILoggerProviderConfigFactory` chaining every registered
// `LoggingConfig`'s provider-named section, and the open-generic
// `ILoggerProviderConfig<$1>` registration closing per provider type.
//
// Tokens are the hand-written literals a no-transformer consumer writes
// (`"<declaring-package>:<TypeName>"` and its closed-generic form).

import { ConfigBuilder, type IConfigRoot } from '@rhombus-std/config';
import { ServiceManifest } from '@rhombus-std/di';
import { LoggingBuilder } from '@rhombus-std/logging';
import { type ILoggerProviderConfig, type ILoggerProviderConfigFactory,
  loggerProviderConfigToken } from '@rhombus-std/logging.config';
import { describe, expect, test } from 'bun:test';

const FACTORY_TOKEN = '@rhombus-std/logging.config:ILoggerProviderConfigFactory';
const FAKE_PROVIDER_TOKEN = 'test:FakeProvider';

function rootWith(data: Record<string, string>): IConfigRoot {
  return new ConfigBuilder().addInMemoryCollection(data).build() as unknown as IConfigRoot;
}

describe('addConfig() — provider-configuration services', () => {
  test('loggerProviderConfigToken derives the closed-generic token', () => {
    expect(loggerProviderConfigToken(FAKE_PROVIDER_TOKEN)).toBe(
      '@rhombus-std/logging.config:ILoggerProviderConfig<test:FakeProvider>',
    );
  });

  test('the factory chains the provider-named section of every registered configuration', () => {
    const services = new ServiceManifest<'singleton'>();
    const builder = new LoggingBuilder(services);
    builder.addConfig(rootWith({
      'FakeProvider:Format': 'json',
      'FakeProvider:MaxDepth': '3',
    }));
    builder.addConfig(rootWith({
      'FakeProvider:Format': 'text', // later configuration wins on conflict
      'OtherProvider:Format': 'xml', // other providers' sections are invisible
    }));

    const provider = services.build().createScope('singleton');
    const factory = provider.resolve<ILoggerProviderConfigFactory>(FACTORY_TOKEN);
    const config = factory.getConfig(FAKE_PROVIDER_TOKEN);

    expect(config.get('Format')).toBe('text');
    expect(config.get('MaxDepth')).toBe('3');

    const other = factory.getConfig('test:MissingProvider');
    expect(other.get('Format')).toBeUndefined();
  });

  test('the chained provider configuration is LIVE across a reload', () => {
    const config = rootWith({ 'FakeProvider:Format': 'json' });
    const services = new ServiceManifest<'singleton'>();
    new LoggingBuilder(services).addConfig(config);

    const provider = services.build().createScope('singleton');
    const factory = provider.resolve<ILoggerProviderConfigFactory>(FACTORY_TOKEN);
    const config = factory.getConfig(FAKE_PROVIDER_TOKEN);
    expect(config.get('Format')).toBe('json');

    let fired = false;
    config.getReloadToken().registerChangeCallback(() => {
      fired = true;
    });
    config.set('FakeProvider:Format', 'text');
    config.reload();

    expect(config.get('Format')).toBe('text');
    expect(fired).toBe(true);
  });

  test('the open ILoggerProviderConfig<$1> registration closes per provider', () => {
    const services = new ServiceManifest<'singleton'>();
    new LoggingBuilder(services).addConfig(rootWith({ 'FakeProvider:Format': 'json' }));

    const provider = services.build().createScope('singleton');
    const token = loggerProviderConfigToken(FAKE_PROVIDER_TOKEN);
    const providerConfig = provider.resolve<ILoggerProviderConfig<unknown>>(token);

    expect(providerConfig.config.get('Format')).toBe('json');
    // Singleton-tagged: the closing caches per closed token.
    expect(provider.resolve<ILoggerProviderConfig<unknown>>(token)).toBe(providerConfig);
  });

  test('the no-arg method form registers the services without a filter pipeline', () => {
    const services = new ServiceManifest<'singleton'>();
    new LoggingBuilder(services).addConfig();

    const provider = services.build().createScope('singleton');
    const factory = provider.resolve<ILoggerProviderConfigFactory>(FACTORY_TOKEN);
    // No LoggingConfig registered yet: every provider section is empty.
    expect(factory.getConfig(FAKE_PROVIDER_TOKEN).get('Format')).toBeUndefined();
  });
});
