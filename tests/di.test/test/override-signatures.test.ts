import { ServiceManifest } from '@rhombus-std/di';
import { overrideSignatures } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';

// §99 — registration-time dependency overrides are a SPARSE array merged at
// RUNTIME, inside the certified `addClass<I>(ctor, overrides)` body, via
// `overrideSignatures(signatureof(ctor), overrides)`. These pin the sparse
// semantics and the di-direct-oracle parity the transformer relies on.

describe('overrideSignatures — §99 sparse registration overrides', () => {
  test('a string element overrides the derived slot at that position', () => {
    expect(overrideSignatures([['x:IA', 'x:IB']], ['x:IRedis'])).toEqual([['x:IRedis', 'x:IB']]);
  });

  test('a HOLE keeps the derived slot (a sparse array skips that index)', () => {
    // `['x:IHead', , 'x:ITail']` has a HOLE at index 1 — not an own property, so
    // Object.assign skips it and the derived slot survives.
    const overrides = ['x:IHead', , 'x:ITail'];
    expect(overrideSignatures([['d0', 'd1', 'd2']], overrides)).toEqual([['x:IHead', 'd1', 'x:ITail']]);
  });

  test('an explicit undefined OVERWRITES the slot with undefined (distinct from a hole)', () => {
    // The §99 divergence from di-direct's compile-time merge (which KEEPS on an
    // explicit `undefined`): at runtime an explicit `undefined` is an own property,
    // so Object.assign overwrites.
    expect(overrideSignatures([['d0', 'd1']], [undefined, 'x:IB'])).toEqual([[undefined, 'x:IB']]);
  });

  test('a shorter overrides array never truncates the derived signature (length is non-enumerable)', () => {
    expect(overrideSignatures([['d0', 'd1', 'd2']], ['x:IA'])).toEqual([['x:IA', 'd1', 'd2']]);
  });

  test('the merge applies to EVERY overload (matching di-direct applyOverrides)', () => {
    expect(overrideSignatures([['a', 'b'], ['c']], ['x:O'])).toEqual([['x:O', 'b'], ['x:O']]);
  });

  test('the derived signatures are not mutated (a copy is merged)', () => {
    const derived = [['d0', 'd1']];
    overrideSignatures(derived, ['x:IA']);
    expect(derived).toEqual([['d0', 'd1']]);
  });

  test('di-direct parity: string + hole overrides equal the oracle positional merge', () => {
    // di-direct's applyOverrides replaces a string-literal element and keeps the
    // derived token on a hole/omitted element — exactly this, for the string+hole
    // case the two paths must agree on (the parity the still-alive oracle pins).
    const derived = [['x:IReq', 'x:ILog', 'x:ICfg']];
    const overrides = ['x:IReqAlt', , 'x:ICfgAlt']; // replace 0 and 2, keep 1
    expect(overrideSignatures(derived, overrides)).toEqual([['x:IReqAlt', 'x:ILog', 'x:ICfgAlt']]);
  });

  test('runtime round-trip: an overridden dependency token is what the registration carries', () => {
    // The merged signatures feed a real registration; the override wins over the
    // derived slot end-to-end. `Marker` is registered under the override token, and
    // a class whose first dependency is overridden to that token resolves it.
    interface IMarker {
      readonly tag: string;
    }
    class Marker implements IMarker {
      readonly tag = 'override-wins';
    }
    class NeedsMarker {
      constructor(readonly marker: IMarker) {}
    }

    // Derived signature would point NeedsMarker's first param at 'x:IWrong'; the
    // override redirects it to 'x:IMarker'.
    const merged = overrideSignatures([['x:IWrong']], ['x:IMarker']);

    let services = new ServiceManifest<'singleton'>();
    services = services.addClass('x:IMarker', Marker, [[]]);
    services = services.addClass('x:INeeds', NeedsMarker, merged);
    const provider = services.build().createScope('singleton');

    const needs = provider.resolve<NeedsMarker>('x:INeeds');
    expect(needs.marker.tag).toBe('override-wins');
  });
});
