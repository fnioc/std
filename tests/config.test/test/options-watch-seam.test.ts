// End-to-end proof of the #40 seam: @rhombus-std/config's getReloadToken()
// feeds @rhombus-std/options' Options.watch() directly -- config.reload()
// (or a provider-driven refresh) is observable through a plain Options<T>
// subscription, with no config-specific glue in `options` itself.

import { ConfigurationBuilder, type IConfigurationRoot } from '@rhombus-std/config';
import { Options, type Options as OptionsType } from '@rhombus-std/options';
import { describe, expect, test } from 'bun:test';

function watchPort(root: IConfigurationRoot): OptionsType<number | undefined> {
  return Options.watch(
    () => root.getNum('Server:Port'),
    () => root.getReloadToken(),
  );
}

describe('config.getReloadToken() -> Options.watch', () => {
  test('value re-reads the live configuration on every access', () => {
    const root = new ConfigurationBuilder()
      .addInMemoryCollection({ 'Server:Port': '8080' })
      .build() as unknown as IConfigurationRoot;
    const options = watchPort(root);

    expect(options.value).toBe(8080);

    root.set('Server:Port', '9090');
    expect(options.value).toBe(9090);
  });

  test('subscribe fires when root.reload() runs, observing the reloaded value', () => {
    const data = { 'Server:Port': '8080' };
    const root = new ConfigurationBuilder()
      .addInMemoryCollection(data)
      .build() as unknown as IConfigurationRoot;
    const options = watchPort(root);

    const seen: (number | undefined)[] = [];
    const registration = options.subscribe!((value) => seen.push(value));

    // A real reload-capable provider would refresh `data` out-of-band before
    // root.reload() re-reads it; the in-memory provider has no independent
    // source to re-read from, so mutate the provider directly (root.set)
    // ahead of reload() to exercise the same "reload -> re-read" path.
    root.set('Server:Port', '9090');
    root.reload();

    expect(seen).toEqual([9090]);

    registration[Symbol.dispose]();
  });

  test('keeps observing across multiple reloads (re-subscribes via ChangeToken.onChange)', () => {
    const root = new ConfigurationBuilder()
      .addInMemoryCollection({ 'Server:Port': '8080' })
      .build() as unknown as IConfigurationRoot;
    const options = watchPort(root);

    const seen: (number | undefined)[] = [];
    const registration = options.subscribe!((value) => seen.push(value));

    root.set('Server:Port', '9090');
    root.reload();
    root.set('Server:Port', '1234');
    root.reload();

    expect(seen).toEqual([9090, 1234]);

    registration[Symbol.dispose]();
  });
});
