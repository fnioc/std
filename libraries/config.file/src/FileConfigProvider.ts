/// <reference path="./node-builtins.d.ts" />
// FileConfigProvider -- the abstract base for every file-backed
// configuration provider.
//
// Reads the file named by its source through the source's IFileProvider, hands
// the decoded text to the concrete `loadContent`, and -- when
// `reloadOnChange` is set -- re-reads on every change the provider's
// `watch` token reports.
//
//   - READ IS SYNCHRONOUS VIA `physicalPath`. `IConfigProvider.load()`
//     is synchronous (the whole build path is), but `IFileInfo.createReadStream`
//     yields an ASYNC web `ReadableStream` that can't be drained in a sync
//     method. So the base reads with `readFileSync(fileInfo.physicalPath)`.
//     A provider that exposes no `physicalPath` (an in-memory/remote provider)
//     is therefore unsupported for synchronous file config, and load throws.
//
//   - RESET BY REASSIGNMENT. Reload does `this.data = new Map()`, which lets
//     it parse into a fresh store and swap it in atomically -- restoring the
//     previous store if a non-reload parse fails, so the store stays
//     unchanged after a failed initial load.

import { ConfigProvider } from '@rhombus-std/config';
import type { IFileInfo } from '@rhombus-std/fileproviders.core';
import { ChangeToken, setTimeout } from '@rhombus-std/primitives';
import { readFileSync } from 'node:fs';
import { InvalidDataError } from './errors';
import type { FileConfigSource } from './FileConfigSource';
import type { FileLoadErrorContext } from './FileLoadErrorContext';

/** Reads `file`'s bytes synchronously and decodes them, stripping a leading BOM. */
function readFileContent(file: IFileInfo): string {
  if (file.physicalPath === null) {
    throw new Error(
      'FileConfigProvider: the file provider exposes no physical path; '
        + 'synchronous file configuration requires a physical-path-backed provider.',
    );
  }
  const raw = readFileSync(file.physicalPath, 'utf-8');
  return raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
}

/** The base class for file-based {@link ConfigProvider} providers. */
export abstract class FileConfigProvider extends ConfigProvider implements Disposable {
  readonly #source: FileConfigSource;
  readonly #changeTokenRegistration: Disposable | undefined;
  #disposed = false;

  public constructor(source: FileConfigSource) {
    super();
    this.#source = source;

    if (source.reloadOnChange && source.fileProvider) {
      this.#changeTokenRegistration = ChangeToken.onChange(
        () => this.#source.fileProvider!.watch(this.#source.path ?? ''),
        () => this.#reloadAfterDelay(),
      );
    }
  }

  /** The source settings for this provider. */
  public get source(): FileConfigSource {
    return this.#source;
  }

  /** Includes the file path and required/optional flag. */
  public override toString(): string {
    const optionality = this.#source.optional ? 'Optional' : 'Required';
    return `${this.constructor.name} for '${this.#source.path}' (${optionality})`;
  }

  /** Loads (or reloads) the file's contents. */
  public override load(): void {
    this.#load(false);
  }

  /** Parses the decoded file `content` into this provider's store via {@link set}. */
  protected abstract loadContent(content: string): void;

  #load(reload: boolean): void {
    const file = this.#source.fileProvider?.getFileInfo(this.#source.path ?? '');

    if (!file || !file.exists) {
      // Always optional on reload -- a file that disappears empties the
      // provider rather than throwing.
      if (this.#source.optional || reload) {
        this.data = new Map();
      } else {
        this.#handleError(new Error(fileNotFoundMessage(this.#source.path, file)));
      }
    } else {
      // Read outside the try: a read failure propagates directly, not
      // through the load-error handler, and leaves the current store
      // untouched. Only a parse failure is wrapped.
      const content = readFileContent(file);
      const previous = this.data;
      this.data = new Map();
      try {
        this.loadContent(content);
      } catch (error) {
        this.data = reload ? new Map() : previous;
        this.#handleError(
          new InvalidDataError(`Failed to load configuration from file '${file.physicalPath}'.`, { cause: error }),
        );
      }
    }

    this.onReload();
  }

  async #reloadAfterDelay(): Promise<void> {
    // ChangeToken.onChange re-registers only once this promise settles, so
    // the delay debounces naturally -- a burst of file events collapses to
    // one reload.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, this.#source.reloadDelay);
    });
    if (!this.#disposed) {
      this.#load(true);
    }
  }

  #handleError(error: Error): void {
    if (this.#source.onLoadError) {
      const context: FileLoadErrorContext = { provider: this, error, ignore: false };
      this.#source.onLoadError(context);
      if (context.ignore) {
        return;
      }
    }
    throw error;
  }

  public [Symbol.dispose](): void {
    // Latch first so an in-flight #reloadAfterDelay whose timer is still
    // pending observes the flag and skips its load -- never reload after
    // dispose (closes the rebuild race).
    this.#disposed = true;
    this.#changeTokenRegistration?.[Symbol.dispose]();
  }
}

/** Builds the "not found and not optional" message, appending the physical path when known. */
function fileNotFoundMessage(path: string | undefined, file: IFileInfo | undefined): string {
  const base = `The configuration file '${path}' was not found and is not optional.`;
  if (file && file.physicalPath) {
    return `${base} The expected physical path was '${file.physicalPath}'.`;
  }
  return base;
}
