// JsonConfigurationProvider -- reads a JSON file from disk and flattens it
// into the case-insensitive key/value store `ConfigurationProvider` provides:
// nested objects flatten into `Parent:Child` keys, arrays index-flatten into
// `Parent:0`, `Parent:1`, ..., and scalar leaves are string-converted. `null`
// leaves (and empty objects/arrays) are omitted entirely -- a deliberate
// choice to keep lookups simple (`get()` returning `undefined` means "absent",
// full stop) rather than also representing "present but null" or "present but
// empty" as distinct states.

import { ConfigurationProvider } from "@rhombus-std/config";
import { process } from "@rhombus-std/primitives";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { JsonConfigurationSource } from "./json-configuration-source";

/** Whether `err` is a Node `ENOENT` (file-not-found) error. */
function isFileNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}

export class JsonConfigurationProvider extends ConfigurationProvider {
  private readonly source: JsonConfigurationSource;

  public constructor(source: JsonConfigurationSource) {
    super();
    this.source = source;
  }

  /** Includes the file path and required/optional flag, matching the reference file provider's label. */
  public override toString(): string {
    return `${this.constructor.name} for '${this.source.path}' (${this.source.optional ? "Optional" : "Required"})`;
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
      raw = readFileSync(resolvedPath, "utf-8");
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `JsonConfigurationProvider: failed to parse JSON at ${resolvedPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // A JSON document whose root is a scalar or null can't flatten into any
    // key/value pairs -- reject it loudly rather than silently loading nothing.
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error(
        `JsonConfigurationProvider: root must be an object or array at ${resolvedPath}`,
      );
    }

    this.flatten(parsed, "");

    // Only a successful load (this line) fires the reload token -- a thrown
    // error above leaves the previous token (and this provider's prior data)
    // in place, matching the base class's "reload only on an actual refresh"
    // contract.
    this.onReload();
  }

  private flatten(value: unknown, prefix: string): void {
    if (value === null || value === undefined) {
      // null leaves are skipped entirely -- no key is written for them.
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        this.flatten(item, prefix === "" ? String(index) : `${prefix}:${index}`);
      });
      return;
    }

    if (typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        this.flatten(child, prefix === "" ? key : `${prefix}:${key}`);
      }
      return;
    }

    // Scalar leaf (string, number, or boolean): string-convert it.
    if (prefix !== "") {
      this.set(prefix, String(value));
    }
  }
}
