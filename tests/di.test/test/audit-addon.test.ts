// Behaviour tests for the audit addon: it answers `Audit` for whoever names it, carrying what the
// resolve was asked for and the addresses of every construction enclosing the holder.

import { auditAddon, di, standardLifetimeAddon } from '@rhombus-std/di';
import { Audit, Registration } from '@rhombus-std/di.core';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const LEAF = Type.imported('Leaf', 'app');
const HOLDER = Type.imported('Holder', 'app');

class Leaf {
  constructor(readonly audit: Audit) {}
}

class Holder {
  constructor(readonly leaf: Leaf) {}
}

function buildProvider() {
  return di
    .usingLifetimeModel(standardLifetimeAddon())
    .useAddon(auditAddon())
    .configureServices(manifest =>
      manifest
        .add(LEAF, Leaf, Type.ctor(LEAF, [[Audit.address]]), 'transient')
        .add(HOLDER, Holder, Type.ctor(HOLDER, [[LEAF]]), 'transient')
    )
    .build();
}

describe('the audit addon', () => {
  test('answers `Audit` for whoever names it, carrying what the resolve was asked for', () => {
    const provider = buildProvider();

    const { audit } = provider.resolve(LEAF);

    expect(audit.request).toBe(LEAF);
  });

  test('resolved directly, with nothing enclosing it, the holding address is absent', () => {
    const provider = buildProvider();

    const audit = provider.resolve(Audit.address) as Audit;

    expect(audit.request).toBe(Audit.address);
    expect(audit.address).toBeUndefined();
    expect([...audit.ancestry]).toEqual([]);
  });

  test('the holding address is the construction that directly received it', () => {
    const provider = buildProvider();

    const { leaf: { audit } } = provider.resolve(HOLDER);

    expect(audit.address).toBe(LEAF);
  });

  test('ancestry names every construction enclosing the holder, innermost first, past the holder itself', () => {
    const WRAPPER = Type.imported('Wrapper', 'app');

    class Wrapper {
      constructor(readonly holder: Holder) {}
    }

    const provider = di
      .usingLifetimeModel(standardLifetimeAddon())
      .useAddon(auditAddon())
      .configureServices(manifest =>
        manifest
          .add(LEAF, Leaf, Type.ctor(LEAF, [[Audit.address]]), 'transient')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[LEAF]]), 'transient')
          .add(WRAPPER, Wrapper, Type.ctor(WRAPPER, [[HOLDER]]), 'transient')
      )
      .build();

    const { holder: { leaf: { audit } } } = provider.resolve(WRAPPER);

    expect(audit.address).toBe(LEAF);
    expect([...audit.ancestry]).toEqual([HOLDER, WRAPPER]);
  });

  test('resolving it through a manifest carrying only the placeholder registration, hooks never installed, fails loudly', () => {
    const addon = auditAddon();
    const registrations = (addon.create().registrations ?? []) as Iterable<Registration<unknown>>;
    const engine = new Engine(registrations);

    expect(() => engine.getService(Audit.address)).toThrow(/audit addon's own hooks/);
  });
});
