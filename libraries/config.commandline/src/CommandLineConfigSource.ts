// Source-side construction, including eager validation of `switchMappings`:
//
//   - every key must start with "-" (covering both "-x" and "--LongForm");
//   - two keys that differ only by case collide and throw ("-p" and "-P"
//     registered together is a caller mistake, not two switches).
//
// Both run at construction rather than lazily during parsing -- a malformed
// table should fail the moment it's built, not only when the CLI happens to
// exercise the affected switch.

import type { IConfigBuilder, IConfigProvider, IConfigSource } from '@rhombus-std/config.core';
import { CommandLineConfigProvider } from './CommandLineConfigProvider';

export interface CommandLineConfigSourceOptions {
  /**
   * Maps a switch (including its leading dash(es), e.g. `"-p"` or `"--port"`)
   * to the full delimited key name it should populate (e.g. `"Server:Port"`).
   * Every key must start with `"-"`, and keys differing only by case are
   * rejected as duplicates.
   */
  switchMappings?: Record<string, string>;
}

/** Throws on the FIRST violation, in `Object.keys` order — so the error is deterministic. */
function validateSwitchMappings(switchMappings: Record<string, string>): void {
  const seenByFoldedKey = new Map<string, string>();

  for (const key of Object.keys(switchMappings)) {
    if (!key.startsWith('-')) {
      throw new Error(
        `Invalid switch mapping key "${key}" -- switch mapping keys must start with "-" (e.g. "-p" or "--port").`,
      );
    }

    const folded = key.toLowerCase();
    const existing = seenByFoldedKey.get(folded);
    if (existing !== undefined) {
      throw new Error(
        `Duplicate switch mapping key "${key}" -- it differs only by case from the already-registered "${existing}". Switch mappings are matched case-insensitively.`,
      );
    }
    seenByFoldedKey.set(folded, key);
  }
}

/**
 * A configuration source over argv-style tokens (typically
 * `process.argv.slice(2)`), parsed by {@link CommandLineConfigProvider}.
 */
export class CommandLineConfigSource implements IConfigSource {
  public readonly args: readonly string[];

  /** The validated mappings — never `undefined`; an absent option defaults to `{}`. */
  public readonly switchMappings: Record<string, string>;

  public constructor(args: readonly string[], options?: CommandLineConfigSourceOptions) {
    const switchMappings = options?.switchMappings ?? {};
    validateSwitchMappings(switchMappings);

    this.args = args;
    this.switchMappings = switchMappings;
  }

  public build(_builder: IConfigBuilder): IConfigProvider {
    return new CommandLineConfigProvider(this.args, this.switchMappings);
  }
}
