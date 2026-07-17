// Behavior tests for ChangeToken.onChange -- the re-subscription loop is the
// load-bearing part: a fired token must produce a fresh registration, and
// state must flow through untouched.

import { ChangeToken } from '@rhombus-std/primitives/_/ChangeToken';
import type { IChangeToken } from '@rhombus-std/primitives/_/IChangeToken';
import { describe, expect, test } from 'bun:test';

// A minimal, mutable IChangeToken stub -- fires every registered callback
// once, then sets hasChanged, matching the "hasChanged MUST be set before
// the callback is invoked" contract.
class TestChangeToken implements IChangeToken {
  hasChanged = false;
  readonly activeChangeCallbacks = true;

  #callbacks: (() => void)[] = [];

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

describe('ChangeToken.onChange', () => {
  test('fires the consumer on token change and re-subscribes for the next change', () => {
    const tokens: TestChangeToken[] = [];
    const produceToken = () => {
      const token = new TestChangeToken();
      tokens.push(token);
      return token;
    };

    let fireCount = 0;
    const disposable = ChangeToken.onChange(produceToken, () => {
      fireCount++;
    });

    expect(tokens).toHaveLength(1);

    tokens[0]!.fire();
    expect(fireCount).toBe(1);
    expect(tokens).toHaveLength(2); // re-subscribed against a fresh token

    tokens[1]!.fire();
    expect(fireCount).toBe(2);
    expect(tokens).toHaveLength(3);

    disposable[Symbol.dispose]();
  });

  test('passes state through to the consumer', () => {
    // produceToken must hand back a FRESH token on each call (mirroring real
    // usage) -- reusing an already-fired token here would re-fire
    // synchronously forever, since registerChangeCallback on a changed token
    // invokes immediately (see the IChangeToken contract).
    let produced: TestChangeToken | undefined;
    const produceToken = () => {
      produced = new TestChangeToken();
      return produced;
    };
    let seen: string | undefined;

    ChangeToken.onChange(produceToken, (state) => {
      seen = state;
    }, 'hello');

    produced!.fire();
    expect(seen).toBe('hello');
  });

  test('disposing before any change unregisters the callback', () => {
    const token = new TestChangeToken();
    let calls = 0;

    const disposable = ChangeToken.onChange(() => token, () => {
      calls++;
    });
    disposable[Symbol.dispose]();
    token.fire();

    expect(calls).toBe(0);
  });

  test('a producer that returns nothing simply skips registration', () => {
    let calls = 0;
    const disposable = ChangeToken.onChange(() => undefined, () => {
      calls++;
    });

    expect(calls).toBe(0);
    disposable[Symbol.dispose]();
  });

  test('a synchronous throw from the consumer propagates to the trigger and still re-subscribes', () => {
    const tokens: TestChangeToken[] = [];
    const produceToken = () => {
      const token = new TestChangeToken();
      tokens.push(token);
      return token;
    };

    let calls = 0;
    const disposable = ChangeToken.onChange(produceToken, () => {
      calls++;
      throw new Error('consumer boom');
    });

    expect(() => tokens[0]!.fire()).toThrow('consumer boom');
    expect(calls).toBe(1);
    expect(tokens).toHaveLength(2); // re-subscribed despite the throw

    expect(() => tokens[1]!.fire()).toThrow('consumer boom');
    expect(calls).toBe(2);

    disposable[Symbol.dispose]();
  });
});

describe('ChangeToken.onChange (async consumer)', () => {
  test("re-subscribes only once the consumer's promise resolves", async () => {
    const tokens: TestChangeToken[] = [];
    const produceToken = () => {
      const token = new TestChangeToken();
      tokens.push(token);
      return token;
    };

    let resolveConsumer!: () => void;
    let calls = 0;
    const disposable = ChangeToken.onChange(produceToken, () => {
      calls++;
      return new Promise<void>((resolve) => {
        resolveConsumer = resolve;
      });
    });

    tokens[0]!.fire();
    expect(calls).toBe(1);
    // The NEXT token is produced before the consumer runs, but nothing is
    // registered on it until the consumer's promise settles...
    expect(tokens).toHaveLength(2);
    expect(tokens[1]!.registeredCallbackCount).toBe(0);

    resolveConsumer();
    await drainMicrotasks();

    // ...and now it is.
    expect(tokens[1]!.registeredCallbackCount).toBe(1);
    tokens[1]!.fire();
    expect(calls).toBe(2);

    resolveConsumer();
    await drainMicrotasks();
    disposable[Symbol.dispose]();
  });

  test('a change during the async gap is processed upon re-subscription', async () => {
    const tokens: TestChangeToken[] = [];
    const produceToken = () => {
      const token = new TestChangeToken();
      tokens.push(token);
      return token;
    };

    const resolvers: (() => void)[] = [];
    let calls = 0;
    const disposable = ChangeToken.onChange(produceToken, () => {
      calls++;
      return new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
    });

    tokens[0]!.fire();
    expect(calls).toBe(1);

    // Fires while the consumer is still pending -- not yet re-subscribed,
    // so nothing happens immediately...
    tokens[1]!.fire();
    expect(calls).toBe(1);

    // ...but re-subscribing against the already-changed token processes the
    // missed change right away.
    resolvers[0]!();
    await drainMicrotasks();
    expect(calls).toBe(2);

    resolvers[1]!();
    await drainMicrotasks();
    disposable[Symbol.dispose]();
  });

  test('a rejected consumer promise is left unobserved and still re-subscribes', async () => {
    const tokens: TestChangeToken[] = [];
    const produceToken = () => {
      const token = new TestChangeToken();
      tokens.push(token);
      return token;
    };

    let calls = 0;
    const disposable = ChangeToken.onChange(produceToken, () => {
      calls++;
      return Promise.reject(new Error('async boom'));
    });

    tokens[0]!.fire();
    expect(calls).toBe(1);
    await drainMicrotasks();

    // Re-subscribed despite the rejection (and no unhandled rejection --
    // this test would fail with one).
    expect(tokens[1]!.registeredCallbackCount).toBe(1);
    tokens[1]!.fire();
    expect(calls).toBe(2);

    await drainMicrotasks();
    disposable[Symbol.dispose]();
  });

  test('disposing during the async gap prevents re-subscription', async () => {
    const tokens: TestChangeToken[] = [];
    const produceToken = () => {
      const token = new TestChangeToken();
      tokens.push(token);
      return token;
    };

    let resolveConsumer!: () => void;
    let calls = 0;
    const disposable = ChangeToken.onChange(produceToken, () => {
      calls++;
      return new Promise<void>((resolve) => {
        resolveConsumer = resolve;
      });
    });

    tokens[0]!.fire();
    expect(calls).toBe(1);

    disposable[Symbol.dispose]();
    resolveConsumer();
    await drainMicrotasks();

    expect(tokens[1]!.registeredCallbackCount).toBe(0);
    tokens[1]!.fire();
    expect(calls).toBe(1);
  });
});

function drainMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
