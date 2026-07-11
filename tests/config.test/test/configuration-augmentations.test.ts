// The MECA convenience augmentations over IConfiguration: getConnectionString,
// getRequiredSection, and asEnumerable (members of ConfigurationExtensions),
// plus the free `exists` function. Exercised black-box through the public
// @rhombus-std/config surface via the standalone member form -- the in-memory
// provider builds the tree.

import { ConfigurationBuilder, ConfigurationExtensions, exists, type IConfigurationRoot } from '@rhombus-std/config';
import { describe, expect, test } from 'bun:test';
import { rootOf } from './support';

const { asEnumerable, getConnectionString, getRequiredSection } = ConfigurationExtensions;

describe('getConnectionString', () => {
  test('returns the connection string under ConnectionStrings', () => {
    const root = rootOf({ 'ConnectionStrings:Default': 'Server=db;Database=app' });
    expect(getConnectionString(root, 'Default')).toBe('Server=db;Database=app');
  });

  test('returns undefined for an absent name', () => {
    const root = rootOf({ 'ConnectionStrings:Default': 'Server=db' });
    expect(getConnectionString(root, 'Missing')).toBeUndefined();
  });
});

describe('exists', () => {
  test('false for a nullish section', () => {
    expect(exists(undefined)).toBe(false);
  });

  test('true for a section with a value only', () => {
    const root = rootOf({ Feature: 'on' });
    expect(exists(root.getSection('Feature'))).toBe(true);
  });

  test('true for a section with children only (no own value)', () => {
    const root = rootOf({ 'Server:Port': '8080' });
    const server = root.getSection('Server');
    expect(server.value).toBeUndefined();
    expect(exists(server)).toBe(true);
  });

  test('true for a section whose value is the empty string (present, not absent)', () => {
    const root = rootOf({ Flag: '' });
    // "" is a real value -- exists tests `value !== undefined`, not truthiness.
    expect(root.getSection('Flag').value).toBe('');
    expect(exists(root.getSection('Flag'))).toBe(true);
  });

  test('false for an empty section (no value, no children)', () => {
    const root = rootOf({ 'Server:Port': '8080' });
    expect(exists(root.getSection('Nope'))).toBe(false);
  });
});

describe('getRequiredSection', () => {
  test('returns the section when it exists', () => {
    const root = rootOf({ 'Server:Port': '8080' });
    const server = getRequiredSection(root, 'Server');
    expect(server.path).toBe('Server');
    expect(server.get('Port')).toBe('8080');
  });

  test('throws naming the key when the section is absent', () => {
    const root = rootOf({ 'Server:Port': '8080' });
    expect(() => getRequiredSection(root, 'Missing')).toThrow(/Missing/);
  });
});

describe('asEnumerable', () => {
  // A small nested tree: two leaves under Server, one two levels deep.
  function tree(): IConfigurationRoot {
    return rootOf({
      'Server:Host': 'localhost',
      'Server:Port': '8080',
      'Logging:Level:Default': 'Info',
    }) as IConfigurationRoot;
  }

  test("from a root, yields every section's full path (root itself excluded)", () => {
    const pairs = new Map(asEnumerable(tree()));

    // The non-section root is never yielded; intermediate section nodes are
    // (with an undefined value), leaves carry their value.
    expect(pairs.get('Server')).toBeUndefined();
    expect(pairs.get('Server:Host')).toBe('localhost');
    expect(pairs.get('Server:Port')).toBe('8080');
    expect(pairs.get('Logging:Level')).toBeUndefined();
    expect(pairs.get('Logging:Level:Default')).toBe('Info');
    // Intermediate nodes are still enumerated even without a value.
    expect(pairs.has('Server')).toBe(true);
    expect(pairs.has('Logging')).toBe(true);
  });

  test('makePathsRelative=false from a section keeps full paths and yields the section itself', () => {
    const server = tree().getSection('Server');
    const pairs = new Map(asEnumerable(server, false));

    expect(pairs.has('Server')).toBe(true); // the section root IS yielded here
    expect(pairs.get('Server:Host')).toBe('localhost');
    expect(pairs.get('Server:Port')).toBe('8080');
  });

  test('makePathsRelative=true from a section trims the section path and drops its empty key', () => {
    const server = tree().getSection('Server');
    const keys = [...asEnumerable(server, true)].map(([key]) => key).sort();

    // "Server" prefix (plus its delimiter) is trimmed; the now-empty root key
    // is omitted.
    expect(keys).toEqual(['Host', 'Port']);
  });

  test("makePathsRelative=true from a section drops the section's OWN value (empty key)", () => {
    // A section that carries both a direct value and children. In relative mode
    // the enumeration root would map to an empty key, so its own value is
    // omitted; only its descendants are yielded, relative.
    const root = rootOf({
      Server: 'self-value',
      'Server:Host': 'localhost',
    }) as IConfigurationRoot;
    const server = root.getSection('Server');
    expect(server.value).toBe('self-value');

    const pairs = new Map(asEnumerable(server, true));
    expect(pairs.has('')).toBe(false); // the section's own (empty-key) value is dropped
    expect(pairs.get('Host')).toBe('localhost');
  });

  test('makePathsRelative=true from a root is a no-op on paths (root is not a section)', () => {
    // The root is not an IConfigurationSection, so no prefix is trimmed and the
    // root contributes no empty key either.
    const keys = new Set([...asEnumerable(tree(), true)].map(([key]) => key));
    expect(keys.has('Server:Host')).toBe(true);
    expect(keys.has('Server:Port')).toBe(true);
    expect(keys.has('Logging:Level:Default')).toBe(true);
  });

  test('empty configuration yields nothing', () => {
    const root = new ConfigurationBuilder().build() as unknown as IConfigurationRoot;
    expect([...asEnumerable(root)]).toEqual([]);
  });
});
