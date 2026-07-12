// PhysicalFileInfo -- ported from
// ME.FileProviders.Physical.PhysicalFileInfo.
//
// Wraps an on-disk path and reads its metadata lazily via a single `statSync`.
// Two mappings differ from the reference:
//   - `DateTimeOffset LastModified` maps to the built-in `Date` (as in
//     fileproviders.core's IFileInfo).
//   - `System.IO.Stream CreateReadStream()` maps to a web
//     `ReadableStream<Uint8Array>` -- the ESNext analog of a read-only byte
//     stream (DEVIATION, flagged). The stream reads fixed-size chunks off the
//     file descriptor on demand and closes the descriptor when drained or
//     cancelled, mirroring the reference's lazy sequential read.

import { closeSync, openSync, readSync, type Stats, statSync } from 'node:fs';
import { basename } from 'node:path';

import type { IFileInfo } from '@rhombus-std/fileproviders.core';
import type { ReadableStream } from '@rhombus-std/primitives';

const READ_CHUNK_BYTES = 64 * 1024;

interface ReadableStreamController {
  enqueue(chunk: Uint8Array): void;
  close(): void;
}
interface UnderlyingByteSource {
  start?(controller: ReadableStreamController): void;
  pull?(controller: ReadableStreamController): void;
  cancel?(reason?: unknown): void;
}
type ReadableStreamConstructor = new(source: UnderlyingByteSource) => ReadableStream<Uint8Array>;

// The platform `ReadableStream` constructor, re-typed against our owned
// structural `ReadableStream<R>` (docs/decisions.md §39). No runtime fallback
// -- native in node >=18 / bun / deno / browsers.
const ReadableStreamConstructor: ReadableStreamConstructor =
  (globalThis as unknown as { ReadableStream: ReadableStreamConstructor; }).ReadableStream;

/**
 * Represents a file on the physical file system.
 */
export class PhysicalFileInfo implements IFileInfo {
  readonly #fullPath: string;
  readonly #name: string;
  #stats: Stats | undefined;
  #statted = false;

  /**
   * Initializes a new instance of the {@link PhysicalFileInfo} class over the
   * given absolute path.
   *
   * @param fullPath The absolute path to the file.
   */
  public constructor(fullPath: string) {
    this.#fullPath = fullPath;
    this.#name = basename(fullPath);
  }

  #ensureStats(): Stats | undefined {
    if (!this.#statted) {
      this.#stats = statSync(this.#fullPath, { throwIfNoEntry: false });
      this.#statted = true;
    }
    return this.#stats;
  }

  /**
   * A value that indicates whether the file exists on disk.
   */
  public get exists(): boolean {
    const stats = this.#ensureStats();
    return stats !== undefined && stats.isFile();
  }

  /**
   * The length of the file in bytes, or -1 if the file does not exist.
   */
  public get length(): number {
    const stats = this.#ensureStats();
    return stats !== undefined ? stats.size : -1;
  }

  /**
   * The absolute path to the file.
   */
  public get physicalPath(): string {
    return this.#fullPath;
  }

  /**
   * The name of the file, not including any path.
   */
  public get name(): string {
    return this.#name;
  }

  /**
   * The time when the file was last modified, or the epoch if it does not
   * exist.
   */
  public get lastModified(): Date {
    const stats = this.#ensureStats();
    return stats !== undefined ? stats.mtime : new Date(0);
  }

  /**
   * A value that's always `false`.
   */
  public readonly isDirectory = false;

  /**
   * Returns the file contents as a read-only stream. The caller should
   * consume or cancel the stream when complete.
   */
  public createReadStream(): ReadableStream<Uint8Array> {
    const path = this.#fullPath;
    let fd: number | undefined;
    return new ReadableStreamConstructor({
      start() {
        fd = openSync(path, 'r');
      },
      pull(controller) {
        const buffer = new Uint8Array(READ_CHUNK_BYTES);
        const bytesRead = readSync(fd!, buffer, 0, READ_CHUNK_BYTES, null);
        if (bytesRead === 0) {
          closeSync(fd!);
          fd = undefined;
          controller.close();
          return;
        }
        controller.enqueue(buffer.subarray(0, bytesRead));
      },
      cancel() {
        if (fd !== undefined) {
          closeSync(fd);
          fd = undefined;
        }
      },
    });
  }
}
