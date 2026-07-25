// Flattens argv-style tokens (e.g. `process.argv.slice(2)`) into the
// case-insensitive store every ConfigProvider maintains: long `--Key value` /
// `--Key=value` switches, plus short `-x` switches that must be pre-registered
// via switchMappings (validated when the source is constructed).
//
// Parsing fails LOUD -- an unmapped short switch (with no "=") and any switch
// with no trailing value both throw, rather than silently dropping config the
// caller thought they'd supplied.
//
// "/switch" is read as "--switch", but only for a token in SWITCH position --
// never for one consumed as another switch's *value*, so `--Path /usr/bin` is
// untouched. A bare token (no leading dash) containing "=" is honored as a
// key/value pair, split at the FIRST "="; a bare token without one is a
// positional and is ignored, same as anything after "--".

import { ConfigProvider } from '@rhombus-std/config';

function isNegativeNumber(token: string): boolean {
  return /^-\d/.test(token) && Number.isFinite(Number(token));
}

export class CommandLineConfigProvider extends ConfigProvider {
  private readonly argv: readonly string[];
  /** Switch mappings keyed by lower-cased switch, for case-insensitive matching. */
  private readonly foldedSwitchMappings: Map<string, string>;

  public constructor(argv: readonly string[], switchMappings: Record<string, string>) {
    super();
    this.argv = argv;
    this.foldedSwitchMappings = new Map(
      Object.entries(switchMappings).map(([key, value]) => [key.toLowerCase(), value]),
    );
  }

  public override load(): void {
    const argv = this.argv;

    for (let i = 0; i < argv.length; i++) {
      let token = argv[i];
      if (token === undefined) {
        continue;
      }

      // A lone "--" is the standard end-of-options marker: everything after it
      // is positional, and this source ignores positionals. Stop parsing rather
      // than treating "--" as an empty-key long switch that swallows the
      // following token.
      if (token === '--') {
        break;
      }

      // Windows-style switch notation, normalized only at switch position --
      // never on a token standing in for a value.
      if (token.startsWith('/')) {
        token = `--${token.slice(1)}`;
      }

      if (token.startsWith('--')) {
        i = this.consumeLongSwitch(token, argv, i);
        continue;
      }

      if (token.startsWith('-')) {
        i = this.consumeShortSwitch(token, argv, i);
        continue;
      }

      // A bare "key=value" pair, split at the FIRST "="; any other bare token
      // is a positional and stays ignored.
      const eqIndex = token.indexOf('=');
      if (eqIndex !== -1) {
        this.set(token.slice(0, eqIndex), token.slice(eqIndex + 1));
      }
    }

    this.onReload();
  }

  /** Handles a `--Key value` / `--Key=value` token; returns the new index. */
  private consumeLongSwitch(token: string, argv: readonly string[], index: number): number {
    const rest = token.slice(2);
    const eqIndex = rest.indexOf('=');

    if (eqIndex !== -1) {
      const key = rest.slice(0, eqIndex);
      this.set(key, rest.slice(eqIndex + 1));
      return index;
    }

    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(
        `Missing value for command-line switch "${token}" -- expected "${token} <value>" or "${token}=<value>"`,
      );
    }

    // When the next token can't be this switch's value, the switch is a
    // valueless boolean flag ("true") rather than swallowing it -- which would
    // corrupt both (`["--Verbose", "--Port", "8080"]` -> {Verbose: "--Port"},
    // Port lost). Negative numbers (`--Offset -5`) stay intact, and a genuine
    // dash-led string value is reachable via the `=` form (`--Key=-x`).
    if (this.isValuelessFollower(value)) {
      this.set(rest, 'true');
      return index;
    }

    this.set(rest, value);
    return index + 1;
  }

  /**
   * Whether `token`, appearing where a `--Key`'s value would be, cannot be
   * that value -- so the `--Key` is a valueless boolean flag. True for any
   * `-`-led token that is not a negative number, and for any registered short
   * switch.
   */
  private isValuelessFollower(token: string): boolean {
    if (this.foldedSwitchMappings.has(token.toLowerCase())) {
      return true;
    }
    return token.startsWith('-') && !isNegativeNumber(token);
  }

  /** Handles a mapped `-x value` / `-x=value` token; returns the new index. */
  private consumeShortSwitch(token: string, argv: readonly string[], index: number): number {
    const eqIndex = token.indexOf('=');
    const switchName = eqIndex !== -1 ? token.slice(0, eqIndex) : token;
    const mappedKey = this.foldedSwitchMappings.get(switchName.toLowerCase());

    if (mappedKey === undefined) {
      throw new Error(
        `Unmapped command-line switch "${switchName}" -- register it in switchMappings before it can be used`,
      );
    }

    if (eqIndex !== -1) {
      this.set(mappedKey, token.slice(eqIndex + 1));
      return index;
    }

    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(
        `Missing value for command-line switch "${switchName}" -- expected "${switchName} <value>" or "${switchName}=<value>"`,
      );
    }

    this.set(mappedKey, value);
    return index + 1;
  }
}
