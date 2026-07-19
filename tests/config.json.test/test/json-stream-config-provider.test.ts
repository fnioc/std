// Behavior tests for JsonStreamConfigProvider/Source + the
// addJsonStream augmentation -- an in-memory JSON payload (string or
// Uint8Array) flattened with the same rules as the file provider (shared
// JsonConfigFileParser), through the once-only stream base contract.

import { ConfigBuilder, ConfigManager } from '@rhombus-std/config';
import { JsonStreamConfigProvider } from '@rhombus-std/config.json';
import { JsonStreamConfigSource } from '@rhombus-std/config.json';
import { describe, expect, test } from 'bun:test';
// Side-effect import: installs `addJsonFile` + `addJsonStream` onto both builders.
import '@rhombus-std/config.json';

const PAYLOAD = JSON.stringify({
  TopLevel: 'value',
  Server: {
    Host: 'localhost',
    Port: 8080,
    UseTls: true,
    Tags: ['a', 'b'],
    Nullable: null,
  },
});

describe('JsonStreamConfigProvider', () => {
  test('flattens a string payload with the same rules as the file provider', () => {
    const root = new ConfigBuilder()
      .add(new JsonStreamConfigSource(PAYLOAD))
      .build();

    expect(root.get('TopLevel')).toBe('value');
    expect(root.get('Server:Host')).toBe('localhost');
    expect(root.get('Server:Port')).toBe('8080');
    expect(root.get('Server:UseTls')).toBe('true');
    expect(root.get('Server:Tags:0')).toBe('a');
    expect(root.get('Server:Tags:1')).toBe('b');
    expect(root.get('Server:Nullable')).toBeUndefined();
  });

  test('accepts a Uint8Array payload, decoded as UTF-8', () => {
    const root = new ConfigBuilder()
      .add(new JsonStreamConfigSource(new TextEncoder().encode(PAYLOAD)))
      .build();

    expect(root.get('Server:Host')).toBe('localhost');
  });

  test('throws on malformed JSON', () => {
    const source = new JsonStreamConfigSource('{ not valid json');

    expect(() => new ConfigBuilder().add(source).build())
      .toThrow(/failed to parse JSON/);
  });

  test('throws when the JSON root is a scalar', () => {
    const source = new JsonStreamConfigSource('42');

    expect(() => new ConfigBuilder().add(source).build())
      .toThrow(/the top-level JSON element must be an object/);
  });

  test('throws when the JSON root is a top-level array', () => {
    const source = new JsonStreamConfigSource('[1, 2, 3]');

    expect(() => new ConfigBuilder().add(source).build())
      .toThrow(/the top-level JSON element must be an object/);
  });

  test("throws when the source's stream payload was never assigned", () => {
    const provider = new JsonStreamConfigSource().build(new ConfigBuilder());

    expect(() => provider.load()).toThrow(/stream payload is unset/);
  });

  test('a second load() throws -- the payload is consumed exactly once', () => {
    const provider = new JsonStreamConfigSource(PAYLOAD).build(new ConfigBuilder());

    provider.load();
    expect(() => provider.load()).toThrow(/cannot be loaded more than once/);
  });

  test('build() returns a JsonStreamConfigProvider', () => {
    const provider = new JsonStreamConfigSource(PAYLOAD).build(new ConfigBuilder());

    expect(provider).toBeInstanceOf(JsonStreamConfigProvider);
  });
});

describe('addJsonStream augmentation', () => {
  test('registers a JsonStreamConfigSource on the builder', () => {
    const root = new ConfigBuilder()
      .addJsonStream(PAYLOAD)
      .build();

    expect(root.get('Server:Host')).toBe('localhost');
  });

  test('installs on ConfigManager, not just ConfigBuilder', () => {
    const manager = new ConfigManager().addJsonStream(PAYLOAD);

    expect(manager.get('Server:Port')).toBe('8080');
  });

  test('accepts a Uint8Array payload through the sugar too', () => {
    const root = new ConfigBuilder()
      .addJsonStream(new TextEncoder().encode(PAYLOAD))
      .build();

    expect(root.get('Server:Tags:1')).toBe('b');
  });
});
