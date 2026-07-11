// ValidateOptionsResultBuilder -- ported from MEO's ValidateOptionsResultBuilder.
//
// Accumulates validation failures across several sources into a single
// ValidateOptionsResult. A validate step that checks many things builds up its
// errors here and calls `build()` once at the end, instead of stopping at the
// first failure.
//
// One divergence from the reference: it has no DataAnnotations `ValidationResult`
// overloads of `addResult`/`addResults` -- this stack does not port
// DataAnnotations, so there is no per-member `ValidationResult` to consume. Both
// verbs operate on this family's own {@link ValidateOptionsResult} (the reference
// has that overload too, alongside the DataAnnotations ones this drops).

import { ValidateOptionsResult } from "./ValidateOptionsResult.js";

/**
 * Builds a {@link ValidateOptionsResult} from multiple accumulated failures.
 * Collect errors with {@link addError} / {@link addResult} / {@link addResults},
 * then call {@link build} to fold them into one result -- success when nothing
 * was accumulated, otherwise a failure carrying every message.
 */
export class ValidateOptionsResultBuilder {
  /** The prefix `addError` applies when a property name is supplied. */
  static readonly #propertyPrefix = "Property ";

  readonly #errors: string[] = [];

  /**
   * Adds a validation error.
   *
   * @param error The error message.
   * @param propertyName The option property the error concerns; when given, the
   * recorded message is prefixed `Property {propertyName}: {error}`.
   */
  addError(error: string, propertyName?: string): void {
    this.#errors.push(
      propertyName === undefined
        ? error
        : `${ValidateOptionsResultBuilder.#propertyPrefix}${propertyName}: ${error}`,
    );
  }

  /**
   * Adds every failure carried by `result`. A succeeded or skipped result
   * contributes nothing; a failed one appends each of its {@link
   * ValidateOptionsResult.failures} separately, so the accumulated count
   * reflects the individual failures rather than one joined summary.
   *
   * @param result The result to consume failures from.
   */
  addResult(result: ValidateOptionsResult): void {
    if (result.failed) {
      for (const failure of result.failures) {
        this.#errors.push(failure);
      }
    }
  }

  /**
   * Adds the failures from each result in `results` (see {@link addResult}).
   *
   * @param results The results to consume failures from.
   */
  addResults(results: Iterable<ValidateOptionsResult>): void {
    for (const result of results) {
      this.addResult(result);
    }
  }

  /**
   * Folds the accumulated errors into a {@link ValidateOptionsResult}:
   * `ValidateOptionsResult.success` when none were added, otherwise a failure
   * carrying every accumulated message.
   */
  build(): ValidateOptionsResult {
    return this.#errors.length > 0
      ? ValidateOptionsResult.fail(this.#errors)
      : ValidateOptionsResult.success;
  }

  /** Resets the builder to the empty state. */
  clear(): void {
    this.#errors.length = 0;
  }
}
