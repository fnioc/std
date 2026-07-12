// Behavior tests for CompositeFileProvider.getFileInfo / getDirectoryContents
// and the CompositeDirectoryContents it returns. The load-bearing parts:
// getFileInfo returns the FIRST existing file and falls through to
// NotFoundFileInfo when none exists; getDirectoryContents MERGES the contents
// of every provider that has the directory, de-duplicating by name with the
// first provider winning; and CompositeDirectoryContents initializes lazily
// and reports `exists` only after at least one provider matched.

import { CompositeDirectoryContents, CompositeFileProvider } from '@rhombus-std/fileproviders.composite';
import { type IDirectoryContents, type IFileInfo, type IFileProvider, NotFoundDirectoryContents, NotFoundFileInfo,
  NullChangeToken } from '@rhombus-std/fileproviders.core';
import type { IChangeToken } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

// A minimal existing IFileInfo carrying only an identity name -- enough to
// assert which provider a lookup resolved to.
class StubFileInfo implements IFileInfo {
  readonly exists = true;
  readonly length = 0;
  readonly physicalPath: string | null = null;
  readonly lastModified = new Date(0);
  readonly isDirectory = false;

  constructor(public readonly name: string, public readonly tag: string) {}

  createReadStream(): never {
    throw new Error('not needed for these tests');
  }
}

// An in-memory directory contents over a fixed set of file infos.
class StubDirectoryContents implements IDirectoryContents {
  readonly #files: IFileInfo[];

  constructor(public readonly exists: boolean, files: IFileInfo[]) {
    this.#files = files;
  }

  *[Symbol.iterator](): Generator<IFileInfo> {
    yield* this.#files;
  }
}

// A provider backed by fixed maps of files/directories keyed by subpath.
class StubProvider implements IFileProvider {
  readonly #files: Map<string, IFileInfo>;
  readonly #directories: Map<string, IFileInfo[]>;

  constructor(files: Map<string, IFileInfo>, directories: Map<string, IFileInfo[]>) {
    this.#files = files;
    this.#directories = directories;
  }

  getFileInfo(subpath: string): IFileInfo {
    return this.#files.get(subpath) ?? new NotFoundFileInfo(subpath);
  }

  getDirectoryContents(subpath: string): IDirectoryContents {
    const files = this.#directories.get(subpath);
    if (files === undefined) {
      return NotFoundDirectoryContents.singleton;
    }
    return new StubDirectoryContents(true, files);
  }

  watch(_filter: string): IChangeToken {
    return NullChangeToken.singleton;
  }
}

function providerWithFile(name: string, tag: string): StubProvider {
  return new StubProvider(new Map([[name, new StubFileInfo(name, tag)]]), new Map());
}

function providerWithDir(subpath: string, files: IFileInfo[]): StubProvider {
  return new StubProvider(new Map(), new Map([[subpath, files]]));
}

describe('CompositeFileProvider.getFileInfo', () => {
  test('returns the first existing file across providers', () => {
    const provider = new CompositeFileProvider(
      providerWithFile('a.txt', 'first'),
      providerWithFile('a.txt', 'second'),
    );

    const info = provider.getFileInfo('a.txt') as StubFileInfo;
    expect(info.exists).toBe(true);
    expect(info.tag).toBe('first');
  });

  test('falls through to NotFoundFileInfo when no provider has the file', () => {
    const provider = new CompositeFileProvider(
      providerWithFile('a.txt', 'first'),
      providerWithFile('b.txt', 'second'),
    );

    const info = provider.getFileInfo('missing.txt');
    expect(info).toBeInstanceOf(NotFoundFileInfo);
    expect(info.exists).toBe(false);
    expect(info.name).toBe('missing.txt');
  });
});

describe('CompositeFileProvider.getDirectoryContents', () => {
  test('merges the contents of every provider that has the directory', () => {
    const first = providerWithDir('sub', [new StubFileInfo('one.txt', 'first')]);
    const second = providerWithDir('sub', [new StubFileInfo('two.txt', 'second')]);
    const provider = new CompositeFileProvider(first, second);

    const contents = provider.getDirectoryContents('sub');
    expect(contents.exists).toBe(true);
    expect([...contents].map((f) => f.name).sort()).toEqual(['one.txt', 'two.txt']);
  });

  test('de-duplicates by name -- the first provider wins', () => {
    const first = providerWithDir('sub', [new StubFileInfo('dup.txt', 'first')]);
    const second = providerWithDir('sub', [
      new StubFileInfo('dup.txt', 'second'),
      new StubFileInfo('unique.txt', 'second'),
    ]);
    const provider = new CompositeFileProvider(first, second);

    const entries = [...provider.getDirectoryContents('sub')] as StubFileInfo[];
    const dup = entries.find((f) => f.name === 'dup.txt');
    expect(dup?.tag).toBe('first');
    // Both distinct names present, dup counted once.
    expect(entries.map((f) => f.name).sort()).toEqual(['dup.txt', 'unique.txt']);
  });

  test('reports exists=false when no provider has the directory', () => {
    const provider = new CompositeFileProvider(
      providerWithDir('other', [new StubFileInfo('x.txt', 'first')]),
    );

    const contents = provider.getDirectoryContents('missing');
    expect(contents.exists).toBe(false);
    expect([...contents]).toEqual([]);
  });
});

describe('CompositeDirectoryContents', () => {
  test('initializes lazily -- providers are not consulted until iterated or exists is read', () => {
    let consulted = 0;
    const provider: IFileProvider = {
      getFileInfo: (subpath) => new NotFoundFileInfo(subpath),
      getDirectoryContents: (subpath) => {
        consulted++;
        return new StubDirectoryContents(true, [new StubFileInfo('x.txt', 'p')]);
      },
      watch: () => NullChangeToken.singleton,
    };

    const contents = new CompositeDirectoryContents([provider], 'sub');
    expect(consulted).toBe(0);

    expect(contents.exists).toBe(true);
    expect(consulted).toBe(1);

    // A subsequent enumeration reuses the cached directory init, not re-consulting.
    expect([...contents].map((f) => f.name)).toEqual(['x.txt']);
    expect(consulted).toBe(1);
  });
});
