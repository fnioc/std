// Behavior tests for @rhombus-std/config.xml. The grammar/tokenizer is exercised
// through the in-memory stream source (no filesystem); the file wiring +
// addXmlFile augmentation through a real temp file. Reload/optional/error
// routing are inherited from the config.file base (config.file.test).

import { ConfigurationBuilder, type IndexedSection } from '@rhombus-std/config';
import { XmlStreamConfigurationSource } from '@rhombus-std/config.xml';
import '@rhombus-std/config.xml';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Builds a root from an in-memory XML payload. */
function fromXml(text: string): IndexedSection {
  return new ConfigurationBuilder().add(new XmlStreamConfigurationSource(text)).build();
}

describe('XML grammar', () => {
  test('nested elements flatten into colon-delimited keys (root name dropped)', () => {
    const root = fromXml('<settings><Server><Host>localhost</Host><Port>8080</Port></Server></settings>');

    expect(root.get('Server:Host')).toBe('localhost');
    expect(root.get('Server:Port')).toBe('8080');
  });

  test('attributes map to element:AttrName', () => {
    const root = fromXml('<settings><Server Port="8080" Scheme="https" /></settings>');

    expect(root.get('Server:Port')).toBe('8080');
    expect(root.get('Server:Scheme')).toBe('https');
  });

  test('a case-insensitive Name attribute contributes an extra path segment and is also emitted', () => {
    const root = fromXml('<settings><Endpoint name="primary"><Url>http://a</Url></Endpoint></settings>');

    expect(root.get('Endpoint:primary:Url')).toBe('http://a');
    // The reference reads Name both for the prefix and as an ordinary attribute,
    // so the `<prefix>:Name` pair is produced too (keys are case-insensitive).
    expect(root.get('Endpoint:primary:Name')).toBe('primary');
  });

  test('repeated sibling elements get a numeric index segment', () => {
    const root = fromXml('<settings><Item>a</Item><Item>b</Item></settings>');

    expect(root.get('Item:0')).toBe('a');
    expect(root.get('Item:1')).toBe('b');
  });

  test('distinct Name attributes are not indexed as siblings', () => {
    const root = fromXml('<settings><Item Name="x">1</Item><Item Name="y">2</Item></settings>');

    expect(root.get('Item:x')).toBe('1');
    expect(root.get('Item:y')).toBe('2');
  });

  test('a root Name attribute prefixes every key and is emitted at prefix:Name', () => {
    const root = fromXml('<settings Name="app"><Key>v</Key></settings>');

    expect(root.get('app:Key')).toBe('v');
    expect(root.get('app:Name')).toBe('app');
  });

  test('a root attribute (non-Name) maps to a top-level key', () => {
    const root = fromXml('<settings Version="1"><Key>v</Key></settings>');

    expect(root.get('Version')).toBe('1');
    expect(root.get('Key')).toBe('v');
  });

  test('CDATA is treated as verbatim text', () => {
    const root = fromXml('<settings><Raw><![CDATA[a<b>&c]]></Raw></settings>');

    expect(root.get('Raw')).toBe('a<b>&c');
  });

  test('expands the five predefined entities in text', () => {
    const root = fromXml('<settings><K>a &lt; b &amp; c &gt; d &quot;e&quot; &apos;f&apos;</K></settings>');

    expect(root.get('K')).toBe('a < b & c > d "e" \'f\'');
  });

  test('an empty element yields an empty-string value; a self-closing one yields nothing', () => {
    const root = fromXml('<settings><Empty></Empty><SelfClose /></settings>');

    expect(root.get('Empty')).toBe('');
    expect(root.get('SelfClose')).toBeUndefined();
  });

  test('ignores the XML declaration, comments, and processing instructions', () => {
    const root = fromXml(
      '<?xml version="1.0"?><!-- a comment --><settings><?pi data?><Key>v</Key></settings>',
    );

    expect(root.get('Key')).toBe('v');
  });

  test('a namespaced element name is rejected', () => {
    expect(() => fromXml('<settings><ns:Key>v</ns:Key></settings>')).toThrow(/namespaces are not supported/);
  });

  test('a namespaced attribute name is rejected', () => {
    expect(() => fromXml('<settings><Key ns:attr="v">x</Key></settings>')).toThrow(/namespaces are not supported/);
  });

  test('a DTD is prohibited', () => {
    expect(() => fromXml('<!DOCTYPE settings><settings><Key>v</Key></settings>')).toThrow(/DTD is prohibited/);
  });

  test('an undefined entity is rejected', () => {
    expect(() => fromXml('<settings><K>&bogus;</K></settings>')).toThrow(/entity/i);
  });

  test('a duplicate resolved key is rejected', () => {
    // The root attribute `Key` and the child element `<Key>` both resolve to
    // the key "Key" -- a collision, unlike repeated siblings (which index).
    expect(() => fromXml('<settings Key="1"><Key>2</Key></settings>'))
      .toThrow(/duplicate key/i);
  });
});

describe('XmlConfigurationSource file wiring', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  test('addXmlFile reads an XML file relative to the builder base path', () => {
    dir = mkdtempSync(join(tmpdir(), 'rhombus-config-xml-'));
    writeFileSync(join(dir, 'app.xml'), '<settings><Server><Host>localhost</Host></Server></settings>');

    const root = new ConfigurationBuilder()
      .setBasePath(dir)
      .addXmlFile('app.xml')
      .build();

    expect(root.get('Server:Host')).toBe('localhost');
  });

  test('a missing optional XML file yields no keys', () => {
    dir = mkdtempSync(join(tmpdir(), 'rhombus-config-xml-'));

    const root = new ConfigurationBuilder()
      .setBasePath(dir)
      .addXmlFile('missing.xml', { optional: true })
      .build();

    expect([...root.getChildren()]).toEqual([]);
  });
});
