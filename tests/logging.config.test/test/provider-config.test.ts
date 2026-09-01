// End-to-end: the no-arg `addConfig()` provider-configuration services —
// `ILoggerProviderConfigFactory` chaining every registered
// `LoggingConfig`'s provider-named section, and the open-generic
// `ILoggerProviderConfig<$1>` registration closing per provider type.
//
// Types are the hand-written literals a no-transformer consumer writes
// (`"<declaring-package>:<TypeName>"` and its closed-generic form).

import { ConfigBuilder, type IConfigRoot } from '@rhombus-std/config';
import { di, noopLifetimeAddon } from '@rhombus-std/di';
import { Manifest } from '@rhombus-std/di.core';
import { LoggingBuilder } from '@rhombus-std/logging';
import { type ILoggerProviderConfig, type ILoggerProviderConfigFactory, loggerProviderConfigType } from '@rhombus-std/logging.config';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const FACTORY_TYPE: Type = Type.from('@rhombus-std/logging.config:ILoggerProviderConfigFactory');
const FAKE_PROVIDER_TYPE: Type = Type.from('test:FakeProvider');

function rootWith(data: Record<string, string>): IConfigRoot {
  return new ConfigBuilder().addInMemoryCollection(data).build() as unknown as IConfigRoot;
}

describe('addConfig() — provider-configuration services', () => {
  test('loggerProviderConfigType derives the closed-generic type', () => {
    expect(Type.stringify(loggerProviderConfigType(FAKE_PROVIDER_TYPE))).toBe(
      '@rhombus-std/logging.config:ILoggerProviderConfig<test:FakeProvider>',
    );
  });

  test('the factory chains the provider-named section of every registered configuration', () => {
    // The chain is immutable, so build the manifest the BUILDER holds after
    // both addConfig calls — not the one it was constructed with.
    const builder = new LoggingBuilder(Manifest.empty<unknown>());
    builder.addConfig(rootWith({ 'FakeProvider:Format': 'json', 'FakeProvider:MaxDepth': '3' }));
    builder.addConfig(rootWith({
      'FakeProvider:Format': 'text', // later configuration wins on conflict
      'OtherProvider:Format': 'xml', // other providers' sections are invisible
    }));

    const provider = di.usingLifetimeModel(noopLifetimeAddon()).usingManifest(builder.services).build();
    const factory: ILoggerProviderConfigFactory = provider.resolve(FACTORY_TYPE);
    const config = factory.getConfig(FAKE_PROVIDER_TYPE);

    expect(config.get('Format')).toBe('text');
    expect(config.get('MaxDepth')).toBe('3');

    const other = factory.getConfig(Type.from('test:MissingProvider'));
    expect(other.get('Format')).toBeUndefined();
  });

  test('the chained provider configuration is LIVE across a reload', () => {
    const config = rootWith({ 'FakeProvider:Format': 'json' });
    const builder = new LoggingBuilder(Manifest.empty<unknown>());
    builder.addConfig(config);

    const provider = di.usingLifetimeModel(noopLifetimeAddon()).usingManifest(builder.services).build();
    const factory: ILoggerProviderConfigFactory = provider.resolve(FACTORY_TYPE);
    const providerConfig = factory.getConfig(FAKE_PROVIDER_TYPE);
    expect(providerConfig.get('Format')).toBe('json');

    let fired = false;
    providerConfig.getReloadToken().registerChangeCallback(() => {
      fired = true;
    });
    config.set('FakeProvider:Format', 'text');
    config.reload();

    expect(providerConfig.get('Format')).toBe('text');
    expect(fired).toBe(true);
  });

  // Needs the standard lifetime model's singleton caching, not yet wired for this suite.
  test.skip('the open ILoggerProviderConfig<$1> registration closes per provider', () => {
    const builder = new LoggingBuilder(Manifest.empty<unknown>());
    builder.addConfig(rootWith({ 'FakeProvider:Format': 'json' }));

    const provider = di.usingLifetimeModel(noopLifetimeAddon()).usingManifest(builder.services).build();
    const providerConfigType = loggerProviderConfigType(FAKE_PROVIDER_TYPE);
    const providerConfig: ILoggerProviderConfig<unknown> = provider.resolve(providerConfigType);

    expect(providerConfig.config.get('Format')).toBe('json');
    // Singleton-tagged: the closing caches per closed type.
    const providerConfigAgain: ILoggerProviderConfig<unknown> = provider.resolve(providerConfigType);
    expect(providerConfigAgain).toBe(providerConfig);
  });

  test('the no-arg method form registers the services without a filter pipeline', () => {
    const builder = new LoggingBuilder(Manifest.empty<unknown>());
    builder.addConfig();

    const provider = di.usingLifetimeModel(noopLifetimeAddon()).usingManifest(builder.services).build();
    const factory: ILoggerProviderConfigFactory = provider.resolve(FACTORY_TYPE);
    // No LoggingConfig registered yet: every provider section is empty.
    expect(factory.getConfig(FAKE_PROVIDER_TYPE).get('Format')).toBeUndefined();
  });
});
