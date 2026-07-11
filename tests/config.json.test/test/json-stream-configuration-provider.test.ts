// Behavior tests for JsonStreamConfigurationProvider/Source + the
// addJsonStream augmentation -- an in-memory JSON payload (string or
// Uint8Array) flattened with the same rules as the file provider (shared
// JsonConfigurationFileParser), through the once-only stream base contract.

import { ConfigurationBuilder, ConfigurationManager } from '@rhombus-std/config';
import { JsonStreamConfigurationProvider } from '@rhombus-std/config.json/internal/JsonStreamConfigurationProvider';
import { JsonStreamConfigurationSource } from '@rhombus-std/config.json/internal/JsonStreamConfigurationSource';
import { describe, expect, test } from 'bun:test';
// Side-effect import: installs `addJsonFile` + `addJsonStream` onto both builders.
import '@rhombus-std/config.json/internal/index';

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

describe('JsonStreamConfigurationProvider', () => {
  test('flattens a string payload with the same rules as the file provider', () => {
    const root = new ConfigurationBuilder()
      .add(new JsonStreamConfigurationSource(PAYLOAD))
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
    const root = new ConfigurationBuilder()
      .add(new JsonStreamConfigurationSource(new TextEncoder().encode(PAYLOAD)))
      .build();

    expect(root.get('Server:Host')).toBe('localhost');
  });

  test('throws on malformed JSON', () => {
    const source = new JsonStreamConfigurationSource('{ not valid json');

    expect(() => new ConfigurationBuilder().add(source).build())
      .toThrow(/failed to parse JSON/);
  });

  test('throws when the JSON root is a scalar', () => {
    const source = new JsonStreamConfigurationSource('42');

    expect(() => new ConfigurationBuilder().add(source).build())
      .toThrow(/root must be an object or array/);
  });

  test("throws when the source's stream payload was never assigned", () => {
    const provider = new JsonStreamConfigurationSource().build(new ConfigurationBuilder());

    expect(() => provider.load()).toThrow(/stream payload is unset/);
  });

  test('a second load() throws -- the payload is consumed exactly once', () => {
    const provider = new JsonStreamConfigurationSource(PAYLOAD).build(new ConfigurationBuilder());

    provider.load();
    expect(() => provider.load()).toThrow(/cannot be loaded more than once/);
  });

  test('build() returns a JsonStreamConfigurationProvider', () => {
    const provider = new JsonStreamConfigurationSource(PAYLOAD).build(new ConfigurationBuilder());

    expect(provider).toBeInstanceOf(JsonStreamConfigurationProvider);
  });
});

describe('addJsonStream augmentation', () => {
  test('registers a JsonStreamConfigurationSource on the builder', () => {
    const root = new ConfigurationBuilder()
      .addJsonStream(PAYLOAD)
      .build();

    expect(root.get('Server:Host')).toBe('localhost');
  });

  test('installs on ConfigurationManager, not just ConfigurationBuilder', () => {
    const manager = new ConfigurationManager().addJsonStream(PAYLOAD);

    expect(manager.get('Server:Port')).toBe('8080');
  });

  test('accepts a Uint8Array payload through the sugar too', () => {
    const root = new ConfigurationBuilder()
      .addJsonStream(new TextEncoder().encode(PAYLOAD))
      .build();

    expect(root.get('Server:Tags:1')).toBe('b');
  });
});
