// Behavior tests for JsonConfigProvider/Source -- reads a JSON file
// from disk and flattens it into the case-insensitive key/value store shared
// by every ConfigProvider. Migrated from the pre-monorepo
// `test/sources/json-file.test.ts` against the old
// `JsonFileSource`/`ConfigSource` shapes; same fixtures, same assertions --
// exercised here through the ConfigBuilder -> JsonConfigSource
// -> ConfigRoot path.

import { ConfigBuilder, ConfigManager, type IndexedSection } from '@rhombus-std/config';
import { JsonConfigProvider } from '@rhombus-std/config.json';
import { JsonConfigSource, type JsonConfigSourceOptions } from '@rhombus-std/config.json';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Side-effect import: installs `addJsonFile` onto ConfigBuilder.
import '@rhombus-std/config.json';

const FIXTURES = 'test/fixtures/json-file';

/** Builds a root from a single fixture file under {@link FIXTURES}, via the
 * ConfigBuilder -> JsonConfigSource -> ConfigRoot path
 * every test in this file exercises. */
function rootFromFixture(name: string, options?: JsonConfigSourceOptions): IndexedSection {
  return new ConfigBuilder()
    .add(new JsonConfigSource(`${FIXTURES}/${name}`, options))
    .build();
}

describe('JsonConfigProvider', () => {
  test('flattens nested objects into colon-delimited keys', () => {
    const root = rootFromFixture('nested.json');

    expect(root.get('Server:Host')).toBe('localhost');
    expect(root.get('TopLevel')).toBe('value');
  });

  test('string-converts scalar leaves (numbers and booleans)', () => {
    const root = rootFromFixture('nested.json');

    expect(root.get('Server:Port')).toBe('8080');
    expect(root.get('Server:UseTls')).toBe('true');
  });

  test('index-flattens arrays as Key:0, Key:1, ...', () => {
    const root = rootFromFixture('nested.json');

    expect(root.get('Server:Tags:0')).toBe('a');
    expect(root.get('Server:Tags:1')).toBe('b');
  });

  test('skips keys whose value is null', () => {
    const root = rootFromFixture('nested.json');

    expect(root.get('Server:Nullable')).toBeUndefined();
    expect([...root.getSection('Server').getChildren()].some((c) => c.key === 'Nullable'))
      .toBe(false);
  });

  test('recurses into arrays of objects', () => {
    const root = rootFromFixture('array-of-objects.json');

    expect(root.get('Items:0:Name')).toBe('first');
    expect(root.get('Items:0:Count')).toBe('1');
    expect(root.get('Items:1:Name')).toBe('second');
    expect(root.get('Items:1:Count')).toBe('2');
  });

  test('resolves a relative path against process.cwd()', () => {
    expect(() => rootFromFixture('nested.json')).not.toThrow();
  });

  test('throws when the file does not exist and optional is not set', () => {
    expect(() => rootFromFixture('does-not-exist.json')).toThrow();
  });

  test('returns an empty provider when the file is missing and optional is true', () => {
    const root = rootFromFixture('does-not-exist.json', { optional: true });

    expect([...root.getChildren()]).toEqual([]);
  });

  test('throws on malformed JSON even when optional is true', () => {
    expect(() => rootFromFixture('invalid.json', { optional: true })).toThrow();
  });

  test('addJsonFile augmentation registers a JsonConfigSource on the builder', () => {
    const root = new ConfigBuilder()
      .addJsonFile(`${FIXTURES}/nested.json`)
      .build();

    expect(root.get('Server:Host')).toBe('localhost');
  });

  test('addJsonFile installs on ConfigManager, not just ConfigBuilder', () => {
    const manager = new ConfigManager().addJsonFile(`${FIXTURES}/nested.json`);
    expect(manager.get('Server:Host')).toBe('localhost');
  });

  test('addJsonFile honors the optional flag for a missing file', () => {
    const root = new ConfigBuilder()
      .addJsonFile(`${FIXTURES}/does-not-exist.json`, { optional: true })
      .build();

    expect([...root.getChildren()]).toEqual([]);
  });

  test('throws when the JSON root is a scalar', () => {
    // A parse rejection now surfaces wrapped: the file base rethrows the
    // parser's FormatError inside an InvalidDataError (naming the file), so
    // the top-level-element message lives on the error chain, not the top.
    expect(messageChain(catchOf(() => rootFromFixture('scalar.json'))))
      .toMatch(/the top-level JSON element must be an object/);
  });

  test('throws when the JSON root is null', () => {
    expect(messageChain(catchOf(() => rootFromFixture('null-root.json'))))
      .toMatch(/the top-level JSON element must be an object/);
  });

  test('throws when the JSON root is a top-level array', () => {
    expect(messageChain(catchOf(() => rootFromFixture('top-level-array.json'))))
      .toMatch(/the top-level JSON element must be an object/);
  });
});

/** Runs `fn`, returning whatever it threw (or `undefined` if it didn't throw). */
function catchOf(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error;
  }
}

/** Concatenates an error's message with each `cause` message down the chain. */
function messageChain(error: unknown): string {
  let chain = '';
  let current: unknown = error;
  while (current instanceof Error) {
    chain += `${current.message}\n`;
    current = current.cause;
  }
  return chain;
}

describe('JsonConfigProvider#toString', () => {
  test("includes the path and 'Required' when optional is not set", () => {
    const provider = new JsonConfigProvider(new JsonConfigSource(`${FIXTURES}/nested.json`));
    expect(provider.toString()).toBe(`JsonConfigProvider for '${FIXTURES}/nested.json' (Required)`);
  });

  test("says 'Optional' when the source is optional", () => {
    const provider = new JsonConfigProvider(
      new JsonConfigSource(`${FIXTURES}/does-not-exist.json`, { optional: true }),
    );
    expect(provider.toString()).toBe(`JsonConfigProvider for '${FIXTURES}/does-not-exist.json' (Optional)`);
  });
});

describe('JsonConfigProvider reload + error hardening (#17)', () => {
  let dir: string;

  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reload after a key is removed from the file drops the stale key', () => {
    dir = mkdtempSync(join(tmpdir(), 'rhombus-config-json-'));
    const file = join(dir, 'app.json');
    writeFileSync(file, JSON.stringify({ Keep: '1', Drop: '2' }));

    const source = new JsonConfigSource(file);
    const provider = source.build(new ConfigBuilder());
    provider.load();
    expect(provider.tryGet('Keep')).toEqual([true, '1']);
    expect(provider.tryGet('Drop')).toEqual([true, '2']);

    writeFileSync(file, JSON.stringify({ Keep: '1' }));
    provider.load();

    expect(provider.tryGet('Keep')).toEqual([true, '1']);
    // Without data.clear() on load, the removed key would linger.
    expect(provider.tryGet('Drop')).toEqual([false]);
  });

  test('malformed JSON error message includes the resolved path', () => {
    dir = mkdtempSync(join(tmpdir(), 'rhombus-config-json-'));
    const file = join(dir, 'bad.json');
    writeFileSync(file, '{ not valid json');

    const provider = new JsonConfigSource(file).build(new ConfigBuilder());
    expect(() => provider.load()).toThrow(new RegExp(file.replace(/[.\\]/g, '\\$&')));
  });
});
