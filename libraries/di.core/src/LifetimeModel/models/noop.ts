import type { LifetimeModel } from '../LifetimeModel';

/** The lifetime model that retains nothing: every site makes afresh, descendants under it too. */
export const noop: LifetimeModel<unknown> = {
  name: 'noop',
  realize({ make }) {
    return make(noop);
  },
  addModelServices(manifest) {
    return manifest;
  },
};
