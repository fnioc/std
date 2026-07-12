// Behavior tests for PhysicalFileProvider's read-only surface: getFileInfo /
// getDirectoryContents over real temp directories, the escape guards
// (absolute, above-root, excluded), createReadStream round-tripping bytes, and
// the polling-env default. Temp dirs are created per-test and removed after.

import { NotFoundDirectoryContents, NotFoundFileInfo } from '@rhombus-std/fileproviders.core';
import { ExclusionFilters, PhysicalFileInfo, PhysicalFileProvider } from '@rhombus-std/fileproviders.physical';
import type { ReadableStream } from '@rhombus-std/primitives';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fp-physical-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

describe('PhysicalFileProvider constructor', () => {
  test('rejects a relative root', () => {
    expect(() => new PhysicalFileProvider('relative/dir')).toThrow('absolute');
  });

  test('exposes the resolved root with a trailing separator', () => {
    const provider = new PhysicalFileProvider(root);
    expect(provider.root.startsWith(root)).toBe(true);
    expect(provider.root.endsWith('/')).toBe(true);
  });
});

describe('PhysicalFileProvider.getFileInfo', () => {
  test('returns a PhysicalFileInfo for an existing file', () => {
    writeFileSync(join(root, 'a.txt'), 'hello');
    const provider = new PhysicalFileProvider(root);

    const info = provider.getFileInfo('a.txt');
    expect(info).toBeInstanceOf(PhysicalFileInfo);
    expect(info.exists).toBe(true);
    expect(info.isDirectory).toBe(false);
    expect(info.length).toBe(5);
    expect(info.name).toBe('a.txt');
    expect(info.physicalPath).toBe(join(root, 'a.txt'));
  });

  test('returns a non-existent PhysicalFileInfo for a missing (but valid) file', () => {
    const provider = new PhysicalFileProvider(root);

    const info = provider.getFileInfo('missing.txt');
    expect(info.exists).toBe(false);
    expect(info.length).toBe(-1);
  });

  test('returns NotFoundFileInfo for an empty subpath', () => {
    const provider = new PhysicalFileProvider(root);
    expect(provider.getFileInfo('')).toBeInstanceOf(NotFoundFileInfo);
  });

  test('treats a leading-slash subpath as relative to the root (never escaping it)', () => {
    // Mirroring the reference: leading separators are trimmed, so `/etc/passwd`
    // resolves to `<root>/etc/passwd` -- a miss under the root, not the real
    // system file.
    const provider = new PhysicalFileProvider(root);
    const info = provider.getFileInfo('/etc/passwd');
    expect(info.exists).toBe(false);
    expect(info.physicalPath?.startsWith(provider.root)).toBe(true);
  });

  test('returns NotFoundFileInfo for a path that escapes the root', () => {
    const provider = new PhysicalFileProvider(root);
    expect(provider.getFileInfo('../outside.txt')).toBeInstanceOf(NotFoundFileInfo);
  });

  test('excludes a dot-prefixed file under the default Sensitive filters', () => {
    writeFileSync(join(root, '.hidden'), 'secret');
    const provider = new PhysicalFileProvider(root);
    expect(provider.getFileInfo('.hidden')).toBeInstanceOf(NotFoundFileInfo);
  });

  test('includes a dot-prefixed file when filters are None', () => {
    writeFileSync(join(root, '.hidden'), 'secret');
    const provider = new PhysicalFileProvider(root, ExclusionFilters.None);
    expect(provider.getFileInfo('.hidden').exists).toBe(true);
  });
});

describe('PhysicalFileProvider.getDirectoryContents', () => {
  test('enumerates the directory, filtering excluded entries', () => {
    writeFileSync(join(root, 'one.txt'), '1');
    writeFileSync(join(root, 'two.txt'), '2');
    writeFileSync(join(root, '.hidden'), 'x');
    mkdirSync(join(root, 'sub'));
    const provider = new PhysicalFileProvider(root);

    const contents = provider.getDirectoryContents('');
    expect(contents.exists).toBe(true);
    const names = [...contents].map((f) => f.name).sort();
    expect(names).toEqual(['one.txt', 'sub', 'two.txt']);
  });

  test('marks a subdirectory entry as a directory', () => {
    mkdirSync(join(root, 'sub'));
    const provider = new PhysicalFileProvider(root);

    const entries = [...provider.getDirectoryContents('')];
    const sub = entries.find((e) => e.name === 'sub');
    expect(sub?.isDirectory).toBe(true);
    expect(sub?.length).toBe(-1);
  });

  test('returns the not-found singleton for a missing directory', () => {
    const provider = new PhysicalFileProvider(root);
    expect(provider.getDirectoryContents('missing')).toBe(NotFoundDirectoryContents.singleton);
  });

  test('returns the not-found singleton for an above-root path', () => {
    const provider = new PhysicalFileProvider(root);
    expect(provider.getDirectoryContents('../..')).toBe(NotFoundDirectoryContents.singleton);
  });
});

describe('PhysicalFileInfo.createReadStream', () => {
  test('round-trips the written file contents', async () => {
    const payload = 'the quick brown fox\n'.repeat(100);
    writeFileSync(join(root, 'big.txt'), payload);
    const provider = new PhysicalFileProvider(root);

    const info = provider.getFileInfo('big.txt');
    const text = await readAll(info.createReadStream());
    expect(text).toBe(payload);
  });
});

describe('PhysicalFileProvider polling defaults', () => {
  const KEY = 'RHOMBUS_STD_USE_POLLING_FILE_WATCHER';

  afterEach(() => {
    delete process.env[KEY];
  });

  test('defaults usePollingFileWatcher/useActivePolling to false without the env var', () => {
    delete process.env[KEY];
    const provider = new PhysicalFileProvider(root);
    expect(provider.usePollingFileWatcher).toBe(false);
    expect(provider.useActivePolling).toBe(false);
  });

  test('enables polling when the env var is "1"', () => {
    process.env[KEY] = '1';
    const provider = new PhysicalFileProvider(root);
    expect(provider.usePollingFileWatcher).toBe(true);
    expect(provider.useActivePolling).toBe(true);
  });

  test('enables polling when the env var is "true" (case-insensitive)', () => {
    process.env[KEY] = 'TRUE';
    const provider = new PhysicalFileProvider(root);
    expect(provider.usePollingFileWatcher).toBe(true);
  });

  test('an explicit setter overrides the env default', () => {
    process.env[KEY] = '1';
    const provider = new PhysicalFileProvider(root);
    provider.usePollingFileWatcher = false;
    expect(provider.usePollingFileWatcher).toBe(false);
  });
});
