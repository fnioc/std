// StreamConfigProvider/StreamConfigSource -- the abstract
// stream-payload bases concrete providers (config.json's addJsonStream)
// extend. Verifies the base load() contract: delegates the payload to
// loadStream exactly once, throws on a second load (so a root-wide reload()
// throws too), and throws when the source's stream payload is unset.
// Black-box through @rhombus-std/config.

import { ConfigBuilder, ConfigRoot, type IConfigBuilder, type IConfigProvider, StreamConfigProvider, StreamConfigSource,
  type StreamPayload } from '@rhombus-std/config';
import { describe, expect, test } from 'bun:test';

/** A minimal concrete pair: each `key=value` line of the payload becomes one entry. */
class LineStreamConfigurationProvider extends StreamConfigProvider {
  public loadStreamCalls = 0;

  public override loadStream(stream: StreamPayload): void {
    this.loadStreamCalls += 1;
    const text = typeof stream === 'string' ? stream : new TextDecoder().decode(stream);
    for (const line of text.split('\n')) {
      if (line !== '') {
        const eq = line.indexOf('=');
        this.set(line.slice(0, eq), line.slice(eq + 1));
      }
    }
  }
}

class LineStreamConfigurationSource extends StreamConfigSource {
  public override build(_builder: IConfigBuilder): IConfigProvider {
    return new LineStreamConfigurationProvider(this);
  }
}

describe('StreamConfigProvider', () => {
  test("load() hands the source's payload to loadStream and serves the data", () => {
    const root = new ConfigBuilder()
      .add(new LineStreamConfigurationSource('Server:Port=8080\nServer:Host=localhost'))
      .build();

    expect(root.get('Server:Port')).toBe('8080');
    expect(root.get('Server:Host')).toBe('localhost');
  });

  test('accepts a Uint8Array payload as well as a string', () => {
    const bytes = new TextEncoder().encode('A=1');
    const root = new ConfigBuilder().add(new LineStreamConfigurationSource(bytes)).build();

    expect(root.get('A')).toBe('1');
  });

  test('the payload is assignable after construction (the reference shape)', () => {
    const source = new LineStreamConfigurationSource();
    source.stream = 'A=1';

    const root = new ConfigBuilder().add(source).build();
    expect(root.get('A')).toBe('1');
  });

  test('a second load() throws -- the payload is consumed exactly once', () => {
    const source = new LineStreamConfigurationSource('A=1');
    const provider = source.build(new ConfigBuilder()) as LineStreamConfigurationProvider;

    provider.load();
    expect(provider.loadStreamCalls).toBe(1);
    expect(() => provider.load()).toThrow(/cannot be loaded more than once/);
    expect(provider.loadStreamCalls).toBe(1);
  });

  test('a root-wide reload() over a stream provider therefore throws', () => {
    // Built as a plain ConfigRoot (not through the builder's proxy-typed
    // build()) so reload() is statically callable.
    const source = new LineStreamConfigurationSource('A=1');
    const root = new ConfigRoot([source.build(new ConfigBuilder())]);

    expect(root.get('A')).toBe('1');
    expect(() => root.reload()).toThrow(/cannot be loaded more than once/);
  });

  test("load() throws when the source's stream payload is unset", () => {
    const provider = new LineStreamConfigurationSource().build(new ConfigBuilder());

    expect(() => provider.load()).toThrow(/stream payload is unset/);
  });
});
