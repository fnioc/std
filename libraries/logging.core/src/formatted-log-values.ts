// Deferred message formatting — the TS analog of ME.Logging.Abstractions'
// internal `FormattedLogValues` + `LogValuesFormatter`.
//
// The reference formatter parses a message template with named holes
// (`"User {User} logged in from {Address}"`) and substitutes the positional
// args for each hole in order. It carries the parsed structure so a structured
// sink can read the name/value pairs; here we implement the STRING rendering
// only (the common case) and expose the raw `message`/`args` for a sink that
// wants to render its own way. Full structured key/value extraction is a
// deferred refinement (noted in the package README / issue #75).
//
// This lives behind the deferred-formatter boundary on purpose: `ILogger.log`
// takes a `state` + `formatter`, and a disabled sink never calls the formatter,
// so the `{hole}` substitution below only runs when a message is actually
// emitted.

/**
 * Renders a message template by replacing each `{hole}` with the next
 * positional arg (in order), and collapsing the `{{` / `}}` escapes to literal
 * braces. Extra args are ignored; missing/nullish args render as an empty
 * string. Single-pass so escapes and holes cannot interfere with each other.
 */
export function formatMessage(template: string, args: readonly unknown[]): string {
  let out = "";
  let argIndex = 0;
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === "{") {
      if (template[i + 1] === "{") {
        out += "{";
        i += 2;
        continue;
      }
      const close = template.indexOf("}", i + 1);
      if (close === -1) {
        // No closing brace — emit the rest verbatim.
        out += template.slice(i);
        break;
      }
      const value = argIndex < args.length ? args[argIndex] : undefined;
      argIndex += 1;
      out += value === undefined || value === null ? "" : String(value);
      i = close + 1;
      continue;
    }
    if (ch === "}" && template[i + 1] === "}") {
      out += "}";
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * The deferred-formatting `state` the logging sugar passes to `ILogger.log`.
 * Holds the raw template and args; `toString()` renders on demand.
 */
export class FormattedLogValues {
  public readonly message: string;
  public readonly args: readonly unknown[];

  public constructor(message: string, args: readonly unknown[]) {
    this.message = message;
    this.args = args;
  }

  public toString(): string {
    return formatMessage(this.message, this.args);
  }
}

/** The identity formatter for a {@link FormattedLogValues} state. */
export function formatLogValues(state: FormattedLogValues): string {
  return state.toString();
}
