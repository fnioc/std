// OptionsFactory<T> -- ported from MEO's OptionsFactory<TOptions>.
//
// Assembles a bound options value by running the pipeline:
//   make base -> configure steps -> post-configure steps -> validate -> return.
//
// Two departures from the reference, both forced by the design:
//   - `create()` takes no name. Named options are distinct registrations here
//     (§4.2), so a factory serves exactly one registration and its steps carry
//     no name (there is no IConfigureNamedOptions branch to mirror).
//   - MEO makes the base instance with `Activator.CreateInstance<T>()`. There
//     is no reflective construction in TS, so the base factory is injected as
//     `makeBase` (the analog of MEO's protected virtual CreateInstance).

import type { Func } from '@rhombus-toolkit/func';

import type { IConfigureOptions } from './IConfigureOptions.js';
import type { IPostConfigureOptions } from './IPostConfigureOptions.js';
import type { IValidateOptions } from './IValidateOptions.js';
import { OptionsValidationError } from './OptionsValidationError.js';

/**
 * Builds bound options of type `T` by running configure, post-configure, and
 * validate steps over a freshly-made base instance. Mirrors MEO's
 * `OptionsFactory<TOptions>`.
 */
export class OptionsFactory<T> {
  readonly #makeBase: Func<[], T>;
  readonly #configures: readonly IConfigureOptions<T>[];
  readonly #postConfigures: readonly IPostConfigureOptions<T>[];
  readonly #validates: readonly IValidateOptions<T>[];

  /**
   * @param makeBase Produces the base instance every {@link create} starts
   * from (the analog of MEO's `CreateInstance`).
   * @param configures The configure steps, run in order first.
   * @param postConfigures The post-configure steps, run in order after every
   * configure step -- the guaranteed last word before validation.
   * @param validates The validate steps, run last against the post-configured
   * value.
   */
  constructor(
    makeBase: Func<[], T>,
    configures: Iterable<IConfigureOptions<T>>,
    postConfigures: Iterable<IPostConfigureOptions<T>>,
    validates: Iterable<IValidateOptions<T>> = [],
  ) {
    this.#makeBase = makeBase;
    this.#configures = [...configures];
    this.#postConfigures = [...postConfigures];
    this.#validates = [...validates];
  }

  /**
   * Runs the pipeline and returns the finished options value.
   *
   * @returns The configured, post-configured, validated instance.
   * @throws {OptionsValidationError} If any validate step reports a failure;
   * the failures from every step are aggregated into the one error.
   */
  create(): T {
    const options = this.#makeBase();

    for (const configure of this.#configures) {
      configure.configure(options);
    }

    for (const post of this.#postConfigures) {
      post.postConfigure(options);
    }

    if (this.#validates.length) {
      const failures: string[] = [];
      for (const validate of this.#validates) {
        const result = validate.validate(options);
        if (result.failed) {
          failures.push(...result.failures);
        }
      }
      if (failures.length) {
        throw new OptionsValidationError(failures);
      }
    }

    return options;
  }
}
