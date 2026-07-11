// Behavior tests for Options<T> -- the collapsed accessor (docs/decisions.md
// §4.2). `Options.of` is a static snapshot; `Options.watch` is the reactive
// form.
//
// `Options.watch`'s produceToken is re-invoked after every fire (see
// @rhombus-std/primitives' ChangeToken.onChange), and a token producer that
// keeps handing back the SAME already-aborted signal fires synchronously
// forever (documented in primitives' README). `manualReloadSource` below
// mimics a real reload-capable source: firing a change rotates in a fresh
// AbortController before aborting the old one, so the next produceToken()
// call -- made during the fire itself -- observes a live, not-yet-aborted
// signal.

import { Options } from '@rhombus-std/options/internal/options';
import { CancellationChangeToken } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** A manually-fired reload source, backed by a real CancellationChangeToken. */
function manualReloadSource() {
  let controller = new AbortController();
  return {
    produceToken: () => new CancellationChangeToken(controller.signal),
    fire(): void {
      const previous = controller;
      controller = new AbortController();
      previous.abort();
    },
  };
}

describe('Options.of', () => {
  test('value is a static snapshot', () => {
    const options = Options.of({ port: 8080 });
    expect(options.value).toEqual({ port: 8080 });
  });

  test('subscribe is absent', () => {
    const options = Options.of(1);
    expect(options.subscribe).toBeUndefined();
  });
});

describe('Options.watch', () => {
  test('value re-reads getValue on every access', () => {
    let port = 8080;
    const options = Options.watch(() => ({ port }), () => undefined);

    expect(options.value).toEqual({ port: 8080 });
    port = 9090;
    expect(options.value).toEqual({ port: 9090 });
  });

  test('subscribe fires the listener with the new value when the injected change token fires', () => {
    let port = 8080;
    const source = manualReloadSource();
    const options = Options.watch(() => ({ port }), source.produceToken);

    const seen: number[] = [];
    const registration = options.subscribe!((value) => seen.push(value.port));

    expect(seen).toEqual([]);
    port = 9090;
    source.fire();

    expect(seen).toEqual([9090]);
    registration[Symbol.dispose]();
  });

  test('subscribe re-registers against the next token, so a second fire is also observed', () => {
    let port = 8080;
    const source = manualReloadSource();
    const options = Options.watch(() => ({ port }), source.produceToken);

    const seen: number[] = [];
    const registration = options.subscribe!((value) => seen.push(value.port));

    port = 9090;
    source.fire();
    expect(seen).toEqual([9090]);

    port = 1234;
    source.fire();
    expect(seen).toEqual([9090, 1234]);

    registration[Symbol.dispose]();
  });

  test('disposing the subscription stops further notifications', () => {
    let port = 8080;
    const source = manualReloadSource();
    const options = Options.watch(() => ({ port }), source.produceToken);

    const seen: number[] = [];
    const registration = options.subscribe!((value) => seen.push(value.port));
    registration[Symbol.dispose]();

    port = 9090;
    source.fire();

    expect(seen).toEqual([]);
  });
});
