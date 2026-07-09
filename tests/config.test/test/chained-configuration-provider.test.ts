// Behavior tests for ChainedConfigurationSource/Provider -- wraps an
// already-built IConfiguration as a source so it can be chained into another
// builder/manager. Unlike every other provider in this package, it has no
// data store of its own: every read/write, reload token, and child-key
// enumeration delegates straight through to the chained configuration.

import {
  ChainedConfigurationProvider,
  ChainedConfigurationSource,
  type ConfigObject,
  ConfigurationBuilder,
  ConfigurationManager,
  ConfigurationProvider,
  ConfigurationReloadToken,
  type IConfiguration,
  type IConfigurationBuilder,
  type IConfigurationProvider,
  type IConfigurationSection,
  type IConfigurationSource,
} from "@rhombus-std/config";
import type { IChangeToken } from "@rhombus-std/primitives";
import { describe, expect, test } from "bun:test";

/** A ConfigurationProvider whose load() is counted, so a reload is observable. */
class CountingProvider extends ConfigurationProvider {
  public loadCount = 0;
  public override load(): void {
    this.loadCount++;
  }
}

/** A source that always builds (and exposes) the same {@link CountingProvider}. */
class CountingSource implements IConfigurationSource {
  public readonly provider = new CountingProvider();
  public build(_builder: IConfigurationBuilder): IConfigurationProvider {
    return this.provider;
  }
}

describe("ChainedConfigurationProvider", () => {
  test("tryGet delegates to the chained configuration; an empty-string value counts as a miss", () => {
    const inner = new ConfigurationBuilder().addInMemoryCollection({ "A": "1", "B": "" }).build();
    const provider = new ChainedConfigurationSource({ configuration: inner }).build(new ConfigurationBuilder());

    expect(provider.tryGet("A")).toEqual([true, "1"]);
    expect(provider.tryGet("B")).toEqual([false]);
    expect(provider.tryGet("Missing")).toEqual([false]);
  });

  test("set writes through to the chained configuration", () => {
    const inner = new ConfigurationBuilder().addInMemoryCollection({ "A": "1" }).build();
    const provider = new ChainedConfigurationSource({ configuration: inner }).build(new ConfigurationBuilder());

    provider.set("A", "2");
    expect(inner.get("A")).toBe("2");
  });

  test("getReloadToken delegates to the chained configuration's own token", () => {
    const inner = new ConfigurationBuilder().addInMemoryCollection({ "A": "1" }).build();
    const provider = new ChainedConfigurationSource({ configuration: inner }).build(new ConfigurationBuilder());

    expect(provider.getReloadToken()).toBe(inner.getReloadToken());
  });

  test("toString returns the class name -- it has no ConfigurationProvider base to inherit the default from", () => {
    const inner = new ConfigurationBuilder().build();
    const provider = new ChainedConfigurationSource({ configuration: inner }).build(new ConfigurationBuilder());

    expect(String(provider)).toBe("ChainedConfigurationProvider");
  });

  test("getChildKeys combines the chained configuration's own children with earlierKeys, sorted", () => {
    const inner = new ConfigurationBuilder()
      .addInMemoryCollection({ "Server:Port": "8080", "Server:Host": "localhost", "Logging:Level": "Info" })
      .build();
    const provider = new ChainedConfigurationSource({ configuration: inner }).build(new ConfigurationBuilder());

    expect([...provider.getChildKeys(["Zeta"], undefined)]).toEqual(["Logging", "Server", "Zeta"]);
    expect([...provider.getChildKeys([], "Server")]).toEqual(["Host", "Port"]);
  });

  test("load(): the first call is a no-op -- the chained configuration is assumed already loaded", () => {
    const countingSource = new CountingSource();
    const inner = new ConfigurationBuilder().add(countingSource).build();
    // ConfigurationRoot's constructor eagerly loads every provider once.
    expect(countingSource.provider.loadCount).toBe(1);

    const provider = new ChainedConfigurationSource({ configuration: inner }).build(new ConfigurationBuilder());
    provider.load();
    expect(countingSource.provider.loadCount).toBe(1);
  });

  test("load(): a later call reloads the chained root's own providers", () => {
    const countingSource = new CountingSource();
    const inner = new ConfigurationBuilder().add(countingSource).build();

    const provider = new ChainedConfigurationSource({ configuration: inner }).build(new ConfigurationBuilder());
    provider.load(); // the initial no-op
    provider.load();
    expect(countingSource.provider.loadCount).toBe(2);
  });

  test("load(): a chained ConfigurationManager reloads too -- duck-typed root check, not instanceof ConfigurationRoot", () => {
    const countingSource = new CountingSource();
    const manager = new ConfigurationManager().add(countingSource);
    const countAfterAdd = countingSource.provider.loadCount;

    const provider = new ChainedConfigurationSource({ configuration: manager }).build(new ConfigurationBuilder());
    provider.load(); // the initial no-op
    provider.load();
    expect(countingSource.provider.loadCount).toBe(countAfterAdd + 1);
  });

  test("load(): a chained plain section (not a root) tolerates a later call without throwing", () => {
    const inner = new ConfigurationBuilder().addInMemoryCollection({ "Server:Port": "8080" }).build();
    const section = inner.getSection("Server");

    const provider = new ChainedConfigurationSource({ configuration: section }).build(new ConfigurationBuilder());
    expect(() => {
      provider.load();
      provider.load();
    }).not.toThrow();
  });
});

