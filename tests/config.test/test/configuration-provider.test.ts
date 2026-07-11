// ConfigurationProvider base behavior -- exercised through the concrete
// MemoryConfigurationProvider. The case-insensitive, casing-preserving store
// and the getChildKeys boundary logic are NEW: the pre-rewrite design had no
// provider abstraction and no per-provider child-key enumeration at all.

import { MemoryConfigurationProvider, MemoryConfigurationSource } from '@rhombus-std/config';
import { describe, expect, test } from 'bun:test';

function providerOf(data: Record<string, string>): MemoryConfigurationProvider {
  return new MemoryConfigurationProvider(new MemoryConfigurationSource({ initialData: data }));
}

describe('ConfigurationProvider store (case-insensitive, casing-preserving)', () => {
  test('tryGet resolves case-insensitively against the stored key', () => {
    const provider = providerOf({ 'Server:Port': '8080' });

    expect(provider.tryGet('server:port')).toEqual([true, '8080']);
    expect(provider.tryGet('SERVER:PORT')).toEqual([true, '8080']);
    expect(provider.tryGet('Server:Missing')).toEqual([false]);
  });

  test('set preserves the first-inserted casing but updates the value', () => {
    const provider = providerOf({ 'Server:Port': '8080' });
    provider.set('SERVER:PORT', '9090');

    expect(provider.tryGet('server:port')).toEqual([true, '9090']);
    // Only the original-cased key is reported by getChildKeys.
    expect([...provider.getChildKeys([], 'Server')]).toEqual(['Port']);
  });
});

describe('ConfigurationProvider.getChildKeys', () => {
  test('with no parentPath, returns the first segment of every key -- WITHOUT dedup', () => {
    const provider = providerOf({ 'Server:Port': '8080', 'Server:Host': 'localhost' });

    // Dedup is the root's job, not the provider's: both "Server" entries survive.
    expect([...provider.getChildKeys([], undefined)]).toEqual(['Server', 'Server']);
  });

  test('with a parentPath, returns the segment after a boundary-exact colon match', () => {
    const provider = providerOf({
      'Server:Port': '8080',
      'Server:Host': 'localhost',
      'ServerFarm:Size': '3',
    });

    // "ServerFarm:Size" must NOT match parentPath "Server" (no ':' boundary
    // after "Server"), only "Server:Port"/"Server:Host" do.
    expect([...provider.getChildKeys([], 'Server')]).toEqual(['Host', 'Port']);
  });

  test('appends earlierKeys and sorts the whole combined list', () => {
    const provider = providerOf({ 'Server:2': 'b', 'Server:10': 'c' });

    // earlierKeys "1" folds into the sort; numeric ordering keeps 1,2,10.
    expect([...provider.getChildKeys(['1'], 'Server')]).toEqual(['1', '2', '10']);
  });
});
