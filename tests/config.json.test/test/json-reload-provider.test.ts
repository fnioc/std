// Reload + provider-backed coverage for JsonConfigSource now that it
// derives from the config.file base. The generic file-base mechanics (debounce,
// dispose, error routing) are proven in config.file.test; these tests assert
// the JSON-specific slice: the read flows through an injected IFileProvider,
// a reload re-parses the JSON, and the default (no provider) stays cwd-relative.
//
// Reload is driven by a FAKE provider with a hand-fired change token, so it's
// deterministic and fast (no real filesystem watcher, no 4-second poll).

import { ConfigBuilder } from '@rhombus-std/config';
import { JsonConfigSource } from '@rhombus-std/config.json/private/JsonConfigSource';
import '@rhombus-std/config.json/private/index';
import type { IDirectoryContents, IFileInfo, IFileProvider } from '@rhombus-std/fileproviders.core';
import { PhysicalFileProvider } from '@rhombus-std/fileproviders.physical';
import type { IChangeToken } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const FIXTURES = 'test/fixtures/json-file';

let dir: string | undefined;

afterEach(() => {
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

function tempDirWith(fileName: string, contents: string): { dir: string; file: string; } {
  dir = mkdtempSync(join(tmpdir(), 'rhombus-config-json-reload-'));
  const file = join(dir, fileName);
  writeFileSync(file, contents);
  return { dir, file };
}

// -- fake provider with a hand-fired change token --------------------------

class ManualChangeToken implements IChangeToken {
  public hasChanged = false;
  public readonly activeChangeCallbacks = true;
  readonly #callbacks: Func<[state: unknown], void>[] = [];

  public registerChangeCallback(callback: Func<[state: unknown], void>): Disposable {
    this.#callbacks.push(callback);
    return { [Symbol.dispose]() {} };
  }

  public fire(): void {
    this.hasChanged = true;
    for (const callback of [...this.#callbacks]) {
      callback(undefined);
    }
  }
}

class FakeFileProvider implements IFileProvider {
  readonly #physicalPath: string;
  #token: ManualChangeToken | undefined;

  public constructor(physicalPath: string) {
    this.#physicalPath = physicalPath;
  }

  public getFileInfo(): IFileInfo {
    const path = this.#physicalPath;
    return {
      exists: true,
      length: -1,
      physicalPath: path,
      name: basename(path),
      lastModified: new Date(0),
      isDirectory: false,
      createReadStream(): never {
        throw new Error('unused');
      },
    };
  }

  public getDirectoryContents(): IDirectoryContents {
    throw new Error('unused');
  }

  public watch(): IChangeToken {
    this.#token = new ManualChangeToken();
    return this.#token;
  }

  public triggerChange(): void {
    this.#token?.fire();
  }
}

function afterReloadDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

// -- tests -----------------------------------------------------------------

describe('JsonConfigSource provider-backed read', () => {
  test('reads the file through an injected file provider', () => {
    const { dir: root } = tempDirWith('app.json', JSON.stringify({ Server: { Host: 'injected' } }));
    const root2 = new ConfigBuilder()
      .add(new JsonConfigSource('app.json', { fileProvider: new PhysicalFileProvider(root) }))
      .build();

    expect(root2.get('Server:Host')).toBe('injected');
  });

  test('a relative path with no provider stays cwd-relative (back-compat)', () => {
    const root = new ConfigBuilder()
      .add(new JsonConfigSource(`${FIXTURES}/nested.json`, { optional: true }))
      .build();

    expect(root.get('Server:Host')).toBe('localhost');
  });
});

describe('JsonConfigSource reloadOnChange', () => {
  test('re-parses the JSON when the watch token fires', async () => {
    const { file } = tempDirWith('app.json', JSON.stringify({ Value: 'one' }));
    const fake = new FakeFileProvider(file);

    const root = new ConfigBuilder()
      .add(new JsonConfigSource('app.json', { fileProvider: fake, reloadOnChange: true, reloadDelay: 5 }))
      .build();
    expect(root.get('Value')).toBe('one');

    writeFileSync(file, JSON.stringify({ Value: 'two', Added: 'yes' }));
    fake.triggerChange();
    await afterReloadDelay();

    expect(root.get('Value')).toBe('two');
    expect(root.get('Added')).toBe('yes');
  });
});
