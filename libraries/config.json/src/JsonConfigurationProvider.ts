// JsonConfigurationProvider -- reads a JSON file from disk and flattens it
// into the case-insensitive key/value store `ConfigurationProvider` provides.
// The parse + flattening rules live in the shared JsonConfigurationFileParser
// (also used by JsonStreamConfigurationProvider) -- see that module's header
// for the null/empty-leaf semantics.

import { ConfigurationProvider } from '@rhombus-std/config';
import { process } from '@rhombus-std/primitives';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JsonConfigurationFileParser } from './json-configuration-file-parser';
import type { JsonConfigurationSource } from './json-configuration-source';

/** Whether `err` is a Node `ENOENT` (file-not-found) error. */
function isFileNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string; }).code === 'ENOENT';
}

export class JsonConfigurationProvider extends ConfigurationProvider {
  private readonly source: JsonConfigurationSource;

  public constructor(source: JsonConfigurationSource) {
    super();
    this.source = source;
  }

  /** Includes the file path and required/optional flag, matching the reference file provider's label. */
  public override toString(): string {
    return `${this.constructor.name} for '${this.source.path}' (${this.source.optional ? 'Optional' : 'Required'})`;
  }

  public override load(): void {
    // Drop any previously-loaded keys so a reload reflects the file's CURRENT
    // contents -- a key removed from the file must disappear, not linger.
    this.data.clear();

    const resolvedPath = resolve(process.cwd(), this.source.path);

    // Read unconditionally and branch on ENOENT rather than existsSync-then-read:
    // the two-step form has a TOCTOU window (the file can vanish between the
    // check and the read). A missing file is the `optional` branch; any other
    // read error rethrows.
    let raw: string;
    try {
      raw = readFileSync(resolvedPath, 'utf-8');
    } catch (err) {
      if (isFileNotFound(err)) {
        if (this.source.optional) {
          this.onReload();
          return;
        }
        throw new Error(
          `JsonConfigurationProvider: config file not found: ${resolvedPath}`,
        );
      }
      throw err;
    }

    for (
      const [key, value] of JsonConfigurationFileParser.parse(
        raw,
        `JsonConfigurationProvider (${resolvedPath})`,
      )
    ) {
      this.set(key, value);
    }

    // Only a successful load (this line) fires the reload token -- a thrown
    // parse error above leaves the previous token (and this provider's now-
    // cleared data) in place, matching the base class's "reload only on an
    // actual refresh" contract.
    this.onReload();
  }
}
