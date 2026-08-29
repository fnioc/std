import { type Hooks, LifetimeModelError } from '@rhombus-std/di.core';

/** The pair a lifetime model contributes: where a construction is kept, and what its dependencies resolve under. */
export interface ConstructionHooks<State> {
  readonly beforeConstruct: Hooks<State>['beforeConstruct'];
  readonly afterConstruct: Hooks<State>['afterConstruct'];
}

/**
 * `hooks` with a throw from the model's own body raised as a {@link LifetimeModelError} naming the
 * address it was realizing; an error the construction itself raised is not the model's, and passes
 * through untouched.
 */
export function classifyingHooks<State>(hooks: ConstructionHooks<State>): ConstructionHooks<State> {
  return {
    beforeConstruct(construction) {
      try {
        return hooks.beforeConstruct(construction);
      } catch (error) {
        throw new LifetimeModelError(construction.populatedAddress, error);
      }
    },

    afterConstruct(construction, instance) {
      try {
        hooks.afterConstruct(construction, instance);
      } catch (error) {
        throw new LifetimeModelError(construction.populatedAddress, error);
      }
    },
  };
}
