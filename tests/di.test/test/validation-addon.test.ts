// Behaviour tests for the validation addons: what each one refuses at build, what it lets
// stand, and that either slots into a useAddon chain like any other addon. Both read the
// registry through the chain itself, so every case goes through the builder.

import { Builder, validateBuildability, validateUniversalAddresses } from '@rhombus-std/di';
import { ManifestValidationError, Registration, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const T = Type.generic('T');
const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');

const box = (of: Type) => Type.imported('Box', 'app', [of]);

class Conn {}
class Widget {
  constructor(readonly conn: unknown) {}
}
class Box {
  constructor(readonly closing: unknown) {}
}

describe('validateUniversalAddresses', () => {
  // A registration addressed by nothing but a hole matches every ask — the addon's own control
  // ask included, so the read of the registry itself comes back poisoned. The build still
  // refuses, through the control guard rather than a per-registration diagnostic.
  test('refuses to build when a registration addressed by nothing but a hole poisons the control ask', () => {
    const build = () =>
      Builder.withServices(manifest => manifest.add(Registration.ctor(T, Box, Type.ctor(T, [[]]))))
        .useAddon(validateUniversalAddresses())
        .build();

    expect(build).toThrow(UnsatisfiableError);
    expect(build).toThrow('something other than the engine control');
  });

  test('passes an open address that is more than a hole', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.ctor(box(T), Box, Type.ctor(box(T), [[T]]))))
      .useAddon(validateUniversalAddresses())
      .build();

    expect(provider.getService(box(CONN))).toBeInstanceOf(Box);
  });
});

describe('validateBuildability', () => {
  test('passes a manifest whose every registration plans', () => {
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]])))
        .add(Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]])))
    )
      .useAddon(validateBuildability())
      .build();

    expect(provider.getService(WIDGET)).toBeInstanceOf(Widget);
  });

  test('refuses a manifest with an unbuildable registration, naming its address', () => {
    const build = () =>
      Builder.withServices(manifest => manifest.add(Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]]))))
        .useAddon(validateBuildability())
        .build();

    expect(build).toThrow(ManifestValidationError);
    expect(build).toThrow('cannot satisfy every registration');
    expect(build).toThrow('app:Widget');
  });

  test('passes an open registration, which has no closed address to plan', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.ctor(box(T), Box, Type.ctor(box(T), [[T]]))))
      .useAddon(validateBuildability())
      .build();

    expect(provider.getService(box(CONN))).toBeInstanceOf(Box);
  });
});

describe('validation as an ordinary addon', () => {
  test('both validations chain onto services and the provider still resolves', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]))))
      .useAddon(validateUniversalAddresses())
      .useAddon(validateBuildability())
      .build();

    expect(provider.getService(CONN)).toBeInstanceOf(Conn);
  });
});
