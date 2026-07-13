// Behaviour tests for the augmentation REGISTRY -- the OPEN-set install path
// (@rhombus-std/primitives/augmentation-registry), docs/decisions.md §38/§73.
//
// The registry accumulates a per-token bag and notifies a bus; `augment(token)`
// decorates a concrete class so the token's members install onto its prototype.
// The install is a DELTA install (§73/1): the initial `@augment` application
// catches up on everything registered so far ONCE, and every LATER registration
// installs only its own set -- never the whole accumulated bag again. Collision
// is resolved BLIND at install time (§73/2): a name already taken on the
// prototype is a dispatcher (with a strategy) or a throw (without one). The bag
// tolerates a second same-name registration (§73/3) -- it accumulates, and the
// collision throw is deferred to install.
//
// Each test uses a UNIQUE token string so the module-level bag/bus (a process
// singleton) does not leak state between cases.

import { augment, type AugmentationSet, type MergeStrategies, registerAugmentations } from '@rhombus-std/primitives';
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

describe('decorate-then-register (late registration reaches the prototype)', () => {
  test('a registration AFTER decoration still reaches the prototype via its delta', () => {
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

    // Register LATER -- the delta dispatch reaches the already-decorated class.
    registerAugmentations(TOKEN, WidgetExtensions);

    expect(new Widget().bump().count).toBe(1);
  });
});

