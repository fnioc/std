// Behavior tests for @rhombus-std/config.ini. The grammar is exercised through
// the in-memory stream source (no filesystem), and the file wiring +
// addIniFile augmentation through a real temp file. Reload/optional/error-
// routing are inherited from the config.file base (covered in config.file.test),
// so only a wiring smoke test lives here.

import { ConfigurationBuilder, type IndexedSection } from '@rhombus-std/config';
import { IniStreamConfigurationSource } from '@rhombus-std/config.ini';
import '@rhombus-std/config.ini';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Builds a root from an in-memory INI payload. */
function fromIni(text: string): IndexedSection {
  return new ConfigurationBuilder().add(new IniStreamConfigurationSource(text)).build();
}

describe('INI grammar', () => {
  test('flattens keys and prefixes them with the section header', () => {
    const root = fromIni('[Section:Header]\nkey1=value1\nkey2=value2');

    expect(root.get('Section:Header:key1')).toBe('value1');
    expect(root.get('Section:Header:key2')).toBe('value2');
  });

  test('a key outside any section takes no prefix', () => {
    const root = fromIni('bare=1');
    expect(root.get('bare')).toBe('1');
  });

  test('skips blank lines and ; # / comments', () => {
    const root = fromIni('; a comment\n# another\n/ and another\n\nkept=yes');

    expect(root.get('kept')).toBe('yes');
  });

  test('trims key and value around the first =', () => {
    const root = fromIni('  key   =   value  ');
    expect(root.get('key')).toBe('value');
  });

  test('splits on the FIRST = so a value may contain =', () => {
    const root = fromIni('conn=Server=localhost;Db=app');
    expect(root.get('conn')).toBe('Server=localhost;Db=app');
  });

  test('strips one surrounding pair of double quotes, keeping inner spaces', () => {
    const root = fromIni('key=" value "');
    expect(root.get('key')).toBe(' value ');
  });

  test('throws on a line with no =', () => {
    expect(() => fromIni('no-equals-here')).toThrow(/Unrecognized INI line format/);
  });

  test('throws on a duplicate resolved key', () => {
    expect(() => fromIni('[S]\nk=1\nk=2')).toThrow(/duplicate key/i);
  });
});

describe('IniConfigurationSource file wiring', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  test('addIniFile reads an INI file relative to the builder base path', () => {
    dir = mkdtempSync(join(tmpdir(), 'rhombus-config-ini-'));
    writeFileSync(join(dir, 'app.ini'), '[Server]\nHost=localhost\nPort=8080');

    const root = new ConfigurationBuilder()
      .setBasePath(dir)
      .addIniFile('app.ini')
      .build();

    expect(root.get('Server:Host')).toBe('localhost');
    expect(root.get('Server:Port')).toBe('8080');
  });

  test('a missing optional INI file yields no keys', () => {
    dir = mkdtempSync(join(tmpdir(), 'rhombus-config-ini-'));

    const root = new ConfigurationBuilder()
      .setBasePath(dir)
      .addIniFile('missing.ini', { optional: true })
      .build();

    expect([...root.getChildren()]).toEqual([]);
  });
});
