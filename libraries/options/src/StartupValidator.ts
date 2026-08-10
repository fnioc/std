import type { IResolver, Token } from '@rhombus-std/di2.core';

import type { IOptions } from './IOptions.js';
import type { IStartupValidator } from './IStartupValidator.js';
import { OptionsValidationError } from './OptionsValidationError.js';

/**
 * The built-in {@link IStartupValidator}: forces evaluation of every options
 * token collected by `validateOnStart`, aggregating validation failures -- a
 * single failure rethrows as-is, many throw as one {@link AggregateError}. A
 * non-validation error (e.g. an unresolvable token -- a wiring bug, not a
 * validation result) propagates immediately.
 */
export class StartupValidator implements IStartupValidator {
  readonly #resolver: IResolver;
  readonly #targets: readonly Token[];

  /**
   * @param resolver The live provider view forcing evaluation resolves against.
   * @param targets The options tokens marked for startup validation.
   */
  public constructor(resolver: IResolver, targets: readonly Token[]) {
    this.#resolver = resolver;
    this.#targets = targets;
  }

  public validate(): void {
    const failures: OptionsValidationError[] = [];

    // A Set collapses duplicate `validateOnStart(token)` registrations to a single force.
    for (const token of new Set(this.#targets)) {
      try {
        // Resolving assembles the value (running validate steps); reading
        // `.value` re-runs the pipeline for a reactive registration.
        void this.#resolver.resolve<IOptions<unknown>>(token).value;
      } catch (error) {
        if (error instanceof OptionsValidationError) {
          failures.push(error);
          continue;
        }
        throw error;
      }
    }

    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'One or more options failed validation on startup.');
    }
  }
}
