// StreamConfigurationProvider/StreamConfigurationSource -- the abstract
// stream-payload bases concrete providers (config.json's addJsonStream)
// extend. Verifies the base load() contract: delegates the payload to
// loadStream exactly once, throws on a second load (so a root-wide reload()
// throws too), and throws when the source's stream payload is unset.
// Black-box through @rhombus-std/config.

import {
  ConfigurationBuilder,
  ConfigurationRoot,
  type IConfigurationBuilder,
  type IConfigurationProvider,
  StreamConfigurationProvider,
  StreamConfigurationSource,
  type StreamPayload,
} from "@rhombus-std/config";
import { describe, expect, test } from "bun:test";

/** A minimal concrete pair: each `key=value` line of the payload becomes one entry. */
class LineStreamConfigurationProvider extends StreamConfigurationProvider {
  public loadStreamCalls = 0;

  public override loadStream(stream: StreamPayload): void {
    this.loadStreamCalls += 1;
    const text = typeof stream === "string" ? stream : new TextDecoder().decode(stream);
    for (const line of text.split("\n")) {
      if (line !== "") {
        const eq = line.indexOf("=");
        this.set(line.slice(0, eq), line.slice(eq + 1));
      }
    }
  }
}

class LineStreamConfigurationSource extends StreamConfigurationSource {
  public override build(_builder: IConfigurationBuilder): IConfigurationProvider {
    return new LineStreamConfigurationProvider(this);
  }
}

describe("StreamConfigurationProvider", () => {
  test("load() hands the source's payload to loadStream and serves the data", () => {
    const root = new ConfigurationBuilder()
      .add(new LineStreamConfigurationSource("Server:Port=8080\nServer:Host=localhost"))
      .build();

    expect(root.get("Server:Port")).toBe("8080");
    expect(root.get("Server:Host")).toBe("localhost");
  });

  test("accepts a Uint8Array payload as well as a string", () => {
    const bytes = new TextEncoder().encode("A=1");
    const root = new ConfigurationBuilder().add(new LineStreamConfigurationSource(bytes)).build();

    expect(root.get("A")).toBe("1");
  });

  test("the payload is assignable after construction (the reference shape)", () => {
    const source = new LineStreamConfigurationSource();
    source.stream = "A=1";

    const root = new ConfigurationBuilder().add(source).build();
    expect(root.get("A")).toBe("1");
  });

  test("a second load() throws -- the payload is consumed exactly once", () => {
    const source = new LineStreamConfigurationSource("A=1");
    const provider = source.build(new ConfigurationBuilder()) as LineStreamConfigurationProvider;

    provider.load();
    expect(provider.loadStreamCalls).toBe(1);
    expect(() => provider.load()).toThrow(/cannot be loaded more than once/);
    expect(provider.loadStreamCalls).toBe(1);
  });

  test("a root-wide reload() over a stream provider therefore throws", () => {
    // Built as a plain ConfigurationRoot (not through the builder's proxy-typed
    // build()) so reload() is statically callable.
    const source = new LineStreamConfigurationSource("A=1");
    const root = new ConfigurationRoot([source.build(new ConfigurationBuilder())]);

    expect(root.get("A")).toBe("1");
    expect(() => root.reload()).toThrow(/cannot be loaded more than once/);
  });

  test("load() throws when the source's stream payload is unset", () => {
    const provider = new LineStreamConfigurationSource().build(new ConfigurationBuilder());

    expect(() => provider.load()).toThrow(/stream payload is unset/);
  });
});
