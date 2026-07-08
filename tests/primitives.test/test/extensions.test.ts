// Behaviour tests for the dual-export extension infrastructure
// (@rhombus-std/primitives/extensions): `applyExtensions` mounts receiver-first
// functions onto a prototype as `this`-forwarding methods, and the method form
// must be behaviour-equivalent to calling the free function directly.

import { applyExtensions, defineExtensions } from "@rhombus-std/primitives";
import { describe, expect, test } from "bun:test";

class Box {
  value = 0;
}

// The method form is typed by declaration merging (class + interface in the same
// file), exactly as the real packages type it via `declare module`.
interface Box {
  add(n: number): Box;
  read(): number;
}

const boxExtensions = defineExtensions<Box>()({
  add(box: Box, n: number): Box {
    box.value += n;
    return box;
  },
  read(box: Box): number {
    return box.value;
  },
});

// Install once for the whole file (mirrors how a library author installs at
// module-import time).
applyExtensions(Box, boxExtensions);

describe("applyExtensions", () => {
  test("forwards the receiver as the first argument", () => {
    const box = new Box();
    box.add(5);
    expect(box.value).toBe(5);
  });

  test("preserves the return value (fluent chaining survives)", () => {
    const box = new Box();
    const returned = box.add(2).add(3);
    expect(returned).toBe(box);
    expect(box.value).toBe(5);
  });

  test("the method form equals the free-function form", () => {
    const viaMethod = new Box();
    const viaFree = new Box();

    viaMethod.add(7);
    boxExtensions.add(viaFree, 7);

    expect(viaMethod.read()).toBe(boxExtensions.read(viaFree));
    expect(viaMethod.value).toBe(viaFree.value);
  });

  test("defineExtensions returns the literal unchanged", () => {
    expect(boxExtensions.add).toBeInstanceOf(Function);
    expect(Object.keys(boxExtensions).sort()).toEqual(["add", "read"]);
  });
});
