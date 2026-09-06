import type { TypeDiagnostic } from '@rhombus-std/primitives';

/**
 * The address-validation report a built provider resolves: every diagnostic the address validator
 * saw — at build and at every ask so far, in the order it saw them, stopping and non-stopping alike.
 */
export interface IAddressDiagnostics {
  /** Every diagnostic seen so far, in the order the validator saw it. */
  readonly diagnostics: readonly TypeDiagnostic[];
}
