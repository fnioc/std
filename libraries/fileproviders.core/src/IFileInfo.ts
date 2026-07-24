import type { ReadableStream } from '@rhombus-std/primitives';

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

  readonly lastModified: Date;

  readonly isDirectory: boolean;

  /**
   * @remarks
   * The caller is responsible for cancelling/consuming the returned stream.
   */
  createReadStream(): ReadableStream<Uint8Array>;
}
