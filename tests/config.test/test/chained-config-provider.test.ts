// Behavior tests for ChainedConfigSource/Provider -- wraps an
// already-built IConfig as a source so it can be chained into another
// builder/manager. Unlike every other provider in this package, it has no
// data store of its own: every read/write, reload token, and child-key
// enumeration delegates straight through to the chained configuration.

import { ChainedConfigProvider, ChainedConfigSource, ConfigBuilder, ConfigManager, type ConfigObject, ConfigProvider,
  ConfigReloadToken, type IConfig, type IConfigBuilder, type IConfigProvider, type IConfigSection,
  type IConfigSource } from '@rhombus-std/config';
import type { IChangeToken } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** A ConfigProvider whose load() is counted, so a reload is observable. */
class CountingProvider extends ConfigProvider {
  public loadCount = 0;
  public override load(): void {
    this.loadCount++;
  }
}

/** A source that always builds (and exposes) the same {@link CountingProvider}. */
class CountingSource implements IConfigSource {
  public readonly provider = new CountingProvider();
  public build(_builder: IConfigBuilder): IConfigProvider {
    return this.provider;
  }
}

describe('ChainedConfigProvider', () => {
  test('tryGet delegates to the chained configuration; an empty-string value counts as a miss', () => {
    const inner = new ConfigBuilder().addInMemoryCollection({ A: '1', B: '' }).build();
    const provider = new ChainedConfigSource({ config: inner }).build(new ConfigBuilder());

    expect(provider.tryGet('A')).toEqual([true, '1']);
    expect(provider.tryGet('B')).toEqual([false]);
    expect(provider.tryGet('Missing')).toEqual([false]);
  });

  test('set writes through to the chained configuration', () => {
    const inner = new ConfigBuilder().addInMemoryCollection({ A: '1' }).build();
    const provider = new ChainedConfigSource({ config: inner }).build(new ConfigBuilder());

    provider.set('A', '2');
    expect(inner.get('A')).toBe('2');
  });

  test("getReloadToken delegates to the chained configuration's own token", () => {
    const inner = new ConfigBuilder().addInMemoryCollection({ A: '1' }).build();
    const provider = new ChainedConfigSource({ config: inner }).build(new ConfigBuilder());

    expect(provider.getReloadToken()).toBe(inner.getReloadToken());
  });

  test('toString returns the class name -- it has no ConfigProvider base to inherit the default from', () => {
    const inner = new ConfigBuilder().build();
    const provider = new ChainedConfigSource({ config: inner }).build(new ConfigBuilder());

    expect(String(provider)).toBe('ChainedConfigProvider');
  });

  test("getChildKeys combines the chained configuration's own children with earlierKeys, sorted", () => {
    const inner = new ConfigBuilder()
      .addInMemoryCollection({ 'Server:Port': '8080', 'Server:Host': 'localhost', 'Logging:Level': 'Info' })
      .build();
    const provider = new ChainedConfigSource({ config: inner }).build(new ConfigBuilder());

    expect([...provider.getChildKeys(['Zeta'], undefined)]).toEqual(['Logging', 'Server', 'Zeta']);
    expect([...provider.getChildKeys([], 'Server')]).toEqual(['Host', 'Port']);
  });

  test('load(): the first call is a no-op -- the chained configuration is assumed already loaded', () => {
    const countingSource = new CountingSource();
    const inner = new ConfigBuilder().add(countingSource).build();
    // ConfigRoot's constructor eagerly loads every provider once.
    expect(countingSource.provider.loadCount).toBe(1);

    const provider = new ChainedConfigSource({ config: inner }).build(new ConfigBuilder());
    provider.load();
    expect(countingSource.provider.loadCount).toBe(1);
  });

  test("load(): a later call reloads the chained root's own providers", () => {
    const countingSource = new CountingSource();
    const inner = new ConfigBuilder().add(countingSource).build();

    const provider = new ChainedConfigSource({ config: inner }).build(new ConfigBuilder());
    provider.load(); // the initial no-op
    provider.load();
    expect(countingSource.provider.loadCount).toBe(2);
  });

  test('load(): a chained ConfigManager reloads too -- duck-typed root check, not instanceof ConfigRoot', () => {
    const countingSource = new CountingSource();
    const manager = new ConfigManager().add(countingSource);
    const countAfterAdd = countingSource.provider.loadCount;

    const provider = new ChainedConfigSource({ config: manager }).build(new ConfigBuilder());
    provider.load(); // the initial no-op
    provider.load();
    expect(countingSource.provider.loadCount).toBe(countAfterAdd + 1);
  });

  test('load(): a chained plain section (not a root) tolerates a later call without throwing', () => {
    const inner = new ConfigBuilder().addInMemoryCollection({ 'Server:Port': '8080' }).build();
    const section = inner.getSection('Server');

    const provider = new ChainedConfigSource({ config: section }).build(new ConfigBuilder());
    expect(() => {
      provider.load();
      provider.load();
    }).not.toThrow();
  });
});

