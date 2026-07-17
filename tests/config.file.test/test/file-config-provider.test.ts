// Behavior tests for the file-configuration base layer -- FileConfigSource
// and FileConfigProvider. Exercised through a minimal concrete provider
// (`key=value` lines) and a FAKE IFileProvider whose change token the test
// fires by hand, so reload is deterministic (no real filesystem watcher, no
// arbitrary sleeps beyond the base's own bounded reloadDelay).
//
// The file bytes still come off a real temp file, because the base reads
// synchronously through IFileInfo.physicalPath (createReadStream is async and
// load() is sync); the fake controls existence and the change token.

import { ConfigBuilder } from '@rhombus-std/config';
import type { IConfigBuilder } from '@rhombus-std/config.core';
import { FileConfigProvider, FileConfigSource, FormatError, InvalidDataError } from '@rhombus-std/config.file';
import '@rhombus-std/config.file';
import type { IDirectoryContents, IFileInfo, IFileProvider } from '@rhombus-std/fileproviders.core';
import { PhysicalFileProvider } from '@rhombus-std/fileproviders.physical';
import type { IChangeToken } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

// -- test doubles ----------------------------------------------------------

/** A change token whose callbacks the test fires on demand. */
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

/** An IFileProvider over one temp file, with controllable existence + a hand-fired watch token. */
class FakeFileProvider implements IFileProvider {
  public exists = true;
  public physicalPath: string | null;
  #currentToken: ManualChangeToken | undefined;
  public watchCount = 0;

  public constructor(physicalPath: string | null) {
    this.physicalPath = physicalPath;
  }

  public getFileInfo(): IFileInfo {
    const provider = this;
    return {
      get exists() {
        return provider.exists;
      },
      length: -1,
      physicalPath: provider.physicalPath,
      name: provider.physicalPath ? basename(provider.physicalPath) : '',
      lastModified: new Date(0),
      isDirectory: false,
      createReadStream(): never {
        throw new Error('not used in these tests');
      },
    };
  }

  public getDirectoryContents(): IDirectoryContents {
    throw new Error('not used in these tests');
  }

  public watch(): IChangeToken {
    this.watchCount++;
    this.#currentToken = new ManualChangeToken();
    return this.#currentToken;
  }

  public triggerChange(): void {
    this.#currentToken?.fire();
  }
}

/** A concrete file provider that parses `key=value` lines; counts loadContent calls. */
class LinesProvider extends FileConfigProvider {
  public loadContentCount = 0;

  protected loadContent(content: string): void {
    this.loadContentCount++;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq < 0) {
        throw new FormatError(`unrecognized line: ${trimmed}`);
      }
      this.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
    }
  }
}

class LinesSource extends FileConfigSource {
  public build(builder: IConfigBuilder): LinesProvider {
    this.ensureDefaults(builder);
    return new LinesProvider(this);
  }
}

// -- fixtures --------------------------------------------------------------

let dir: string | undefined;

