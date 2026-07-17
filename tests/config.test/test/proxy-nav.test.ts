// Proxy integration: dot/bracket navigation over the Section tree via
// @rhombus-toolkit/proxy-base's IndexAccessed, plus every guarded hazard.

import { ConfigBuilder, ConfigRoot, ConfigSection, type IndexedSection } from '@rhombus-std/config';
import { describe, expect, test } from 'bun:test';

function navRoot(): IndexedSection {
  return new ConfigBuilder()
    .addInMemoryCollection({ 'Server:Host': 'localhost', 'Server:Port': '8080' })
    .build();
}

describe('proxy navigation', () => {
  test('real methods win over the indexer', () => {
    const config = navRoot();
    expect(config.get('Server:Port')).toBe('8080');
  });

  test('index nav returns a ConfigSection', () => {
    expect(navRoot().Server).toBeInstanceOf(ConfigSection);
  });

  test('3-level dot navigation reaches the leaf value', () => {
    const config = navRoot();
    expect(config.Server!.Port!.value).toBe('8080');
  });

  test('bracket navigation works too', () => {
    const config = navRoot();
    expect(config['Server']!['Host']!.value).toBe('localhost');
  });

  test('a coercing helper works mid-navigation', () => {
    expect(navRoot().Server!.getNum('Port')).toBe(8080);
  });

  test('then is guarded: config is not thenable and await resolves to itself', async () => {
    const config = navRoot();
    expect((config as { then?: unknown; }).then).toBeUndefined();
    expect(await config).toBe(config);
  });

  test('symbol probes are guarded and config is not iterable', () => {
    const config = navRoot();
    expect((config as unknown as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
    expect(() => {
      for (const _ of config as unknown as Iterable<unknown>) {
        void _;
      }
    }).toThrow();
  });

  test('instanceof stays intact through the attached proxy', () => {
    const config = navRoot();
    expect(config).toBeInstanceOf(ConfigRoot);
    expect(config.Server).toBeInstanceOf(ConfigSection);
  });

  test('index writes throw; set() and the value setter still work', () => {
    const config = navRoot();
    expect(() => {
      (config as unknown as Record<string, unknown>)['Foo'] = 1;
    }).toThrow();
    expect(() => config.set('Foo', '1')).not.toThrow();
    expect(() => {
      config.getSection('Server').value = 'x';
    }).not.toThrow();
  });

  test('a config key named like a member is shadowed but reachable via getSection', () => {
    const config = new ConfigBuilder()
      .addInMemoryCollection({ value: 'shadowed' })
      .build();
    // `config.value` returns the member (undefined on the root), not the key.
    expect(config.value).toBeUndefined();
    // The escape hatch reaches the real key.
    expect(config.getSection('value').value).toBe('shadowed');
  });

  test('navigating a missing key yields an empty section', () => {
    expect(navRoot().Nope!.value).toBeUndefined();
  });
});
