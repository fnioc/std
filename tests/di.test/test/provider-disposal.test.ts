// Behaviour tests for provider disposal: idempotent in both forms, free when nothing subscribed,
// and the subscription seam telling each subscriber once, most recent first, through whichever
// form the holder used — per provider, never across siblings.

import { ServiceProvider } from '@rhombus-std/di/private/ServiceProvider';
import { describe, expect, test } from 'bun:test';

/** A subscriber logging which form reached it. */
function subscriber(label: string, log: string[]): Disposable & AsyncDisposable {
  return {
    [Symbol.dispose]: () => {
      log.push(`sync:${label}`);
    },
    [Symbol.asyncDispose]: async () => {
      log.push(`async:${label}`);
    },
  };
}

describe('provider disposal', () => {
  test('a provider nobody subscribed on disposes for free, in either form, repeatedly', async () => {
    const provider = new ServiceProvider(() => undefined);

    provider[Symbol.dispose]();
    provider[Symbol.dispose]();
    await provider[Symbol.asyncDispose]();
  });

  test('sync disposal tells each subscriber once, most recent first, through the sync form', () => {
    const log: string[] = [];
    const provider = new ServiceProvider(() => undefined);
    provider.whenDisposed(subscriber('first', log));
    provider.whenDisposed(subscriber('second', log));

    provider[Symbol.dispose]();
    expect(log).toEqual(['sync:second', 'sync:first']);
  });

  test('async disposal awaits the async form, most recent first', async () => {
    const log: string[] = [];
    const provider = new ServiceProvider(() => undefined);
    provider.whenDisposed(subscriber('first', log));
    provider.whenDisposed(subscriber('second', log));

    await provider[Symbol.asyncDispose]();
    expect(log).toEqual(['async:second', 'async:first']);
  });

  test('a second disposal tells nobody again, whatever the forms', async () => {
    const log: string[] = [];
    const provider = new ServiceProvider(() => undefined);
    provider.whenDisposed(subscriber('a', log));

    provider[Symbol.dispose]();
    provider[Symbol.dispose]();
    await provider[Symbol.asyncDispose]();
    expect(log).toEqual(['sync:a']);
  });

  test("the seam is per provider: a sibling's disposal never reaches it", () => {
    const log: string[] = [];
    const source = () => undefined;
    const one = new ServiceProvider(source);
    const other = new ServiceProvider(source);
    one.whenDisposed(subscriber('one', log));

    other[Symbol.dispose]();
    expect(log).toEqual([]);

    one[Symbol.dispose]();
    expect(log).toEqual(['sync:one']);
  });

  test('a `using` block disposes the provider on exit', () => {
    const log: string[] = [];
    {
      using provider = new ServiceProvider(() => undefined);
      provider.whenDisposed(subscriber('a', log));
      expect(log).toEqual([]);
    }
    expect(log).toEqual(['sync:a']);
  });

  test('an `await using` block disposes through the async form', async () => {
    const log: string[] = [];
    {
      await using provider = new ServiceProvider(() => undefined);
      provider.whenDisposed(subscriber('a', log));
    }
    expect(log).toEqual(['async:a']);
  });
});
