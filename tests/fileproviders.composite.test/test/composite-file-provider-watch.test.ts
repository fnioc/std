// Behavior tests for CompositeFileProvider.watch -- the token-composition
// tiers are the load-bearing part: no change-emitting providers collapses to
// the NullChangeToken singleton, exactly one passes its token through
// untouched, and 2+ compose into a token that fires when ANY inner token
// fires.

import { CompositeFileProvider } from '@rhombus-std/fileproviders.composite';
import { type IDirectoryContents, type IFileInfo, type IFileProvider, NotFoundDirectoryContents, NotFoundFileInfo,
  NullChangeToken } from '@rhombus-std/fileproviders.core';
import { CompositeChangeToken, type IChangeToken } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

// A minimal, mutable IChangeToken stub -- fires every registered callback
// once, then sets hasChanged, matching the "hasChanged MUST be set before
// the callback is invoked" contract.
class TestChangeToken implements IChangeToken {
  hasChanged = false;
  readonly activeChangeCallbacks = true;

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

  fire(): void {
    this.hasChanged = true;
    const callbacks = this.#callbacks;
    this.#callbacks = [];
    for (const callback of callbacks) {
      callback();
    }
  }
}

// A provider stub that only supports watch(), handing back the given token.
class WatchOnlyProvider implements IFileProvider {
  readonly #token: IChangeToken;
  readonly watched: string[] = [];

  constructor(token: IChangeToken) {
    this.#token = token;
  }

  getFileInfo(subpath: string): IFileInfo {
    return new NotFoundFileInfo(subpath);
  }

  getDirectoryContents(): IDirectoryContents {
    return NotFoundDirectoryContents.singleton;
  }

  watch(filter: string): IChangeToken {
    this.watched.push(filter);
    return this.#token;
  }
}

describe('CompositeFileProvider.watch', () => {
  test('returns the NullChangeToken singleton when no provider emits changes', () => {
    const provider = new CompositeFileProvider(
      new WatchOnlyProvider(NullChangeToken.singleton),
      new WatchOnlyProvider(NullChangeToken.singleton),
    );

    expect(provider.watch('**/*.txt')).toBe(NullChangeToken.singleton);
  });

  test("passes a single change-emitting provider's token through untouched", () => {
    const token = new TestChangeToken();
    const provider = new CompositeFileProvider(
      new WatchOnlyProvider(NullChangeToken.singleton),
      new WatchOnlyProvider(token),
    );

    expect(provider.watch('**/*.txt')).toBe(token);
  });

  test('propagates the pattern to every composed provider', () => {
    const first = new WatchOnlyProvider(NullChangeToken.singleton);
    const second = new WatchOnlyProvider(new TestChangeToken());
    const provider = new CompositeFileProvider(first, second);

    provider.watch('sub/**/*.html');

    expect(first.watched).toEqual(['sub/**/*.html']);
    expect(second.watched).toEqual(['sub/**/*.html']);
  });

  test('composes 2+ change-emitting providers into one token that fires on any inner change', () => {
    const firstToken = new TestChangeToken();
    const secondToken = new TestChangeToken();
    const provider = new CompositeFileProvider(
      new WatchOnlyProvider(firstToken),
      new WatchOnlyProvider(NullChangeToken.singleton),
      new WatchOnlyProvider(secondToken),
    );

    const composite = provider.watch('**/*.txt');
    expect(composite).toBeInstanceOf(CompositeChangeToken);
    // Null tokens are excluded from the composition.
    expect((composite as CompositeChangeToken).changeTokens).toEqual([firstToken, secondToken]);

    let calls = 0;
    composite.registerChangeCallback(() => {
      calls++;
    });

    expect(composite.hasChanged).toBe(false);

    secondToken.fire();
    expect(calls).toBe(1);
    expect(composite.hasChanged).toBe(true);
  });
});
