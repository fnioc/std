import { type LifetimeModel } from '@rhombus-std/di.core';

/** Mints the lifetime model that retains nothing: every site makes afresh, descendants under it too. */
export function noop(): LifetimeModel<unknown> {
  return {
    name: 'noop',
    transient: undefined,
    install() {
      return {};
    },
  };
}