describe("ChainedConfigurationSource", () => {
  test("shouldDisposeConfiguration defaults to false", () => {
    const source = new ChainedConfigurationSource({ configuration: new ConfigurationBuilder().build() });
    expect(source.shouldDisposeConfiguration).toBe(false);
  });
});

/** A minimal Disposable IConfiguration stand-in -- only `[Symbol.dispose]` is exercised below. */
class FakeDisposableConfig implements IConfiguration, Disposable {
  public disposed = false;
  public readonly value: string | undefined = undefined;
  public get(): string | undefined {
    throw new Error("not implemented");
  }
  // getNum/getBool need the same overload PAIR as IConfiguration's own --
  // a single no-arg signature isn't assignable to the two-overload interface
  // member (the `dflt` overload promises a non-undefined return).
  public getNum(path: string): number | undefined;
  public getNum(path: string, dflt: number): number;
  public getNum(): number | undefined {
    throw new Error("not implemented");
  }
  public getBool(path: string): boolean | undefined;
  public getBool(path: string, dflt: boolean): boolean;
  public getBool(): boolean | undefined {
    throw new Error("not implemented");
  }
  public set(): this {
    throw new Error("not implemented");
  }
  public getSection(): IConfigurationSection {
    throw new Error("not implemented");
  }
  public getChildren(): Iterable<IConfigurationSection> {
    throw new Error("not implemented");
  }
  public toObject(): ConfigObject {
    throw new Error("not implemented");
  }
  public getReloadToken(): IChangeToken {
    return new ConfigurationReloadToken();
  }
  public [Symbol.dispose](): void {
    this.disposed = true;
  }
}

describe("ChainedConfigurationProvider disposal", () => {
  test("does not dispose the chained configuration by default", () => {
    const inner = new FakeDisposableConfig();
    const provider = new ChainedConfigurationProvider(new ChainedConfigurationSource({ configuration: inner }));

    provider[Symbol.dispose]();
    expect(inner.disposed).toBe(false);
  });

  test("disposes the chained configuration when shouldDisposeConfiguration is true", () => {
    const inner = new FakeDisposableConfig();
    const provider = new ChainedConfigurationProvider(
      new ChainedConfigurationSource({ configuration: inner, shouldDisposeConfiguration: true }),
    );

    provider[Symbol.dispose]();
    expect(inner.disposed).toBe(true);
  });
});

describe("addConfiguration augmentation", () => {
  test("registers a ChainedConfigurationSource on the builder", () => {
    const inner = new ConfigurationBuilder().addInMemoryCollection({ "A": "1" }).build();
    const root = new ConfigurationBuilder().addConfiguration(inner).build();

    expect(root.get("A")).toBe("1");
  });

  test("installs on ConfigurationManager, not just ConfigurationBuilder", () => {
    const inner = new ConfigurationBuilder().addInMemoryCollection({ "A": "1" }).build();
    const manager = new ConfigurationManager().addConfiguration(inner);

    expect(manager.get("A")).toBe("1");
  });

  test("a source registered after the chained configuration still overrides it (last-registered wins)", () => {
    const inner = new ConfigurationBuilder().addInMemoryCollection({ "A": "1" }).build();
    const root = new ConfigurationBuilder()
      .addConfiguration(inner)
      .addInMemoryCollection({ "A": "2" })
      .build();

    expect(root.get("A")).toBe("2");
  });
});