describe('ChainedConfigSource', () => {
  test('shouldDisposeConfig defaults to false', () => {
    const source = new ChainedConfigSource({ config: new ConfigBuilder().build() });
    expect(source.shouldDisposeConfig).toBe(false);
  });
});

/** A minimal Disposable IConfig stand-in -- only `[Symbol.dispose]` is exercised below. */
class FakeDisposableConfig implements IConfig, Disposable {
  public disposed = false;
  public readonly value: string | undefined = undefined;
  public get(): string | undefined {
    throw new Error('not implemented');
  }
  // getNum/getBool need the same overload PAIR as IConfig's own --
  // a single no-arg signature isn't assignable to the two-overload interface
  // member (the `dflt` overload promises a non-undefined return).
  public getNum(path: string): number | undefined;
  public getNum(path: string, dflt: number): number;
  public getNum(): number | undefined {
    throw new Error('not implemented');
  }
  public getBool(path: string): boolean | undefined;
  public getBool(path: string, dflt: boolean): boolean;
  public getBool(): boolean | undefined {
    throw new Error('not implemented');
  }
  public set(): this {
    throw new Error('not implemented');
  }
  public getSection(): IConfigSection {
    throw new Error('not implemented');
  }
  public getChildren(): Iterable<IConfigSection> {
    throw new Error('not implemented');
  }
  public toObject(): ConfigObject {
    throw new Error('not implemented');
  }
  public getReloadToken(): IChangeToken {
    return new ConfigReloadToken();
  }
  public [Symbol.dispose](): void {
    this.disposed = true;
  }
}

describe('ChainedConfigProvider disposal', () => {
  test('does not dispose the chained configuration by default', () => {
    const inner = new FakeDisposableConfig();
    const provider = new ChainedConfigProvider(new ChainedConfigSource({ config: inner }));

    provider[Symbol.dispose]();
    expect(inner.disposed).toBe(false);
  });

  test('disposes the chained configuration when shouldDisposeConfig is true', () => {
    const inner = new FakeDisposableConfig();
    const provider = new ChainedConfigProvider(
      new ChainedConfigSource({ config: inner, shouldDisposeConfig: true }),
    );

    provider[Symbol.dispose]();
    expect(inner.disposed).toBe(true);
  });
});

describe('addConfig augmentation', () => {
  test('registers a ChainedConfigSource on the builder', () => {
    const inner = new ConfigBuilder().addInMemoryCollection({ A: '1' }).build();
    const root = new ConfigBuilder().addConfig(inner).build();

    expect(root.get('A')).toBe('1');
  });

  test('installs on ConfigManager, not just ConfigBuilder', () => {
    const inner = new ConfigBuilder().addInMemoryCollection({ A: '1' }).build();
    const manager = new ConfigManager().addConfig(inner);

    expect(manager.get('A')).toBe('1');
  });

  test('a source registered after the chained configuration still overrides it (last-registered wins)', () => {
    const inner = new ConfigBuilder().addInMemoryCollection({ A: '1' }).build();
    const root = new ConfigBuilder()
      .addConfig(inner)
      .addInMemoryCollection({ A: '2' })
      .build();

    expect(root.get('A')).toBe('2');
  });
});
