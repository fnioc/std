import { type LifetimeModel } from '@rhombus-std/di.core';

/** Mints the lifetime model that retains nothing: every plan node makes afresh, descendants under it too. */
export function noop(): LifetimeModel<unknown> {
  return {
    name: 'noop',
    transient: undefined,
    create() {
      return {};
    },
  };
}
