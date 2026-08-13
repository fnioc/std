import type { IServiceProvider, Type } from '@rhombus-std/di.core';

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
  readonly #resolver: IServiceProvider;
  readonly #targets: readonly Type[];

  /**
   * @param resolver The provider forcing evaluation resolves against.
   * @param targets The options types marked for startup validation.
   */
  public constructor(resolver: IServiceProvider, targets: readonly Type[]) {
    this.#resolver = resolver;
    this.#targets = targets;
  }

  public validate(): void {
    const failures: OptionsValidationError[] = [];

    // A Set collapses duplicate `validateOnStart(type)` registrations to a single force.
    for (const type of new Set(this.#targets)) {
      try {
        // Resolving assembles the value (running validate steps); reading
        // `.value` re-runs the pipeline for a reactive registration.
        void (this.#resolver.getService(type) as IOptions<unknown>).value;
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
