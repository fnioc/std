// StartupValidator -- ported from the reference Options project's StartupValidator
// (which the reference houses in ValidateOnStart.cs). The built-in
// IStartupValidator the `validateOnStart` augmentation registers.
//
// Divergence from the reference shape (recorded): the reference StartupValidator
// is injected with `IOptions<StartupValidatorOptions>`, whose `_validators`
// dictionary each `ValidateOnStart<T>` call fills with a thunk that forces
// evaluation via `IOptionsMonitor<T>.Get(name)`. That indirection exists because
// the reference DI has no ergonomic "collection of things" primitive and because
// its configure step captures the monitor by dependency injection. Neither
// constraint holds here: collection resolution (`Array<T>`, docs/decisions.md
// §12) is the idiomatic accumulator, so `validateOnStart` appends the target
// token to a collection slot and this validator is injected with the live
// {@link Resolver} plus that resolved list. Forcing evaluation is
// `resolver.resolve<Options<unknown>>(token).value`: resolving assembles the
// value through the OptionsFactory pipeline (running validate steps, §4.5), and
// reading `.value` additionally re-runs the pipeline for a reactive
// (`Options.watch`) registration -- either shape throws OptionsValidationError on
// a failed validate step, which is exactly what forcing is for.

import type { Resolver, Token } from "@rhombus-std/di.core";

import type { IStartupValidator } from "./IStartupValidator.js";
import type { Options } from "./options.js";
import { OptionsValidationError } from "./OptionsValidationError.js";

/**
 * The built-in {@link IStartupValidator}: forces evaluation of every options
 * token collected by `validateOnStart`, aggregating validation failures the way
 * the reference StartupValidator does -- a single failure rethrows as-is, many
 * throw as one {@link AggregateError}. A non-validation error (e.g. an
 * unresolvable token -- a wiring bug, not a validation result) propagates
 * immediately, matching the reference's catch of only `OptionsValidationException`.
 */
export class StartupValidator implements IStartupValidator {
  readonly #resolver: Resolver;
  readonly #targets: readonly Token[];

  /**
   * @param resolver The live provider view forcing evaluation resolves against.
   * @param targets The options tokens marked for startup validation.
   */
  public constructor(resolver: Resolver, targets: readonly Token[]) {
    this.#resolver = resolver;
    this.#targets = targets;
  }

  public validate(): void {
    const failures: OptionsValidationError[] = [];

    // A Set collapses duplicate `validateOnStart(token)` calls to a single force
    // -- the reference dedups the same way through its `(type, name)` dictionary
    // key ("duplicates are not important").
    for (const token of new Set(this.#targets)) {
      try {
        // Resolving assembles the value (running validate steps); reading
        // `.value` re-runs the pipeline for a reactive registration.
        void this.#resolver.resolve<Options<unknown>>(token).value;
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
      throw new AggregateError(failures, "One or more options failed validation on startup.");
    }
  }
}
