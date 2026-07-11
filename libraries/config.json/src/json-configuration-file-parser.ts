// JsonConfigurationFileParser -- the JSON payload -> flat key/value pairs
// parser shared by JsonConfigurationProvider (file) and
// JsonStreamConfigurationProvider (in-memory payload); mirrors the
// reference's INTERNAL `JsonConfigurationFileParser`, so it is deliberately
// NOT re-exported from the package barrel.
//
// Flattening rules: nested objects flatten into `Parent:Child` keys, arrays
// index-flatten into `Parent:0`, `Parent:1`, ..., and scalar leaves are
// string-converted. `null` leaves (and empty objects/arrays) are omitted
// entirely -- a deliberate choice to keep lookups simple (`get()` returning
// `undefined` means "absent", full stop) rather than also representing
// "present but null" or "present but empty" as distinct states.
//
// One reference behavior is unreachable here: the reference parser throws on
// duplicate sibling keys, but `JSON.parse` folds duplicates (last one wins)
// per the language spec before this code ever sees them.

/**
 * The port of the reference's internal `JsonConfigurationFileParser` static
 * class: parses raw JSON text and flattens it into ordered `[key, value]`
 * pairs for a provider to {@link ConfigurationProvider.set}.
 */
export const JsonConfigurationFileParser = {
  /**
   * Parses `raw` into flat pairs. `origin` prefixes every error message --
   * the calling provider's class name plus, where there is one, the payload
   * location (e.g. `` `JsonConfigurationProvider (${resolvedPath})` ``).
   */
  parse(raw: string, origin: string): [key: string, value: string][] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `${origin}: failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // A JSON document whose root is a scalar or null can't flatten into any
    // key/value pairs -- reject it loudly rather than silently loading nothing.
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error(`${origin}: root must be an object or array`);
    }

    const pairs: [key: string, value: string][] = [];
    flatten(parsed, "", pairs);
    return pairs;
  },
};

function flatten(value: unknown, prefix: string, into: [key: string, value: string][]): void {
  if (value === null || value === undefined) {
    // null leaves are skipped entirely -- no key is written for them.
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      flatten(item, prefix === "" ? String(index) : `${prefix}:${index}`, into);
    });
    return;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix === "" ? key : `${prefix}:${key}`, into);
    }
    return;
  }

  // Scalar leaf (string, number, or boolean): string-convert it.
  if (prefix !== "") {
    into.push([prefix, String(value)]);
  }
}
