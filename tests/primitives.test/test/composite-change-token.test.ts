// Behavior tests for CompositeChangeToken -- the composition semantics are
// the load-bearing part: hasChanged/activeChangeCallbacks are any-of ORs,
// and callbacks fire exactly once per composite (the one-shot latch), no
// matter how many inner tokens fire afterwards.

import { CompositeChangeToken } from '@rhombus-std/primitives/tokens/CompositeChangeToken';
import type { IChangeToken } from '@rhombus-std/primitives/tokens/IChangeToken';
import { describe, expect, test } from 'bun:test';

// A minimal, mutable IChangeToken stub -- fires every registered callback
// once, then sets hasChanged, matching the "hasChanged MUST be set before
// the callback is invoked" contract.
class TestChangeToken implements IChangeToken {
  hasChanged = false;
  activeChangeCallbacks = true;

  #callbacks: Array<() => void> = [];

  registerChangeCallback(callback: (state: unknown) => void, state?: unknown): Disposable {
    if (this.hasChanged) {
      callback(state);
      return { [Symbol.dispose]() {} };
    }

    const invoke = () => callback(state);
    this.#callbacks.push(invoke);
    return {
      [Symbol.dispose]: () => {
        const i = this.#callbacks.indexOf(invoke);
        if (i !== -1) {
          this.#callbacks.splice(i, 1);
        }
      },
    };
  }

  get registeredCallbackCount(): number {
    return this.#callbacks.length;
  }

  fire(): void {
    this.hasChanged = true;
    const callbacks = this.#callbacks;
    this.#callbacks = [];
    for (const callback of callbacks) {
      callback();
    }
  }
}

// A passive token: consumers must poll hasChanged to detect its changes.
class PollOnlyChangeToken implements IChangeToken {
  hasChanged = false;
  readonly activeChangeCallbacks = false;

  registerChangeCallback(): Disposable {
    return { [Symbol.dispose]() {} };
  }
}

describe('CompositeChangeToken', () => {
  test('hasChanged is true when any inner token has changed', () => {
    const first = new TestChangeToken();
    const second = new TestChangeToken();
    const composite = new CompositeChangeToken([first, second]);

    expect(composite.hasChanged).toBe(false);

    second.hasChanged = true;
    expect(composite.hasChanged).toBe(true);
  });

  test('activeChangeCallbacks is true when at least one inner token raises callbacks', () => {
    const active = new TestChangeToken();
    const passive = new PollOnlyChangeToken();

    expect(new CompositeChangeToken([passive, active]).activeChangeCallbacks).toBe(true);
    expect(new CompositeChangeToken([passive]).activeChangeCallbacks).toBe(false);
    expect(new CompositeChangeToken([]).activeChangeCallbacks).toBe(false);
  });

  test('a callback fires when any inner token fires, and only once per composite', () => {
    const first = new TestChangeToken();
    const second = new TestChangeToken();
    const composite = new CompositeChangeToken([first, second]);

    let calls = 0;
    composite.registerChangeCallback(() => {
      calls++;
    });

    second.fire();
    expect(calls).toBe(1);
    expect(composite.hasChanged).toBe(true);

    // The latch has fired -- further inner changes don't re-fire it. (The
    // remaining inner registrations were released when the latch fired, so
    // `first` has nothing left registered.)
    expect(first.registeredCallbackCount).toBe(0);
    first.fire();
    expect(calls).toBe(1);
  });

  test('passes state through to the callback', () => {
    const inner = new TestChangeToken();
    const composite = new CompositeChangeToken([inner]);

    let seen: unknown;
    composite.registerChangeCallback((state) => {
      seen = state;
    }, 'hello');

    inner.fire();
    expect(seen).toBe('hello');
  });

  test('registering when an inner token has already changed fires synchronously', () => {
    const changed = new TestChangeToken();
    changed.hasChanged = true;
    const composite = new CompositeChangeToken([new TestChangeToken(), changed]);

    let calls = 0;
    composite.registerChangeCallback(() => {
      calls++;
    });

    expect(calls).toBe(1);
    expect(composite.hasChanged).toBe(true);
  });

  test('polling hasChanged on a poll-only inner change fires registered callbacks', () => {
    const active = new TestChangeToken();
    const passive = new PollOnlyChangeToken();
    const composite = new CompositeChangeToken([active, passive]);

    let calls = 0;
    composite.registerChangeCallback(() => {
      calls++;
    });

    // The passive token can't raise a callback -- but a hasChanged poll
    // detects it and fires the composite's latch.
    passive.hasChanged = true;
    expect(calls).toBe(0);
    expect(composite.hasChanged).toBe(true);
    expect(calls).toBe(1);
  });

  test('a disposed callback registration does not fire', () => {
    const inner = new TestChangeToken();
    const composite = new CompositeChangeToken([inner]);

    let calls = 0;
    const registration = composite.registerChangeCallback(() => {
      calls++;
    });
    registration[Symbol.dispose]();

    inner.fire();
    expect(calls).toBe(0);
  });

  test('callbacks are not registered on poll-only inner tokens', () => {
    const active = new TestChangeToken();
    const passive = new PollOnlyChangeToken();
    let passiveRegistrations = 0;
    const countingPassive: IChangeToken = {
      get hasChanged() {
        return passive.hasChanged;
      },
      activeChangeCallbacks: false,
      registerChangeCallback: () => {
        passiveRegistrations++;
        return { [Symbol.dispose]() {} };
      },
    };
    const composite = new CompositeChangeToken([countingPassive, active]);

    composite.registerChangeCallback(() => {});

    expect(passiveRegistrations).toBe(0);
    expect(active.registeredCallbackCount).toBe(1);
  });

  test('exposes the composed tokens', () => {
    const tokens = [new TestChangeToken(), new PollOnlyChangeToken()];
    const composite = new CompositeChangeToken(tokens);

    expect(composite.changeTokens).toBe(tokens);
  });
});
