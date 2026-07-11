// Behaviour tests for the dual-export augmentation infrastructure
// (@rhombus-std/primitives/augmentations): `applyAugmentations` mounts
// receiver-first functions onto a prototype as `this`-forwarding methods, and the
// method form must be behaviour-equivalent to calling the object-literal member
// directly.

import { applyAugmentations, type AugmentationSet } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

class Box {
  value = 0;
}

// The method form is typed by declaration merging (class + interface in the same
// file), exactly as the real packages type it via `declare module`.
interface Box {
  add(n: number): Box;
  read(): number;
}

const BoxExtensions = {
  add(box: Box, n: number): Box {
    box.value += n;
    return box;
  },
  read(box: Box): number {
    return box.value;
  },
} satisfies AugmentationSet<Box>;

// Install once for the whole file (mirrors how a library author installs at
// module-import time).
applyAugmentations(Box, BoxExtensions);

describe('applyAugmentations', () => {
  test('forwards the receiver as the first argument', () => {
    const box = new Box();
    box.add(5);
    expect(box.value).toBe(5);
  });

  test('preserves the return value (fluent chaining survives)', () => {
    const box = new Box();
    const returned = box.add(2).add(3);
    expect(returned).toBe(box);
    expect(box.value).toBe(5);
  });

  test('the method form equals the object-literal member form', () => {
    const viaMethod = new Box();
    const viaMember = new Box();

    viaMethod.add(7);
    BoxExtensions.add(viaMember, 7);

    expect(viaMethod.read()).toBe(BoxExtensions.read(viaMember));
    expect(viaMethod.value).toBe(viaMember.value);
  });

  test('the augmentation set is a plain object of receiver-first functions', () => {
    expect(BoxExtensions.add).toBeInstanceOf(Function);
    expect(Object.keys(BoxExtensions).sort()).toEqual(['add', 'read']);
  });
});
