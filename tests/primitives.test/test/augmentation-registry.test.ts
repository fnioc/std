// Behaviour tests for the augmentation REGISTRY -- the OPEN-set install path
// (@rhombus-std/primitives/augmentation-registry): `registerAugmentations`
// accumulates a per-token bag and notifies a bus; `augment(token)` decorates a
// concrete class so the token's full bag is installed onto its prototype now AND
// on every later registration.
//
// Each test uses a UNIQUE token string so the module-level bag/bus (a process
// singleton) does not leak state between cases.

import { augment, type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

let counter = 0;
/** A fresh token per call, so no two tests share a registry bag. */
function freshToken(): string {
  counter += 1;
  return `test:token:${counter}`;
}

describe('register-then-decorate', () => {
  test('a class decorated after registration gets the methods immediately', () => {
    const TOKEN = freshToken();

    class Box {
      value = 1;
    }
    interface Box {
      double(): Box;
      read(): number;
    }

    const BoxExtensions = {
      double(box: Box): Box {
        box.value *= 2;
        return box;
      },
      read(box: Box): number {
        return box.value;
      },
    } satisfies AugmentationSet<Box>;

    registerAugmentations(TOKEN, BoxExtensions);
    augment(TOKEN)(Box);

    const box = new Box();
    expect(box.double().read()).toBe(2);
  });
});

describe('decorate-then-register (late regobble)', () => {
  test('a registration AFTER decoration still reaches the prototype', () => {
    const TOKEN = freshToken();

    class Widget {
      count = 0;
    }
    interface Widget {
      bump(): Widget;
    }

    // Decorate FIRST -- the bag is empty at this point, so nothing is installed
    // yet. The listener stays subscribed.
    augment(TOKEN)(Widget);

    const before = new Widget() as Widget & { bump?: unknown; };
    expect(before.bump).toBeUndefined();

    const WidgetExtensions = {
      bump(widget: Widget): Widget {
        widget.count += 1;
        return widget;
      },
    } satisfies AugmentationSet<Widget>;

    // Register LATER -- the dispatch reaches the already-decorated class.
    registerAugmentations(TOKEN, WidgetExtensions);

    expect(new Widget().bump().count).toBe(1);
  });
});

describe('multi-set merge (two consts, one token)', () => {
  test("both sets' members land on the prototype", () => {
    const TOKEN = freshToken();

    class Svc {}
    interface Svc {
      a(): string;
      b(): string;
    }

    const First = {
      a(_svc: Svc): string {
        return 'a';
      },
    } satisfies AugmentationSet<Svc>;
    const Second = {
      b(_svc: Svc): string {
        return 'b';
      },
    } satisfies AugmentationSet<Svc>;

    augment(TOKEN)(Svc);
    registerAugmentations(TOKEN, First);
    registerAugmentations(TOKEN, Second);

    const svc = new Svc();
    expect(svc.a()).toBe('a');
    expect(svc.b()).toBe('b');
  });
});

describe('collision throw', () => {
  test("registering a member name already in the token's bag throws", () => {
    const TOKEN = freshToken();

    const One = {
      configure(_r: object): void {},
    } satisfies AugmentationSet<object>;
    const Two = {
      configure(_r: object): void {},
    } satisfies AugmentationSet<object>;

    registerAugmentations(TOKEN, One);
    expect(() => registerAugmentations(TOKEN, Two)).toThrow(
      `augmentation member "configure" is already registered for token "${TOKEN}"`,
    );
  });
});

describe('fluent-return preservation', () => {
  test("the installed method returns the callee's result (chaining survives)", () => {
    const TOKEN = freshToken();

    class Builder {
      readonly steps: string[] = [];
    }
    interface Builder {
      step(name: string): Builder;
    }

    const BuilderExtensions = {
      step(builder: Builder, name: string): Builder {
        builder.steps.push(name);
        return builder;
      },
    } satisfies AugmentationSet<Builder>;

    registerAugmentations(TOKEN, BuilderExtensions);
    augment(TOKEN)(Builder);

    const built = new Builder().step('one').step('two');
    expect(built.steps).toEqual(['one', 'two']);
  });
});

describe('@augment decorator syntax (TC39 standard class decorator)', () => {
  test('the decorator form installs the same as the statement form', () => {
    const TOKEN = freshToken();

    const CounterExtensions = {
      inc(counter: Counter): Counter {
        counter.n += 1;
        return counter;
      },
    } satisfies AugmentationSet<Counter>;
    registerAugmentations(TOKEN, CounterExtensions);

    @augment(TOKEN)
    class Counter {
      n = 0;
    }
    interface Counter {
      inc(): Counter;
    }

    expect(new Counter().inc().inc().n).toBe(2);
  });
});
