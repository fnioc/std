// ExclusionFilters -- ported from ME.FileProviders.Physical.ExclusionFilters.
//
// The reference is a `[Flags]` enum; TS has no flags enum, so this is a const
// bitflag object plus a `number` type alias (the idiomatic TS mapping for a
// `[Flags]` enum -- callers combine with `|` and test with `&`, exactly as in
// the reference).
//
// DEVIATION (flagged): POSIX file systems have no `Hidden`/`System` file
// attributes, so on the repo's target platform (Linux) only `DotPrefixed` is
// enforceable. The `Hidden`/`System` bits are retained for surface parity and
// honored only where a platform exposes those attributes; on POSIX they are a
// documented no-op (see FileSystemInfoHelper).

/**
 * Specifies filtering behavior for files or directories. Combine values with
 * the bitwise OR operator and test membership with bitwise AND.
 */
export const ExclusionFilters = {
  /**
   * Do not exclude any files.
   */
  None: 0,

  /**
   * Exclude files and directories when the name begins with a period.
   */
  DotPrefixed: 0x0001,

  /**
   * Exclude files and directories with the hidden attribute set. No POSIX
   * analog -- a documented no-op on Linux.
   */
  Hidden: 0x0002,

  /**
   * Exclude files and directories with the system attribute set. No POSIX
   * analog -- a documented no-op on Linux.
   */
  System: 0x0004,

  /**
   * Equivalent to `DotPrefixed | Hidden | System`.
   */
  Sensitive: 0x0001 | 0x0002 | 0x0004,
} as const;

/**
 * A bitwise combination of {@link ExclusionFilters} values.
 */
export type ExclusionFilters = number;
