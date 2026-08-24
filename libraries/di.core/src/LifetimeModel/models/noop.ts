import type { LifetimeModel, Realizer } from '../LifetimeModel';

/** Stateless, so every model instance shares the one realizer. */
const realizer: Realizer<unknown> = {
  realize({ make }) {
    return make(realizer);
  },
};

/** The lifetime model that retains nothing: every site makes afresh, descendants under it too. */
export const noop: LifetimeModel<unknown> = {
  name: 'noop',
  addModelServices() {
    return [];
  },
  createRealizer() {
    return { realizer };
  },
};
