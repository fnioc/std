// Cross-format layering, run against the BUILT DIST of every package (under
// `node`, whose import/default condition resolves each `@rhombus-std/config.*`
// bare import to its `dist/index.js`). Exercises the JSON + INI + XML providers
// TOGETHER on one builder: their add* augmentations must all be installed on
// the shared dist ConfigurationBuilder (each survived bundling with
// @rhombus-std/config kept external, and its `declare module` survived
// rollup-plugin-dts), and later sources must override earlier ones.
//
// In-memory stream payloads are used so the test needs no fixture files.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ConfigurationBuilder } from '@rhombus-std/config';
// Bare side-effect imports: install addJsonStream / addIniStream / addXmlStream
// onto ConfigurationBuilder.prototype from each provider's built dist.
import '@rhombus-std/config.ini';
import '@rhombus-std/config.json';
import '@rhombus-std/config.xml';

describe('layering: JSON + INI + XML on one builder (built dist)', () => {
  test('all three stream augmentations are installed on the dist ConfigurationBuilder', () => {
    const builder = new ConfigurationBuilder();
    assert.equal(typeof builder.addJsonStream, 'function');
    assert.equal(typeof builder.addIniStream, 'function');
    assert.equal(typeof builder.addXmlStream, 'function');
  });

  test('a later source overrides a shared key while format-specific keys survive', () => {
    const config = new ConfigurationBuilder()
      .addJsonStream('{ "Shared": "json", "OnlyJson": "j" }')
      .addIniStream('Shared=ini\nOnlyIni=i')
      .addXmlStream('<settings><Shared>xml</Shared><OnlyXml>x</OnlyXml></settings>')
      .build();

    // XML is last, so it wins the shared key.
    assert.equal(config.get('Shared'), 'xml');
    // Each format's own key is present.
    assert.equal(config.get('OnlyJson'), 'j');
    assert.equal(config.get('OnlyIni'), 'i');
    assert.equal(config.get('OnlyXml'), 'x');
  });

  test('reordering the sources changes which value wins the shared key', () => {
    const config = new ConfigurationBuilder()
      .addXmlStream('<settings><Shared>xml</Shared></settings>')
      .addIniStream('Shared=ini')
      .addJsonStream('{ "Shared": "json" }')
      .build();

    // JSON is last here, so it wins.
    assert.equal(config.get('Shared'), 'json');
  });
});
