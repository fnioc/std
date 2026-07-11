// Layered-source integration, run against the BUILT DIST of every package
// (these run under `node`, whose import/default export condition resolves
// each `@rhombus-std/config.*` bare import to its `dist/index.js` -- the artefact
// a real consumer gets). This exercises the full provider-augmentation surface
// together: addJsonFile / addEnvironmentVariables / addCommandLine, each bolted
// onto the shared ConfigurationBuilder via its own `declare module` + prototype
// patch. If that augmentation didn't survive bundling, these methods wouldn't
// exist on the dist copy of ConfigurationBuilder and every test below would
// throw.
//
// Environment variables are supplied through the injected `env` map (#16), so
// these tests never touch the ambient `process.env`.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { ConfigurationBuilder } from '@rhombus-std/config';
// Bare side-effect imports: install addJsonFile / addEnvironmentVariables /
// addCommandLine onto ConfigurationBuilder.prototype from each provider's
// built dist.
import '@rhombus-std/config.json';
import '@rhombus-std/config.env';
import '@rhombus-std/config.commandline';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'config-builder');

describe('layering: addJsonFile / addEnvironmentVariables / addCommandLine (built dist)', () => {
  test('a later JSON file overlay overrides specific keys while leaving others untouched', () => {
    const config = new ConfigurationBuilder()
      .addJsonFile(`${FIXTURES}/base.json`)
      .addJsonFile(`${FIXTURES}/overlay.json`)
      .build();

    assert.equal(config.get('Server:Port'), '9090');
    assert.equal(config.get('Server:Host'), 'localhost');
    assert.equal(config.get('Logging:Level'), 'Info');
  });

  test('environment variables override JSON', () => {
    const config = new ConfigurationBuilder()
      .addJsonFile(`${FIXTURES}/base.json`)
      .addJsonFile(`${FIXTURES}/overlay.json`)
      .addEnvironmentVariables({ prefix: 'APP_', env: { APP_Server__Port: '7070' } })
      .build();

    assert.equal(config.get('Server:Port'), '7070');
    assert.equal(config.get('Server:Host'), 'localhost');
  });

  test('a conventionally-uppercase env var overrides a JSON key across a layered merge', () => {
    const config = new ConfigurationBuilder()
      .addJsonFile(`${FIXTURES}/base.json`)
      .addJsonFile(`${FIXTURES}/overlay.json`)
      .addEnvironmentVariables({ prefix: 'APP_', env: { APP_SERVER__PORT: '7070' } })
      .build();

    assert.equal(config.get('Server:Port'), '7070');
    // Same, seen through a typed section-scoped build (case-insensitive resolution).
    const typed = new ConfigurationBuilder()
      .addJsonFile(`${FIXTURES}/base.json`)
      .addJsonFile(`${FIXTURES}/overlay.json`)
      .addEnvironmentVariables({ prefix: 'APP_', env: { APP_SERVER__PORT: '7070' } })
      .withSchema({ Server: { Port: 'number' } })
      .build();
    assert.equal(typed.Server.Port, 7070);

    assert.equal(config.get('Server:Host'), 'localhost');
  });

  test('a conventionally-uppercase env var overrides a differently-cased JSON key', () => {
    const config = new ConfigurationBuilder()
      .addJsonFile(`${FIXTURES}/server-port-only.json`)
      .addEnvironmentVariables({ prefix: 'APP_', env: { APP_SERVER__PORT: '9999' } })
      .build();

    assert.equal(config.get('Server:Port'), '9999');
  });

  test('command line overrides both JSON and environment variables', () => {
    const config = new ConfigurationBuilder()
      .addJsonFile(`${FIXTURES}/base.json`)
      .addJsonFile(`${FIXTURES}/overlay.json`)
      .addEnvironmentVariables({ prefix: 'APP_', env: { APP_Server__Port: '7070' } })
      .addCommandLine(['--Server:Port', '6060'])
      .build();

    assert.equal(config.get('Server:Port'), '6060');
    assert.equal(config.get('Server:Host'), 'localhost');
    assert.equal(config.get('Logging:Level'), 'Info');
  });

  test("an optional JSON file that's absent doesn't throw and doesn't affect the merge", () => {
    const config = new ConfigurationBuilder()
      .addJsonFile(`${FIXTURES}/base.json`)
      .addJsonFile(`${FIXTURES}/does-not-exist.json`, { optional: true })
      .build();

    assert.equal(config.get('Server:Host'), 'localhost');
    assert.equal(config.get('Server:Port'), '8080');
    assert.equal(config.get('Logging:Level'), 'Info');
  });
});
