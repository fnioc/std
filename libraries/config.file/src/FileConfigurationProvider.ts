// FileConfigurationProvider -- the abstract base for every file-backed
// configuration provider. Ported from the reference `FileConfigurationProvider`.
//
// Reads the file named by its source through the source's IFileProvider, hands
// the decoded text to the concrete `loadContent`, and -- when
// `reloadOnChange` is set -- re-reads on every change the provider's
// `watch` token reports.
//
// Two platform-driven deviations from the reference, flagged:
//
//   - READ IS SYNCHRONOUS VIA `physicalPath`. `IConfigurationProvider.load()`
//     is synchronous (the whole build path is), but `IFileInfo.createReadStream`
//     yields an ASYNC web `ReadableStream` that can't be drained in a sync
//     method. So the base reads with `readFileSync(fileInfo.physicalPath)` --
//     which is exactly the reference's own primary path (its `OpenRead`
//     special-cases `PhysicalPath` to a synchronous `FileStream`). A provider
//     that exposes no `physicalPath` (an in-memory/remote provider) is
//     therefore unsupported for synchronous file config, and load throws.
//
//   - RESET BY REASSIGNMENT. The reference reloads via `Data = newDict`; this
//     base does the analogous `this.data = new Map()` (enabled by #86), which
//     lets it parse into a fresh store and swap it in atomically -- restoring
//     the previous store if a NON-reload parse fails, matching the reference's
//     "Data unchanged on a failed initial load" semantics.

import { ConfigurationProvider } from '@rhombus-std/config';
import type { IFileInfo } from '@rhombus-std/fileproviders.core';
import { ChangeToken, setTimeout } from '@rhombus-std/primitives';
import { readFileSync } from 'node:fs';
import { InvalidDataError } from './errors';
import type { FileConfigurationSource } from './FileConfigurationSource';
import type { FileLoadErrorContext } from './FileLoadErrorContext';

/** Reads `file`'s bytes synchronously and decodes them, stripping a leading BOM. */
function readFileContent(file: IFileInfo): string {
  if (file.physicalPath === null) {
    throw new Error(
      'FileConfigurationProvider: the file provider exposes no physical path; '
        + 'synchronous file configuration requires a physical-path-backed provider.',
    );
  }
  const raw = readFileSync(file.physicalPath, 'utf-8');
  return raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
}

/** The base class for file-based {@link ConfigurationProvider} providers. */
export abstract class FileConfigurationProvider extends ConfigurationProvider implements Disposable {
  readonly #source: FileConfigurationSource;
  readonly #changeTokenRegistration: Disposable | undefined;
  #disposed = false;

  public constructor(source: FileConfigurationSource) {
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
  public get source(): FileConfigurationSource {
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
      // Read outside the try (mirrors the reference `OpenRead`): a read
      // failure propagates directly, not through the load-error handler, and
      // leaves the current store untouched. Only a parse failure is wrapped.
      const content = readFileContent(file);
      const previous = this.data;
      this.data = new Map();
      try {
        this.loadContent(content);
      } catch (error) {
        this.data = reload ? new Map() : previous;
        // Reference parity: the failure names the resolved physical path.
        this.#handleError(
          new InvalidDataError(`Failed to load configuration from file '${file.physicalPath}'.`, { cause: error }),
        );
      }
    }

    this.onReload();
  }

  async #reloadAfterDelay(): Promise<void> {
    // The async-consumer form (docs §58): ChangeToken.onChange re-registers
    // only once this promise settles, so the delay debounces naturally -- a
    // burst of file events collapses to one reload.
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
