// CommandLineConfigurationSource -- source-side construction, including
// construction-time switchMappings validation:
//
//   - every switchMappings key must start with "-" (covers both "-x" and
//     "--LongForm" mapping keys);
//   - two mapping keys that differ only by case collide and throw ("-p" and
//     "-P" registered together is a caller mistake, not two switches).
//
// Both checks run eagerly here, at construction time, rather than lazily
// during parsing -- a malformed switchMappings table should fail the moment
// it's built, not only when the CLI happens to exercise the affected switch.
//
// Everything else about parsing (the fail-loud behavior in
// command-line-configuration-provider.ts) is this repo's pre-existing,
// already-tested baseline -- deliberately NOT a silent-ignore-on-unmapped-
// switch/missing-value behavior. See that file's module doc comment for the
// full rationale.

import type { IConfigurationBuilder, IConfigurationProvider, IConfigurationSource } from "@rhombus-std/config.core";
import { CommandLineConfigurationProvider } from "./command-line-configuration-provider";

/** Options accepted by {@link CommandLineConfigurationSource}'s constructor. */
export interface CommandLineConfigurationSourceOptions {
  /**
   * Maps a switch (including its leading dash(es), e.g. `"-p"` or
   * `"--port"`) to the full delimited key name it should populate (e.g.
   * `"Server:Port"`). Validated at construction time: every key must start
   * with `"-"`, and keys that differ only by case are rejected as
   * duplicates.
   */
  switchMappings?: Record<string, string>;
}

/**
 * Validates `switchMappings`, throwing synchronously on the first violation
 * found (iteration order is `Object.keys` insertion order, so the error is
 * deterministic).
 */
function validateSwitchMappings(switchMappings: Record<string, string>): void {
  const seenByFoldedKey = new Map<string, string>();

  for (const key of Object.keys(switchMappings)) {
    if (!key.startsWith("-")) {
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
 * A {@link IConfigurationSource} that flattens argv-style tokens (typically
 * `process.argv.slice(2)`) via {@link CommandLineConfigurationProvider}. See
 * that class's module doc comment for the parsing behavior.
 */
export class CommandLineConfigurationSource implements IConfigurationSource {
  /** The raw argv-style tokens to parse. */
  public readonly args: readonly string[];

  /** The validated switch mappings (never `undefined` -- defaults to `{}`). */
  public readonly switchMappings: Record<string, string>;

  public constructor(
    args: readonly string[],
    options?: CommandLineConfigurationSourceOptions,
  ) {
    const switchMappings = options?.switchMappings ?? {};
    validateSwitchMappings(switchMappings);

    this.args = args;
    this.switchMappings = switchMappings;
  }

  public build(_builder: IConfigurationBuilder): IConfigurationProvider {
    return new CommandLineConfigurationProvider(this.args, this.switchMappings);
  }
}
