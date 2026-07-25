// Deferred message formatting for a template with named holes
// (`"User {User} logged in from {Address}"`): the positional args substitute
// into the holes in order. A structured sink can instead read the parsed
// `[name, value]` pairs, one per hole, followed by the `{OriginalFormat}`
// pseudo-entry carrying the raw template.

/** The key of the pseudo-entry carrying the raw, unsubstituted template. */
const ORIGINAL_FORMAT_KEY = '{OriginalFormat}';

const NO_NAMES: readonly string[] = [];

/**
 * Renders a message template, replacing each `{hole}` with the next positional
 * arg in order and collapsing `{{` / `}}` to literal braces. Extra args are
 * ignored; a missing or nullish arg renders as the empty string.
 */
export function formatMessage(template: string, args: readonly unknown[]): string {
  let out = '';
  let argIndex = 0;
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === '{') {
      if (template[i + 1] === '{') {
        out += '{';
        i += 2;
        continue;
      }
      const close = template.indexOf('}', i + 1);
      if (close === -1) {
        // Unterminated hole — emit the rest verbatim.
        out += template.slice(i);
        break;
      }
      const value = argIndex < args.length ? args[argIndex] : undefined;
      argIndex += 1;
      out += value === undefined || value === null ? '' : String(value);
      i = close + 1;
      continue;
    }
    if (ch === '}' && template[i + 1] === '}') {
      out += '}';
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Extracts the ordered hole names from a template — the nth name pairs with the
 * nth arg. A hole's name is the text before its first `,` (alignment) or `:`
 * (format spec), per the `{name[,alignment][:format]}` grammar.
 */
function parseValueNames(template: string): readonly string[] {
  const names: string[] = [];
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === '{') {
      if (template[i + 1] === '{') {
        i += 2;
        continue;
      }
      const close = template.indexOf('}', i + 1);
      if (close === -1) {
        break;
      }
      const hole = template.slice(i + 1, close);
      const delimiter = hole.search(/[,:]/);
      names.push(delimiter === -1 ? hole : hole.slice(0, delimiter));
      i = close + 1;
      continue;
    }
    if (ch === '}' && template[i + 1] === '}') {
      i += 2;
      continue;
    }
    i += 1;
  }
  return names;
}

/**
 * The deferred-formatting `state` passed to {@link ILogger.log}: holds the raw
 * template and args. `toString()` renders on demand; the structured surface
 * (`count`/`get`/iteration) yields the parsed `[holeName, value]` pairs followed
 * by the `["{OriginalFormat}", template]` pseudo-entry.
 */
export class FormattedLogValues implements Iterable<readonly [string, unknown]> {
  public readonly message: string;
  public readonly args: readonly unknown[];

  // Parsed lazily — rendering never needs it and a disabled sink never
  // enumerates. With no args there are no names to bind, leaving just the
  // `{OriginalFormat}` entry.
  #valueNames: readonly string[] | undefined;

  public constructor(message: string, args: readonly unknown[]) {
    this.message = message;
    this.args = args;
  }

  get #names(): readonly string[] {
    if (this.#valueNames === undefined) {
      this.#valueNames = this.args.length === 0 ? NO_NAMES : parseValueNames(this.message);
    }
    return this.#valueNames;
  }

  /** The entry count: one per named hole, plus the `{OriginalFormat}` entry. */
  public get count(): number {
    return this.#names.length + 1;
  }

  /**
   * The entry at `index`: a `[holeName, value]` pair for a named hole, or the
   * `["{OriginalFormat}", template]` pseudo-entry at the final index.
   */
  public get(index: number): readonly [string, unknown] {
    const names = this.#names;
    if (index >= 0 && index < names.length) {
      return [names[index] as string, this.args[index]];
    }
    if (index === names.length) {
      return [ORIGINAL_FORMAT_KEY, this.message];
    }
    throw new RangeError(`FormattedLogValues index ${index} is out of range`);
  }

  public *[Symbol.iterator](): Iterator<readonly [string, unknown]> {
    const count = this.count;
    for (let i = 0; i < count; i += 1) {
      yield this.get(i);
    }
  }

  public toString(): string {
    return formatMessage(this.message, this.args);
  }
}

/** The identity formatter for a {@link FormattedLogValues} state. */
export function formatLogValues(state: FormattedLogValues): string {
  return state.toString();
}
