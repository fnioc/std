import { type LifetimeModel } from '@rhombus-std/di.core';

/** Mints the lifetime model that retains nothing: every plan node makes afresh, descendants under it too. */
export function noopLifetimeAddon(): LifetimeModel<unknown> {
  return {
    name: 'noop',
    transient: undefined,
    create() {
      return {};
    },
  };
}

export namespace noopLifetimeAddon {
  /** This model's value for "construct afresh, keep nothing", reachable without building one. */
  export const transient: undefined = undefined;
}
