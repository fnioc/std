// ConfigSection -- a pure (root, path) view. Verifies key/path derive
// from the path, that reads/writes route back through the root with the path
// combined onto the key, and that value / getChildren reflect the live root.

import { describe, expect, test } from 'bun:test';
import { rootOf } from './support';

describe('ConfigSection', () => {
  test('key is the last path segment; path is the full colon-delimited path', () => {
    const root = rootOf({ 'Database:Primary:Host': 'db.internal' });

    const primary = root.getSection('Database:Primary');
    expect(primary.path).toBe('Database:Primary');
    expect(primary.key).toBe('Primary');
  });

  test('get(key) reads a descendant relative to the section path', () => {
    const root = rootOf({
      'Database:Primary:Host': 'db.internal',
      'Database:Primary:Port': '5432',
    });

    const primary = root.getSection('Database:Primary');
    expect(primary.get('Host')).toBe('db.internal');
    expect(primary.get('Port')).toBe('5432');
    // A sibling section's keys must not leak in.
    expect(primary.get('Secondary:Host')).toBeUndefined();
  });

  test('value returns the value stored directly at the section path', () => {
    const root = rootOf({ 'Feature:Enabled': 'true', Feature: 'on' });

    expect(root.getSection('Feature').value).toBe('on');
    expect(root.getSection('Feature:Enabled').value).toBe('true');
  });

  test('nested getSection composes paths, and lookups are case-insensitive', () => {
    const root = rootOf({ 'DATABASE:PRIMARY:HOST': 'db.internal' });

    const host = root.getSection('Database').getSection('Primary').get('Host');
    expect(host).toBe('db.internal');
  });

  test('set(key, value) routes the write back through the root', () => {
    const root = rootOf({ 'Server:Port': '8080' });

    root.getSection('Server').set('Port', '9090');
    expect(root.get('Server:Port')).toBe('9090');
  });

  test('getChildren returns the immediate descendant sections of the section', () => {
    const root = rootOf({
      'Server:Port': '8080',
      'Server:Host': 'localhost',
    });

    const keys = [...root.getSection('Server').getChildren()].map((section) => section.key).sort();
    expect(keys).toEqual(['Host', 'Port']);
  });
});
