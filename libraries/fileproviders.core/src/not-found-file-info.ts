// NotFoundFileInfo -- ported from ME.FileProviders.NotFoundFileInfo.
//
// `DateTimeOffset.MinValue` (ME's sentinel for a nonexistent file's
// LastModified) maps to the epoch `new Date(0)` -- a nonexistent file has no
// meaningful modification time, so any stable sentinel serves. ME's
// `[DoesNotReturn] CreateReadStream` that throws FileNotFoundException maps to
// a plain `throw new Error(...)`.

import type { IFileInfo } from "./file-info.js";

/**
 * Represents a nonexistent file.
 */
export class NotFoundFileInfo implements IFileInfo {
  /**
   * Initializes a new instance of the {@link NotFoundFileInfo} class.
   *
   * @param name The name of the file that could not be found.
   */
  public constructor(name: string) {
    this.name = name;
  }

  /**
   * A value that's always `false`.
   */
  public readonly exists = false;

  /**
   * A value that's always `false`.
   */
  public readonly isDirectory = false;

  /**
   * The epoch (`new Date(0)`), standing in for ME's `DateTimeOffset.MinValue`.
   */
  public readonly lastModified = new Date(0);

  /**
   * A value that's always -1.
   */
  public readonly length = -1;

  /**
   * The name of the file that could not be found.
   */
  public readonly name: string;

  /**
   * A value that's always `null`.
   */
  public readonly physicalPath = null;

  /**
   * Always throws. A stream cannot be created for a nonexistent file.
   *
   * @returns Does not return.
   */
  public createReadStream(): ReadableStream<Uint8Array> {
    throw new Error(`The file ${this.name} does not exist.`);
  }
}