describe('the 8x config-provider reality (the killer regression, §73/1)', () => {
  // The shape that used to re-install a member once per later registration:
  // MANY packages register DIFFERENT-named members onto ONE shared token, and
  // TWO concrete classes (a builder and a manager) are decorated with it -- the
  // real `nameof<IConfigurationBuilder>()` fan-out across config.json / .env /
  // .commandline / .ini / .xml / .file plus config's memory + chained sources.
  // The live proof runs in `config.tests.integration`; this reproduces the shape
  // over synthetic classes so the mechanism is pinned in the leaf package too.

  test('every member is callable, NOTHING throws, and no member is re-installed', () => {
    const TOKEN = freshToken();

    class ConfigurationBuilder {
      readonly added: string[] = [];
    }
    class ConfigurationManager {
      readonly added: string[] = [];
    }
    interface ConfigurationBuilder extends Verbs {}
    interface ConfigurationManager extends Verbs {}
    interface Verbs {
      addJsonFile(): void;
      addEnvironmentVariables(): void;
      addCommandLine(): void;
      addIniFile(): void;
      addXmlFile(): void;
      addFile(): void;
      addMemory(): void;
      addConfiguration(): void;
    }

    // Both concrete classes are decorated up front, BEFORE any provider registers
    // (config's classes load first, then each provider package registers as it
    // is imported) -- so every member arrives as a delta onto both prototypes.
    augment(TOKEN)(ConfigurationBuilder);
    augment(TOKEN)(ConfigurationManager);

    const names = [
      'addJsonFile',
      'addEnvironmentVariables',
      'addCommandLine',
      'addIniFile',
      'addXmlFile',
      'addFile',
      'addMemory',
      'addConfiguration',
    ] as const;

    // Each provider registers its ONE differently-named member in a SEPARATE
    // `registerAugmentations` call -- eight dispatches over the shared token.
    for (const name of names) {
      const set = {
        [name](receiver: { added: string[]; }): void {
          receiver.added.push(name);
        },
      } satisfies AugmentationSet<{ added: string[]; }>;
      expect(() => registerAugmentations(TOKEN, set)).not.toThrow();
    }

    // Capture each installed slot AFTER all eight dispatches: because the install
    // is a delta, a member is mounted once and never re-touched by a later,
    // differently-named registration. (The old full-bag re-pull replaced every
    // slot on every dispatch.)
    const builderProto = ConfigurationBuilder.prototype as unknown as Record<string, unknown>;
    const managerProto = ConfigurationManager.prototype as unknown as Record<string, unknown>;
    const slotsAfterAll = names.map(name => builderProto[name]);

    // Re-register a fresh distinct member: the eight existing slots must be the
    // SAME function objects -- proof nothing was re-installed over itself.
    registerAugmentations(TOKEN, {
      addProbe(receiver: { added: string[]; }): void {
        receiver.added.push('addProbe');
      },
    });
    names.forEach((name, i) => {
      expect(builderProto[name]).toBe(slotsAfterAll[i]);
    });

    // Every member is callable on BOTH concrete classes.
    const builder = new ConfigurationBuilder();
    const manager = new ConfigurationManager();
    for (const name of names) {
      (builder as unknown as Record<string, () => void>)[name]!();
      (manager as unknown as Record<string, () => void>)[name]!();
    }
    expect(builder.added).toEqual([...names]);
    expect(manager.added).toEqual([...names]);

    // The prototypes are unpolluted beyond the registered members + the probe.
    expect(managerProto['addJsonFile']).toBeInstanceOf(Function);
  });

  test('a class decorated AFTER all registrations catches up on everything, once, no throw', () => {
    const TOKEN = freshToken();

    const names = ['addJsonFile', 'addEnvironmentVariables', 'addCommandLine', 'addIniFile'] as const;
    for (const name of names) {
      registerAugmentations(TOKEN, {
        [name](receiver: { added: string[]; }): void {
          receiver.added.push(name);
        },
      } satisfies AugmentationSet<{ added: string[]; }>);
    }

    class LateBuilder {
      readonly added: string[] = [];
    }
    interface LateBuilder {
      addJsonFile(): void;
      addEnvironmentVariables(): void;
      addCommandLine(): void;
      addIniFile(): void;
    }

    // Late catch-up must install every accumulated member exactly once, without
    // throwing (each name is distinct -> free slot -> plain install).
    expect(() => augment(TOKEN)(LateBuilder)).not.toThrow();

    const late = new LateBuilder();
    late.addJsonFile();
    late.addEnvironmentVariables();
    late.addCommandLine();
    late.addIniFile();
    expect(late.added).toEqual([...names]);
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

describe('bag tolerates a second same-name registration (§73/3)', () => {
  test("registering a member name already in the token's bag does NOT throw at registration", () => {
    const TOKEN = freshToken();

    const One = {
      configure(_r: object): void {},
    } satisfies AugmentationSet<object>;
    const Two = {
      configure(_r: object): void {},
    } satisfies AugmentationSet<object>;

    // The old registry threw here; §73/3 moves the throw to install time. With no
    // class yet decorated, both registrations simply accumulate in the bag.
    expect(() => {
      registerAugmentations(TOKEN, One);
      registerAugmentations(TOKEN, Two);
    }).not.toThrow();
  });

  test('the accumulated same-name pair throws at install when unresolved (no strategy)', () => {
    const TOKEN = freshToken();

    registerAugmentations(TOKEN, {
      configure(_r: object): void {},
    });
    registerAugmentations(TOKEN, {
      configure(_r: object): void {},
    });

    class Sink {}
    // Catch-up replays both contributions: the first mounts, the second finds the
    // name taken and -- with no strategy -- refuses.
    expect(() => augment(TOKEN)(Sink)).toThrow(/augmentation "configure" collides on Sink/);
  });

  test('the accumulated same-name pair CHAINS when a strategy is supplied', () => {
    const TOKEN = freshToken();

    class Node {}
    interface Node {
      visit(x: unknown): string;
    }

    // The duplicate carries a strategy: numbers route to the incoming (Second)
    // member, everything else falls through to the earlier (First) member.
    const merge = {
      visit(original, extension) {
        return function(this: Node, x: unknown, ...rest: unknown[]) {
          return typeof x === 'number' ? extension(this, x, ...rest) : original.call(this, x, ...rest);
        };
      },
    } satisfies MergeStrategies;

    registerAugmentations(TOKEN, {
      visit(_node: Node, x: unknown): string {
        return `first:${String(x)}`;
      },
    });
    registerAugmentations(TOKEN, {
      visit(_node: Node, x: unknown): string {
        return `second:${String(x)}`;
      },
    }, merge);

    augment(TOKEN)(Node);

    const node = new Node();
    expect(node.visit('a')).toBe('first:a');
    expect(node.visit(5)).toBe('second:5');
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

describe('install-time collision with a class primitive (§73/2)', () => {
  test('a strategy-LESS augmentation colliding with an own method throws at install', () => {
    const TOKEN = freshToken();

    class Box {
      compute(): string {
        return 'primitive';
      }
    }

    // `compute` shares its name with Box's own method and carries no strategy.
    registerAugmentations(TOKEN, {
      compute(_box: Box): string {
        return 'ext';
      },
    });

    expect(() => augment(TOKEN)(Box)).toThrow(/augmentation "compute" collides on Box/);
  });

  test('a strategy installs a dispatcher routing primitive- and extension-shaped calls', () => {
    const TOKEN = freshToken();

    class Box {
      compute(x: unknown): string {
        return `primitive:${String(x)}`;
      }
    }
    interface Box {
      compute(x: unknown): string;
    }

    const BoxExtensions = {
      compute(_box: Box, x: unknown): string {
        return `ext:${String(x)}`;
      },
    } satisfies AugmentationSet<Box>;

    // Route a string to the extension, everything else to the primitive.
    const merge = {
      compute(original, extension) {
        return function(this: Box, x: unknown, ...rest: unknown[]) {
          return typeof x === 'string' ? extension(this, x, ...rest) : original.call(this, x, ...rest);
        };
      },
    } satisfies MergeStrategies;

    registerAugmentations(TOKEN, BoxExtensions, merge);
    augment(TOKEN)(Box);

    const box = new Box();
    expect(box.compute(7)).toBe('primitive:7'); // primitive-shaped
    expect(box.compute('hi')).toBe('ext:hi'); // extension-shaped
  });

  test('a later delta does NOT re-wrap the primitive dispatcher (no self-recursion)', () => {
    const TOKEN = freshToken();

    class Box {
      compute(x: unknown): string {
        return `primitive:${String(x)}`;
      }
    }
    interface Box {
      compute(x: unknown): string;
      other(): string;
    }

    const merge = {
      compute(original, extension) {
        return function(this: Box, x: unknown, ...rest: unknown[]) {
          return typeof x === 'string' ? extension(this, x, ...rest) : original.call(this, x, ...rest);
        };
      },
    } satisfies MergeStrategies;

    registerAugmentations(TOKEN, {
      compute(_box: Box, x: unknown): string {
        return `ext:${String(x)}`;
      },
    }, merge);
    augment(TOKEN)(Box);

    // A LATER, differently-named registration dispatches its own delta only; the
    // `compute` dispatcher installed above is untouched -- it still routes over
    // the PRIMITIVE, not itself.
    registerAugmentations(TOKEN, {
      other(_box: Box): string {
        return 'other';
      },
    });

    const box = new Box();
    expect(box.compute(7)).toBe('primitive:7'); // still one hop, no recursion
    expect(box.compute('hi')).toBe('ext:hi');
    expect(box.other()).toBe('other');
  });
});

describe('dispatch-path collision propagates to the registrant (§79 defect fix)', () => {
  // The collision throw must reach the `registerAugmentations` CALLER even when
  // the receiving class is ALREADY decorated (the registry's primary open-set
  // scenario: a downstream package registers onto a token whose concrete class
  // loaded first). The install runs synchronously per subscriber -- NOT through
  // an `EventTarget` bus, whose `dispatchEvent` would swallow the listener throw
  // and silently drop the colliding member.

  test('a strategy-LESS collision onto an already-decorated class THROWS from registerAugmentations', () => {
    const TOKEN = freshToken();

    class Recv {
      readonly seen: string[] = [];
    }
    interface Recv {
      addFoo(): void;
    }

    // Decorate FIRST, then register the first member -- it installs via delta.
    augment(TOKEN)(Recv);
    registerAugmentations(TOKEN, {
      addFoo(receiver: { seen: string[]; }): void {
        receiver.seen.push('first');
      },
    });

    // A SECOND same-name registration with no strategy collides at install. The
    // throw must surface HERE (not be swallowed out-of-band).
    expect(() =>
      registerAugmentations(TOKEN, {
        addFoo(receiver: { seen: string[]; }): void {
          receiver.seen.push('second');
        },
      })
    ).toThrow(/augmentation "addFoo" collides on Recv/);

    // The first contribution stays intact (the collision refused the second, it
    // did not clobber the first).
    const recv = new Recv();
    recv.addFoo();
    expect(recv.seen).toEqual(['first']);
  });

  test('a strategy-carrying collision onto an already-decorated class CHAINS (both reachable)', () => {
    const TOKEN = freshToken();

    class Recv {}
    interface Recv {
      pick(x: unknown): string;
    }

    const merge = {
      pick(original, extension) {
        return function(this: Recv, x: unknown, ...rest: unknown[]) {
          return typeof x === 'number' ? extension(this, x, ...rest) : original.call(this, x, ...rest);
        };
      },
    } satisfies MergeStrategies;

    augment(TOKEN)(Recv);
    registerAugmentations(TOKEN, {
      pick(_r: Recv, x: unknown): string {
        return `first:${String(x)}`;
      },
    });
    // Later delta collides but carries a strategy -- both signatures stay live.
    expect(() =>
      registerAugmentations(TOKEN, {
        pick(_r: Recv, x: unknown): string {
          return `second:${String(x)}`;
        },
      }, merge)
    ).not.toThrow();

    const recv = new Recv();
    expect(recv.pick('a')).toBe('first:a');
    expect(recv.pick(5)).toBe('second:5');
  });
});

describe('cross-token collision (two tokens, one class, same member name, §73/2)', () => {
  // Two DIFFERENT tokens each contribute a same-NAMED member onto the SAME class.
  // The per-token bag cannot see this (two tokens = two bags), so the guard lives
  // at install time and is BLIND to which token the member came from -- the only
  // question is "is the name already taken on this prototype?".

  test('a strategy-LESS second token colliding on the same name THROWS (no silent clobber)', () => {
    const A = freshToken();
    const B = freshToken();

    class Widget {}
    interface Widget {
      describe(): string;
    }

    registerAugmentations(A, {
      describe(_w: Widget): string {
        return 'A';
      },
    });
    registerAugmentations(B, {
      describe(_w: Widget): string {
        return 'B';
      },
    });

    // A installs `describe` (free name). B's install finds it taken and, with no
    // strategy, refuses rather than clobbering A.
    augment(A)(Widget);
    expect(() => augment(B)(Widget)).toThrow(/augmentation "describe" collides on Widget/);
  });

  test('a strategy on the second token installs a dispatcher reaching BOTH signatures', () => {
    const A = freshToken();
    const B = freshToken();

    class Widget {}
    interface Widget {
      describe(x: unknown): string;
    }

    registerAugmentations(A, {
      describe(_w: Widget, x: unknown): string {
        return `A:${String(x)}`;
      },
    });
    // The colliding token carries a strategy: numbers route to B, everything else
    // falls through to the member already installed (A's thunk).
    const merge = {
      describe(original, extension) {
        return function(this: Widget, x: unknown, ...rest: unknown[]) {
          return typeof x === 'number' ? extension(this, x, ...rest) : original.call(this, x, ...rest);
        };
      },
    } satisfies MergeStrategies;
    registerAugmentations(B, {
      describe(_w: Widget, x: unknown): string {
        return `B:${String(x)}`;
      },
    }, merge);

    augment(A)(Widget);
    augment(B)(Widget);

    const widget = new Widget();
    expect(widget.describe('hi')).toBe('A:hi'); // non-number -> the earlier token
    expect(widget.describe(5)).toBe('B:5'); //    number      -> the colliding token
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
