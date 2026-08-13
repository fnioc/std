/**
 * A member declared so callers can be written against it, which has no behaviour yet.
 *
 * @remarks
 * Reaching one is a gap in what has been built rather than anything wrong with the call, so it is
 * not a failure to fall back from. The stack trace names the call site; `member` only has to name
 * what was reached.
 */
export class NotImplementedError extends Error {
  constructor(member?: string) {
    super(member ? `${member} is not implemented.` : 'not implemented.');
    this.name = 'NotImplementedError';
  }
}
