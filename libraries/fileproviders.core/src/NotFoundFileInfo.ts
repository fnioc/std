import type { ReadableStream } from '@rhombus-std/primitives';
import type { IFileInfo } from './IFileInfo.js';

/**
 * Represents a nonexistent file.
 */
export class NotFoundFileInfo implements IFileInfo {
  /**
   * @param name The name of the file that could not be found.
   */
  public constructor(name: string) {
    this.name = name;
  }

  public readonly exists = false;

  public readonly isDirectory = false;

  public readonly lastModified = new Date(0);

  public readonly length = -1;

  public readonly name: string;

  public readonly physicalPath = null;

  /**
   * Always throws -- there is no stream to create for a nonexistent file.
   */
  public createReadStream(): ReadableStream<Uint8Array> {
    throw new Error(`The file ${this.name} does not exist.`);
  }
}
