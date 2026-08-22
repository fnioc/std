import type { LifetimeModel } from '../LifetimeModel';

/** The lifetime model that retains nothing: every site makes afresh, descendants under it too. */
export const noop: LifetimeModel<unknown> = {
  realize({ make }) {
    return make(noop);
  },
};
