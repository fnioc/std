// Behaviour tests for the augmentation infrastructure
// (@rhombus-std/primitives/augmentations): `registerAugmentations` registers a
// `this`-based method set against a receiver type, and `@augment` installs the
// set onto a class's prototype. The method form must be behaviour-equivalent to
// calling the object-literal member directly.

import { augment, type AugmentationSet, registerAugmentations, Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

interface Box {
  add(n: number): Box;
  read(): number;
}

const BoxType = Type.from('@rhombus-std/primitives.test:Box');

@augment(BoxType)
class Box {
  value = 0;
}

const BoxExtensions = { add(this: Box, n: number): Box {
  this.value += n;
  return this;
}, read(this: Box): number {
  return this.value;
} } satisfies AugmentationSet<Box>;

// Register once for the whole file (mirrors how a library author registers at
// module-import time).
registerAugmentations<Box>(BoxType, BoxExtensions);

describe('registerAugmentations + @augment', () => {
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
    BoxExtensions.add.call(viaMember, 7);

    expect(viaMethod.read()).toBe(BoxExtensions.read.call(viaMember));
    expect(viaMethod.value).toBe(viaMember.value);
  });

  test('the augmentation set is a plain object of this-based functions', () => {
    expect(BoxExtensions.add).toBeInstanceOf(Function);
    expect(Object.keys(BoxExtensions).toSorted()).toEqual(['add', 'read']);
  });
});