afterEach(() => {
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

function tempFile(contents: string): string {
  dir = mkdtempSync(join(tmpdir(), 'rhombus-config-file-'));
  const file = join(dir, 'app.conf');
  writeFileSync(file, contents);
  return file;
}

function sourceOver(fileProvider: IFileProvider, path = 'app.conf'): LinesSource {
  const source = new LinesSource();
  source.fileProvider = fileProvider;
  source.path = path;
  return source;
}

/** A bounded wait longer than the provider's reloadDelay, for a reload to settle. */
function afterReloadDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

// -- tests -----------------------------------------------------------------

describe('FileConfigProvider load', () => {
  test('reads the file through the provider and flattens content', () => {
    const provider = new LinesProvider(sourceOver(new FakeFileProvider(tempFile('a=1\nb=2'))));
    provider.load();

    expect(provider.tryGet('a')).toEqual([true, '1']);
    expect(provider.tryGet('b')).toEqual([true, '2']);
  });

  test('a missing optional file yields an empty provider', () => {
    const fake = new FakeFileProvider(tempFile('a=1'));
    fake.exists = false;
    const source = sourceOver(fake);
    source.optional = true;

    const provider = new LinesProvider(source);
    provider.load();

    expect([...provider.getChildKeys([], undefined)]).toEqual([]);
  });

  test('a missing required file throws with a not-found message', () => {
    const fake = new FakeFileProvider(tempFile('a=1'));
    fake.exists = false;
    const provider = new LinesProvider(sourceOver(fake, 'missing.conf'));

    expect(() => provider.load()).toThrow(/'missing\.conf' was not found and is not optional/);
  });

  test('a provider without a physical path is unsupported for sync load', () => {
    const provider = new LinesProvider(sourceOver(new FakeFileProvider(null)));
    expect(() => provider.load()).toThrow(/no physical path/);
  });

  test('a non-reload parse failure leaves the previous store untouched', () => {
    const file = tempFile('a=1');
    const source = sourceOver(new FakeFileProvider(file));
    const provider = new LinesProvider(source);
    provider.load();
    expect(provider.tryGet('a')).toEqual([true, '1']);

    // A first load already populated `a`; rewrite to a malformed file and load
    // again. Non-reload parse failure must throw (the parser's FormatError
    // wrapped in InvalidDataError) AND keep the prior data.
    writeFileSync(file, 'no-equals-here');
    let thrown: unknown;
    try {
      provider.load();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidDataError);
    expect((thrown as InvalidDataError).cause).toBeInstanceOf(FormatError);
    expect(provider.tryGet('a')).toEqual([true, '1']);
  });
});

describe('FileConfigProvider onLoadError', () => {
  test('a handler that sets ignore=true swallows the error', () => {
    const source = sourceOver(new FakeFileProvider(tempFile('bad-line')));
    source.onLoadError = (ctx) => {
      ctx.ignore = true;
    };
    const provider = new LinesProvider(source);

    expect(() => provider.load()).not.toThrow();
  });

  test('a handler that leaves ignore=false rethrows', () => {
    const source = sourceOver(new FakeFileProvider(tempFile('bad-line')));
    let seen: unknown;
    source.onLoadError = (ctx) => {
      seen = ctx.error;
    };
    const provider = new LinesProvider(source);

    expect(() => provider.load()).toThrow();
    expect(seen).toBeInstanceOf(Error);
  });
});

describe('FileConfigProvider#toString', () => {
  test('includes the path and Required/Optional', () => {
    const required = new LinesProvider(sourceOver(new FakeFileProvider(tempFile('a=1'))));
    expect(required.toString()).toBe("LinesProvider for 'app.conf' (Required)");

    const optionalSource = sourceOver(new FakeFileProvider(tempFile('a=1')));
    optionalSource.optional = true;
    expect(new LinesProvider(optionalSource).toString()).toBe("LinesProvider for 'app.conf' (Optional)");
  });
});

describe('FileConfigProvider reload', () => {
  test('reloads when the watch token fires', async () => {
    const file = tempFile('a=1');
    const fake = new FakeFileProvider(file);
    const source = sourceOver(fake);
    source.reloadOnChange = true;
    source.reloadDelay = 5;

    const provider = new LinesProvider(source);
    provider.load();
    expect(provider.tryGet('a')).toEqual([true, '1']);

    writeFileSync(file, 'a=2\nc=3');
    fake.triggerChange();
    await afterReloadDelay();

    expect(provider.tryGet('a')).toEqual([true, '2']);
    expect(provider.tryGet('c')).toEqual([true, '3']);
  });

  test('a key removed from the file disappears on reload', async () => {
    const file = tempFile('keep=1\ndrop=2');
    const fake = new FakeFileProvider(file);
    const source = sourceOver(fake);
    source.reloadOnChange = true;
    source.reloadDelay = 5;

    const provider = new LinesProvider(source);
    provider.load();

    writeFileSync(file, 'keep=1');
    fake.triggerChange();
    await afterReloadDelay();

    expect(provider.tryGet('keep')).toEqual([true, '1']);
    expect(provider.tryGet('drop')).toEqual([false]);
  });

  test('a required file that vanishes empties the store on reload without throwing', async () => {
    const file = tempFile('a=1');
    const fake = new FakeFileProvider(file);
    const source = sourceOver(fake);
    source.reloadOnChange = true;
    source.reloadDelay = 5;

    const provider = new LinesProvider(source);
    provider.load();
    expect(provider.tryGet('a')).toEqual([true, '1']);

    fake.exists = false;
    fake.triggerChange();
    await afterReloadDelay();

    expect(provider.tryGet('a')).toEqual([false]);
  });

  test('dispose stops further reloads', async () => {
    const file = tempFile('a=1');
    const fake = new FakeFileProvider(file);
    const source = sourceOver(fake);
    source.reloadOnChange = true;
    source.reloadDelay = 5;

    const provider = new LinesProvider(source);
    provider.load();
    const before = provider.loadContentCount;

    provider[Symbol.dispose]();
    writeFileSync(file, 'a=2');
    fake.triggerChange();
    await afterReloadDelay();

    expect(provider.loadContentCount).toBe(before);
    expect(provider.tryGet('a')).toEqual([true, '1']);
  });

  test('two rapid changes coalesce into a single reload', async () => {
    const file = tempFile('a=1');
    const fake = new FakeFileProvider(file);
    const source = sourceOver(fake);
    source.reloadOnChange = true;
    source.reloadDelay = 15;

    const provider = new LinesProvider(source);
    provider.load();
    const reloadsBefore = provider.loadContentCount;

    writeFileSync(file, 'a=2');
    fake.triggerChange();
    fake.triggerChange();
    await afterReloadDelay();

    expect(provider.loadContentCount - reloadsBefore).toBe(1);
    expect(provider.tryGet('a')).toEqual([true, '2']);
  });
});

describe('FileConfigExtensions builder augmentation', () => {
  test('getFileProvider defaults to a cwd-rooted PhysicalFileProvider', () => {
    const builder = new ConfigBuilder();
    expect(builder.getFileProvider()).toBeInstanceOf(PhysicalFileProvider);
  });

  test('setFileProvider / setBasePath round-trip through getFileProvider', () => {
    const builder = new ConfigBuilder();
    const custom = new PhysicalFileProvider(tmpdir());
    builder.setFileProvider(custom);
    expect(builder.getFileProvider()).toBe(custom);

    builder.setBasePath(tmpdir());
    expect(builder.getFileProvider()).toBeInstanceOf(PhysicalFileProvider);
  });

  test('setFileLoadErrorHandler / getFileLoadErrorHandler round-trip', () => {
    const builder = new ConfigBuilder();
    expect(builder.getFileLoadErrorHandler()).toBeUndefined();

    const handler = () => {};
    builder.setFileLoadErrorHandler(handler);
    expect(builder.getFileLoadErrorHandler()).toBe(handler);
  });
});
