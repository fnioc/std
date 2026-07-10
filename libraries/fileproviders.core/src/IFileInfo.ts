// IFileInfo -- ported from ME.FileProviders.IFileInfo.
//
// Two type mappings differ from the reference runtime:
//   - `DateTimeOffset LastModified` maps to the built-in `Date`, the idiomatic
//     TS instant type.
//   - `System.IO.Stream CreateReadStream()` maps to `ReadableStream<Uint8Array>`
//     -- the web/ESNext analog of a read-only byte stream. The caller is
//     responsible for consuming/cancelling it (mirroring "the caller should
//     dispose the stream when complete").

import type { ReadableStream } from "@rhombus-std/primitives";

/**
 * Represents a file in the given file provider.
 */
export interface IFileInfo {
  /**
   * A value that indicates if the resource exists in the underlying storage
   * system.
   */
  readonly exists: boolean;

  /**
   * The length of the file in bytes, or -1 for a directory or nonexistent
   * file.
   */
  readonly length: number;

  /**
   * The path to the file, including the file name. `null` if the file is not
   * directly accessible.
   */
  readonly physicalPath: string | null;

  /**
   * The name of the file or directory, not including any path.
   */
  readonly name: string;

  /**
   * The time when the file was last modified.
   */
  readonly lastModified: Date;

  /**
   * A value that indicates whether this info represents a directory.
   */
  readonly isDirectory: boolean;

  /**
   * Returns the file contents as a read-only stream.
   *
   * @returns The file stream. The caller should cancel/consume the stream when
   * complete.
   */
  createReadStream(): ReadableStream<Uint8Array>;
}
