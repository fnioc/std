// `number`-valued bitflags: combine with `|`, test membership with `&`. The
// type alias below shares this name with the const object, so a combined
// value type-checks under the same identifier as the individual flags.

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
