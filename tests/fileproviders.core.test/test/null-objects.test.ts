// Behavior tests for the null-object abstractions ME.FileProviders ships
// alongside its interfaces: NotFoundFileInfo, NotFoundDirectoryContents,
// NullChangeToken, and NullFileProvider. These have no dedicated coverage
// elsewhere -- this suite pins their "represents nothing" contracts.

import { NotFoundDirectoryContents, NotFoundFileInfo, NullChangeToken,
  NullFileProvider } from '@rhombus-std/fileproviders.core';
import { describe, expect, test } from 'bun:test';

describe('NotFoundFileInfo', () => {
  test('reports a nonexistent, non-directory file with -1 length', () => {
    const info = new NotFoundFileInfo('missing.txt');

    expect(info.exists).toBe(false);
    expect(info.isDirectory).toBe(false);
    expect(info.length).toBe(-1);
    expect(info.name).toBe('missing.txt');
    expect(info.physicalPath).toBeNull();
  });

  test('lastModified is the epoch sentinel', () => {
    const info = new NotFoundFileInfo('missing.txt');

    expect(info.lastModified.getTime()).toBe(0);
  });

  test('createReadStream throws, naming the missing file', () => {
    const info = new NotFoundFileInfo('missing.txt');

    expect(() => info.createReadStream()).toThrow('missing.txt');
  });
});

describe('NotFoundDirectoryContents', () => {
  test('exposes a shared singleton that does not exist', () => {
    expect(NotFoundDirectoryContents.singleton).toBeInstanceOf(NotFoundDirectoryContents);
    expect(NotFoundDirectoryContents.singleton.exists).toBe(false);
  });

  test('iterates as an empty collection', () => {
    expect([...NotFoundDirectoryContents.singleton]).toEqual([]);
  });
});

describe('NullChangeToken', () => {
  test('never reports a change and raises no active callbacks', () => {
    expect(NullChangeToken.singleton.hasChanged).toBe(false);
    expect(NullChangeToken.singleton.activeChangeCallbacks).toBe(false);
  });

  test('registerChangeCallback never invokes the callback and returns a disposable', () => {
    let called = false;
    const disposable = NullChangeToken.singleton.registerChangeCallback(() => {
      called = true;
    });

    expect(called).toBe(false);
    // The returned disposable is a no-op -- disposing it must not throw.
    expect(() => disposable[Symbol.dispose]()).not.toThrow();
  });
});

describe('NullFileProvider', () => {
  test('every file lookup misses', () => {
    const provider = new NullFileProvider();
    const info = provider.getFileInfo('anything.txt');

    expect(info).toBeInstanceOf(NotFoundFileInfo);
    expect(info.exists).toBe(false);
    expect(info.name).toBe('anything.txt');
  });

  test('every directory lookup returns the not-found singleton', () => {
    const provider = new NullFileProvider();

    expect(provider.getDirectoryContents('any/dir')).toBe(NotFoundDirectoryContents.singleton);
  });

  test('watch returns the NullChangeToken singleton', () => {
    const provider = new NullFileProvider();

    expect(provider.watch('**/*')).toBe(NullChangeToken.singleton);
  });
});
