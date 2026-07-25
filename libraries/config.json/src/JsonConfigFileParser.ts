// The JSON payload -> flat key/value pairs parser shared by
// JsonConfigProvider (file) and JsonStreamConfigProvider (in-memory
// payload); deliberately NOT re-exported from the package barrel.
//
// Flattening rules: nested objects flatten into `Parent:Child` keys, arrays
// index-flatten into `Parent:0`, `Parent:1`, ..., and scalar leaves are
// string-converted. `null` leaves (and empty objects/arrays) are omitted
// entirely -- a deliberate choice to keep lookups simple (`get()` returning
// `undefined` means "absent", full stop) rather than also representing
// "present but null" or "present but empty" as distinct states.

import { FormatError } from '@rhombus-std/config.file';

/**
 * Parses raw JSON text and flattens it into ordered `[key, value]` pairs for
 * a provider to {@link ConfigProvider.set}.
 */
export const JsonConfigFileParser = {
  /**
   * Parses `raw` into flat pairs. `origin` prefixes every error message --
   * the calling provider's class name plus, where there is one, the payload
   * location (e.g. `` `JsonConfigProvider (${resolvedPath})` ``).
   */
  parse(raw: string, origin: string): Array<[key: string, value: string]> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new FormatError(`${origin}: failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`);
    }

    // The top-level element must be an object -- a scalar, null, or array
    // root is rejected.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new FormatError(`${origin}: the top-level JSON element must be an object`);
    }

    const pairs: Array<[key: string, value: string]> = [];
    flatten(parsed, '', pairs);
    return pairs;
  },
};

function flatten(value: unknown, prefix: string, into: Array<[key: string, value: string]>): void {
  if (value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      flatten(item, prefix === '' ? String(index) : `${prefix}:${index}`, into);
    });
    return;
  }

  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix === '' ? key : `${prefix}:${key}`, into);
    }
    return;
  }

  if (prefix !== '') {
    into.push([prefix, String(value)]);
  }
}
