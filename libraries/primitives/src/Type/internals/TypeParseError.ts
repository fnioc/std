/** Thrown when a type token cannot be read, pointing at the offending offset. */
export class TypeParseError extends Error {
  /** The token that failed to parse, whole. */
  public readonly token: string;
  /** Zero-based offset into {@link token} where the parse stopped. */
  public readonly position: number;
  /** What the reader needed to find there. */
  public readonly expectation: string;

  constructor(token: string, position: number, expectation: string) {
    super(
      `cannot read the type token at position ${position} — expected ${expectation}\n`
        + `  ${token}\n`
        + `  ${' '.repeat(position)}^`,
    );
    this.name = 'TypeParseError';
    this.token = token;
    this.position = position;
    this.expectation = expectation;
  }
}
