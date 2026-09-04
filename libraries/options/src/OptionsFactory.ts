import type { Func } from '@rhombus-toolkit/types';

import type { IConfigureOptions } from './IConfigureOptions.js';
import type { IPostConfigureOptions } from './IPostConfigureOptions.js';
import type { IValidateOptions } from './IValidateOptions.js';
import { OptionsValidationError } from './OptionsValidationError.js';

/**
 * Builds bound options of type `T` by running configure, post-configure, and
 * validate steps over a freshly-made base instance.
 */
export class OptionsFactory<T> {
  readonly #makeBase: Func<[], T>;
  readonly #configures: ReadonlyArray<IConfigureOptions<T>>;
  readonly #postConfigures: ReadonlyArray<IPostConfigureOptions<T>>;
  readonly #validates: ReadonlyArray<IValidateOptions<T>>;

  /**
   * @param makeBase Produces the base instance every {@link create} starts from.
   * @param configures The configure steps, run in order first.
   * @param postConfigures The post-configure steps, run in order after every
   * configure step -- the guaranteed last word before validation.
   * @param validates The validate steps, run last against the post-configured
   * value.
   */
  constructor(makeBase: Func<[], T>, configures: Iterable<IConfigureOptions<T>>, postConfigures: Iterable<IPostConfigureOptions<T>>, validates: Iterable<IValidateOptions<T>> = []) {
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
