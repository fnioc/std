import type { LifetimeModel, Realizer } from '@rhombus-std/di.core';

/** Stateless, so every model instance shares the one realizer. */
const realizer: Realizer<unknown> = {
  realize({ make }) {
    return make(realizer);
  },
};

/** Mints the lifetime model that retains nothing: every site makes afresh, descendants under it too. */
export function noop(): LifetimeModel<unknown> {
  return {
    name: 'noop',
    transient: undefined,
    createRealizer() {
      return { realizer };
    },
  };
}
